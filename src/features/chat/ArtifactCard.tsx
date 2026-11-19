import { useMemo, useState } from 'react';
import {
  Check, ChevronLeft, ChevronRight, Code2, Copy, Download, Eye, EyeOff, FileJson2,
  FileSpreadsheet, Image as ImageIcon, LoaderCircle, MonitorPlay, Presentation,
} from 'lucide-react';
import type { Artifact } from '../../lib/artifacts';
import {
  downloadSvgAsPng, downloadText, exportPptx, exportXlsx, extensionFor, parseCsv, parseSlides,
} from '../../lib/artifacts';
import { useToast } from '../../state/toast';
import { copyText } from '../../lib/utils';
import { Button, IconButton } from '../../components/ui';

const KIND_ICON: Record<Artifact['kind'], typeof Code2> = {
  html: MonitorPlay, svg: ImageIcon, csv: FileSpreadsheet, slides: Presentation, code: Code2,
};

function wrapHtml(code: string) {
  if (/<html[\s>]/i.test(code)) return code;
  return `<!doctype html><html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><style>*{box-sizing:border-box}body{margin:0;padding:24px;background:#080c1a;color:#eef4ff;font-family:system-ui,-apple-system,Segoe UI,sans-serif}a{color:#6ee7ff}code{background:#1b2540;padding:2px 6px;border-radius:6px}</style></head><body>${code}</body></html>`;
}

