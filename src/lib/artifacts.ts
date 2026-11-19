import { downloadBlob } from './utils';

export type ArtifactKind = 'html' | 'svg' | 'csv' | 'slides' | 'code';
export interface Artifact {
  kind: ArtifactKind;
  lang: string;
  code: string;
  label: string;
  filename: string;
}

const FENCE = /```([a-zA-Z0-9_+-]*)\s*\n?([\s\S]*?)```/g;

export function parseArtifacts(content: string): { prose: string; artifacts: Artifact[] } {
  const artifacts: Artifact[] = [];
  let i = 0;
  const prose = content.replace(FENCE, (_all, rawLang: string, code: string) => {
    const lang = (rawLang || 'txt').toLowerCase().trim();
    const clean = code.replace(/\n$/, '');
    const kind: ArtifactKind =
      lang === 'html' || lang === 'animation' ? 'html'
      : lang === 'svg' || lang === 'image' ? 'svg'
      : lang === 'csv' || lang === 'xlsx' || lang === 'excel' || lang === 'sheet' ? 'csv'
      : lang === 'slides' || lang === 'pptx' || lang === 'powerpoint' ? 'slides'
      : 'code';
    const ext: Record<ArtifactKind, string> = { html: 'html', svg: 'svg', csv: 'csv', slides: 'json', code: lang || 'txt' };
    const label: Record<ArtifactKind, string> = {
      html: lang === 'animation' ? 'Animación web' : 'Página HTML',
      svg: 'Imagen vectorial',
      csv: 'Hoja de cálculo',
      slides: 'Diapositivas',
      code: `Código ${lang}`,
    };
    i++;
    artifacts.push({ kind, lang, code: clean, label: label[kind], filename: `recurso-${i}.${ext[kind]}` });
    return `\n\n[[ARTIFACT:${i - 1}]]\n\n`;
  });
  return { prose, artifacts };
}

export function extensionFor(lang: string): string {
  const map: Record<string, string> = {
    javascript: 'js', typescript: 'ts', python: 'py', jsx: 'jsx', tsx: 'tsx',
    css: 'css', json: 'json', html: 'html', svg: 'svg', sql: 'sql', bash: 'sh', shell: 'sh',
    java: 'java', c: 'c', cpp: 'cpp', csharp: 'cs', go: 'go', rust: 'rs', markdown: 'md', md: 'md',
  };
  return map[lang] || lang || 'txt';
}

export function downloadText(code: string, filename: string, mime = 'text/plain;charset=utf-8') {
  return downloadBlob(new Blob([code], { type: mime }), filename);
}

/** Render an SVG string into a PNG (2x) and download it. */
export async function downloadSvgAsPng(code: string, filename: string): Promise<void> {
  const svgBlob = new Blob([code], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(svgBlob);
  try {
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('SVG inválido'));
      img.src = url;
    });
    const w = img.naturalWidth || 1024;
    const h = img.naturalHeight || 768;
    const canvas = document.createElement('canvas');
    canvas.width = w * 2;
    canvas.height = h * 2;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas no disponible');
    ctx.scale(2, 2);
    ctx.drawImage(img, 0, 0, w, h);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
    if (!blob) throw new Error('No se pudo crear el PNG');
    await downloadBlob(blob, filename);
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Minimal, quote-aware CSV parser. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(field.trim()); field = ''; }
    else if (c === '\n') { row.push(field.trim()); rows.push(row); row = []; field = ''; }
    else if (c !== '\r') field += c;
  }
  row.push(field.trim());
  if (row.some((v) => v !== '')) rows.push(row);
  return rows.filter((r) => r.some((v) => v !== ''));
}

export interface Slide { title: string; bullets: string[]; notes?: string }

export function parseSlides(code: string): Slide[] {
  const trimmed = code.trim();
  if (trimmed.startsWith('[')) {
    try {
      const raw = JSON.parse(trimmed) as Array<Record<string, unknown>>;
      return raw.map((s) => ({
        title: String(s.title || s.titulo || 'Diapositiva'),
        bullets: Array.isArray(s.bullets) ? (s.bullets as unknown[]).map(String) : s.body ? [String(s.body)] : [],
        notes: s.notes ? String(s.notes) : undefined,
      }));
    } catch { /* fall through to markdown-ish parsing */ }
  }
  // Fallback: sections separated by "## " or "---"
  return trimmed.split(/\n(?=##\s|#\s|---\s*$)/m).filter(Boolean).map((chunk, i) => {
    const lines = chunk.split('\n').map((l) => l.trim()).filter(Boolean);
    const title = (lines[0] || `Diapositiva ${i + 1}`).replace(/^#+\s*/, '').replace(/^-+$/, `Diapositiva ${i + 1}`);
    const bullets = lines.slice(1).map((l) => l.replace(/^[-*•]\s*/, '').replace(/^#+\s*/, '')).filter((l) => l && !/^-+$/.test(l));
    return { title, bullets };
  });
}

/** Real .xlsx, generated lazily so the main bundle stays light. */
export async function exportXlsx(csv: string, filename: string): Promise<void> {
  const XLSX = await import('xlsx');
  const data = parseCsv(csv);
  if (!data.length) throw new Error('La tabla está vacía');
  const sheet = XLSX.utils.aoa_to_sheet(data);
  sheet['!cols'] = data[0].map((_, i) => ({ wch: Math.max(14, ...data.map((r) => String(r[i] || '').length + 2)) }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, sheet, 'Datos');
  XLSX.writeFile(wb, filename.replace(/\.csv$/i, '.xlsx'));
}

/** Real .pptx, generated lazily. */
export async function exportPptx(slides: Slide[], filename: string): Promise<void> {
  const mod = await import('pptxgenjs');
  const PptxGenJS = (mod.default || mod) as typeof import('pptxgenjs').default;
  const pptx = new PptxGenJS();
  pptx.layout = 'LAYOUT_WIDE';
  pptx.author = 'My Study Center';
  pptx.subject = 'Guía de estudio generada con IA';
  pptx.title = 'Presentación de estudio';
  for (const [i, s] of slides.entries()) {
    const slide = pptx.addSlide();
    slide.background = { color: i === 0 ? '101A38' : '0B1020' };
    slide.addShape('rect', { x: 0, y: 0, w: 13.33, h: 0.12, fill: { color: '6EE7FF' } });
    slide.addText(`My Study Center  ·  ${String(i + 1).padStart(2, '0')}`, { x: 0.7, y: 0.35, w: 6, h: 0.3, fontSize: 11, color: '8FA3C8', charSpacing: 2 });
    slide.addText(s.title, { x: 0.7, y: 0.9, w: 11.9, h: 1.1, fontSize: 32, bold: true, color: 'F4F7FF', breakLine: false });
    if (s.bullets.length) {
      slide.addText(s.bullets.map((b) => ({ text: b, options: { bullet: true, breakLine: true, fontSize: 19, color: 'DCE7FF' } })), {
        x: 0.9, y: 2.2, w: 11.5, h: 4.3, valign: 'top', lineSpacingMultiple: 1.25,
      });
    }
    if (s.notes) slide.addNotes(s.notes);
  }
  await pptx.writeFile({ fileName: filename.replace(/\.json$/i, '.pptx') });
}
