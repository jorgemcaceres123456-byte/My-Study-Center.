import type { LibraryKind } from '../types';
// El worker se registra como asset (no se descarga hasta que se abre un PDF).
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

const VIDEO_EXT = /\.(mp4|webm|mov|avi|mkv|m4v|3gp|ogv|wmv|flv|mpeg|mpg|ts|m2ts)$/i;
const TEXT_EXT = /\.(txt|md|markdown|csv|json|jsonl|js|jsx|ts|tsx|py|java|c|cpp|h|cs|go|rs|rb|php|css|scss|html|htm|xml|yaml|yml|toml|sql|log|tex|svg)$/i;
const MAX_TEXT = 24000;

export const isVideo = (f: File) => f.type.startsWith('video/') || VIDEO_EXT.test(f.name);
export const isImage = (f: File) => f.type.startsWith('image/') || /\.(png|jpe?g|webp|gif|svg|bmp|avif|heic)$/i.test(f.name);
export const isAudio = (f: File) => f.type.startsWith('audio/') || /\.(mp3|wav|m4a|ogg|opus|aac|flac|webm)$/i.test(f.name);

export function kindOf(f: File): LibraryKind {
  if (isImage(f)) return 'image';
  if (isAudio(f)) return 'audio';
  const n = f.name.toLowerCase();
  if (/\.pdf$/.test(n) || f.type === 'application/pdf') return 'pdf';
  if (/\.docx?$/.test(n) || /wordprocessingml/.test(f.type)) return 'docx';
  if (/\.(xlsx|xls|ods)$/.test(n) || /spreadsheetml/.test(f.type)) return 'xlsx';
  if (/\.pptx?$/.test(n) || /presentationml/.test(f.type)) return 'pptx';
  if (TEXT_EXT.test(n) || f.type.startsWith('text/')) return 'txt';
  return 'file';
}

export const isAudioKind = (k: LibraryKind) => k === 'audio';

export const KIND_LABEL: Record<LibraryKind, string> = {
  image: 'Imagen', pdf: 'PDF', docx: 'Word', xlsx: 'Excel', pptx: 'Presentación',
  txt: 'Texto / código', audio: 'Audio', file: 'Archivo',
};

const decodeEntities = (s: string) =>
  s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
   .replace(/&quot;/g, '"').replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));

/** Extrae el texto legible de casi cualquier archivo (nunca videos). */
export async function extractText(file: File, kind: LibraryKind): Promise<string> {
  if (isVideo(file)) return '';
  try {
    if (kind === 'txt' || kind === 'file') {
      // Los binarios desconocidos no se intentan leer como texto.
      if (kind === 'file' && !/^text\//.test(file.type) && !TEXT_EXT.test(file.name)) return '';
      return (await file.text()).slice(0, MAX_TEXT);
    }
    if (kind === 'pdf') {
      const pdfjs = await import('pdfjs-dist');
      pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
      const data = new Uint8Array(await file.arrayBuffer());
      const doc = await pdfjs.getDocument({ data, useSystemFonts: true }).promise;
      const parts: string[] = [];
      const pages = Math.min(doc.numPages, 40);
      for (let i = 1; i <= pages; i++) {
        const page = await doc.getPage(i);
        const tc = await page.getTextContent();
        parts.push(`--- Página ${i} ---\n` + tc.items.map((it) => ('str' in it ? String(it.str) : '')).join(' '));
      }
      if (doc.numPages > pages) parts.push(`\n[Se extrajeron las primeras ${pages} de ${doc.numPages} páginas]`);
      await doc.destroy();
      return parts.join('\n').slice(0, MAX_TEXT);
    }
    if (kind === 'docx') {
      const mammoth = await import('mammoth');
      const r = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
      return String(r.value || '').slice(0, MAX_TEXT);
    }
    if (kind === 'xlsx') {
      const XLSX = await import('xlsx');
      const wb = XLSX.read(new Uint8Array(await file.arrayBuffer()), { type: 'array' });
      return wb.SheetNames.map((n) => `--- Hoja: ${n} ---\n${XLSX.utils.sheet_to_csv(wb.Sheets[n])}`).join('\n\n').slice(0, MAX_TEXT);
    }
    if (kind === 'pptx') {
      const JSZip = (await import('jszip')).default;
      const zip = await JSZip.loadAsync(await file.arrayBuffer());
      const slides = Object.keys(zip.files).filter((n) => /^ppt\/slides\/slide\d+\.xml$/i.test(n)).sort();
      const parts: string[] = [];
      for (const name of slides.slice(0, 40)) {
        const xml = await zip.files[name].async('string');
        const texts = [...xml.matchAll(/<a:t>([\s\S]*?)<\/a:t>/g)].map((m) => decodeEntities(m[1].replace(/<[^>]+>/g, '')));
        parts.push(`--- ${name.split('/').pop()} ---\n${texts.join('\n')}`);
      }
      return parts.join('\n').slice(0, MAX_TEXT);
    }
    return '';
  } catch (e) {
    console.warn('No se pudo extraer texto de', file.name, e);
    return `[No se pudo extraer el texto de "${file.name}": ${e instanceof Error ? e.message : 'formato no soportado'}. El archivo se guardó igual en la biblioteca.]`;
  }
}

/** Reduce una imagen antes de enviarla a un modelo con visión. */
export async function resizeBlobForVision(blob: Blob, maxSide = 1400, quality = 0.82): Promise<Blob> {
  if (!blob.type.startsWith('image/') || /svg|gif/i.test(blob.type)) return blob;
  if (blob.size < 350_000) return blob;
  try {
    const url = URL.createObjectURL(blob);
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const im = new Image();
      im.onload = () => resolve(im);
      im.onerror = () => reject(new Error('imagen ilegible'));
      im.src = url;
    });
    const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('canvas no disponible');
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const out = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
    URL.revokeObjectURL(url);
    return out && out.size < blob.size ? out : blob;
  } catch {
    return blob;
  }
}