export function ArtifactCard({ artifact }: { artifact: Artifact }) {
  const toast = useToast();
  const [preview, setPreview] = useState(true);
  const [busy, setBusy] = useState('');
  const [copied, setCopied] = useState(false);
  const [slideIdx, setSlideIdx] = useState(0);
  const Icon = KIND_ICON[artifact.kind];
  const rows = useMemo(() => artifact.kind === 'csv' ? parseCsv(artifact.code) : [], [artifact]);
  const slides = useMemo(() => artifact.kind === 'slides' ? parseSlides(artifact.code) : [], [artifact]);
  const svgUrl = useMemo(() => artifact.kind === 'svg' ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(artifact.code)}` : '', [artifact]);

  const run = async (key: string, fn: () => Promise<void> | void, okMsg: string) => {
    setBusy(key);
    try { await fn(); toast('success', okMsg); }
    catch (e) { toast('error', 'No se pudo completar la descarga', e instanceof Error ? e.message : 'Inténtalo de nuevo.'); }
    finally { setBusy(''); }
  };
  const copy = async () => {
    const ok = await copyText(artifact.code);
    setCopied(ok);
    if (ok) window.setTimeout(() => setCopied(false), 1800);
    toast(ok ? 'success' : 'error', ok ? 'Copiado al portapapeles' : 'No se pudo copiar');
  };

  return (
    <div className="artifact glass">
      <div className="artifact__head">
        <span className="artifact__icon"><Icon size={16} /></span>
        <div className="artifact__title"><strong>{artifact.label}</strong><small>{artifact.lang.toUpperCase()} · {artifact.code.length.toLocaleString('es')} caracteres</small></div>
        <div className="artifact__head-actions">
          <IconButton label={copied ? 'Copiado' : 'Copiar contenido'} onClick={() => void copy()}>{copied ? <Check size={15} /> : <Copy size={15} />}</IconButton>
          <IconButton label={preview ? 'Ocultar vista previa' : 'Mostrar vista previa'} onClick={() => setPreview((v) => !v)}>{preview ? <EyeOff size={15} /> : <Eye size={15} />}</IconButton>
        </div>
      </div>

      {preview && (
        <div className="artifact__preview">
          {artifact.kind === 'html' && <iframe className="artifact__iframe" title="Vista previa de la animación web" srcDoc={wrapHtml(artifact.code)} sandbox="allow-scripts" loading="lazy" />}
          {artifact.kind === 'svg' && <img className="artifact__svg" src={svgUrl} alt="Imagen vectorial generada" />}
          {artifact.kind === 'csv' && (
            <div className="artifact__table-wrap"><table className="artifact__table"><thead><tr>{rows[0]?.map((c, i) => <th key={i}>{c}</th>)}</tr></thead><tbody>{rows.slice(1, 30).map((r, i) => <tr key={i}>{rows[0]?.map((_, j) => <td key={j}>{r[j] || ''}</td>)}</tr>)}</tbody></table>{rows.length > 31 && <span className="muted">Mostrando 30 de {rows.length} filas</span>}</div>
          )}
          {artifact.kind === 'slides' && slides.length > 0 && (
            <div className="slide-preview">
              <div className="slide-preview__page">
                <span className="slide-preview__brand">My Study Center · {String(slideIdx + 1).padStart(2, '0')}</span>
                <h4>{slides[slideIdx]?.title}</h4>
                <ul>{slides[slideIdx]?.bullets.map((b, i) => <li key={i}>{b}</li>)}</ul>
                {slides[slideIdx]?.notes && <small>📝 {slides[slideIdx].notes}</small>}
              </div>
              <div className="slide-preview__controls">
                <IconButton label="Diapositiva anterior" disabled={slideIdx === 0} onClick={() => setSlideIdx((i) => i - 1)}><ChevronLeft size={15} /></IconButton>
                <span>{slideIdx + 1} / {slides.length}</span>
                <IconButton label="Diapositiva siguiente" disabled={slideIdx >= slides.length - 1} onClick={() => setSlideIdx((i) => i + 1)}><ChevronRight size={15} /></IconButton>
              </div>
            </div>
          )}
          {artifact.kind === 'code' && <pre className="artifact__code"><code>{artifact.code.slice(0, 8000)}{artifact.code.length > 8000 ? '\n… (descarga el archivo para verlo completo)' : ''}</code></pre>}
        </div>
      )}

      <div className="artifact__actions">
        {artifact.kind === 'html' && <Button size="sm" variant="primary" icon={busy === 'html' ? <LoaderCircle size={14} className="spin" /> : <Download size={14} />} disabled={Boolean(busy)} onClick={() => void run('html', () => downloadText(artifact.code, 'animacion.html', 'text/html;charset=utf-8'), 'HTML descargado')}>Descargar .html</Button>}
        {artifact.kind === 'svg' && <>
          <Button size="sm" variant="primary" icon={<Download size={14} />} onClick={() => void run('svg', () => downloadText(artifact.code, 'imagen.svg', 'image/svg+xml;charset=utf-8'), 'SVG descargado')}>Descargar .svg</Button>
          <Button size="sm" icon={busy === 'png' ? <LoaderCircle size={14} className="spin" /> : <ImageIcon size={14} />} disabled={Boolean(busy)} onClick={() => void run('png', () => downloadSvgAsPng(artifact.code, 'imagen.png'), 'PNG descargado')}>Descargar .png</Button>
        </>}
        {artifact.kind === 'csv' && <>
          <Button size="sm" variant="primary" icon={busy === 'xlsx' ? <LoaderCircle size={14} className="spin" /> : <Download size={14} />} disabled={Boolean(busy)} onClick={() => void run('xlsx', () => exportXlsx(artifact.code, 'hoja-de-calculo.xlsx'), 'Excel .xlsx descargado')}>Descargar .xlsx</Button>
          <Button size="sm" icon={<FileSpreadsheet size={14} />} onClick={() => void run('csv', () => downloadText(artifact.code, 'tabla.csv', 'text/csv;charset=utf-8'), 'CSV descargado')}>.csv</Button>
        </>}
        {artifact.kind === 'slides' && <>
          <Button size="sm" variant="primary" icon={busy === 'pptx' ? <LoaderCircle size={14} className="spin" /> : <Download size={14} />} disabled={Boolean(busy)} onClick={() => void run('pptx', () => exportPptx(slides, 'presentacion.pptx'), 'PowerPoint .pptx descargado')}>Descargar .pptx</Button>
          <Button size="sm" icon={<FileJson2 size={14} />} onClick={() => void run('json', () => downloadText(artifact.code, 'diapositivas.json', 'application/json'), 'Estructura JSON descargada')}>.json</Button>
        </>}
        {artifact.kind === 'code' && <Button size="sm" variant="primary" icon={<Download size={14} />} onClick={() => void run('code', () => downloadText(artifact.code, `codigo.${extensionFor(artifact.lang)}`), 'Archivo descargado')}>Descargar .{extensionFor(artifact.lang)}</Button>}
        <span className="artifact__hint">Copiar · Previsualizar · Descargar</span>
      </div>
    </div>
  );
}
