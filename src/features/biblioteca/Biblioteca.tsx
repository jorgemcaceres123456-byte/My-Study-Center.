import { useMemo, useState } from 'react';
import {
  BrainCircuit, Download, FileArchive, FileAudio2, FileImage, FileSpreadsheet,
  FileText, Images, Presentation, Search, Send, Sparkles, Trash2, ZoomIn,
} from 'lucide-react';
import { BlobImage, Button, Chip, ConfirmModal, EmptyState, GlassCard, IconButton, Modal, SectionHeader, Segmented, useBlobUrl } from '../../components/ui';
import { useStore } from '../../state/store';
import { useToast } from '../../state/toast';
import { deleteBlob, getBlob } from '../../lib/imageStore';
import { KIND_LABEL } from '../../lib/files';
import { allTutorMessages } from '../../lib/tutors';
import type { ID, LibraryKind } from '../../types';
import { downloadBlob, formatBytes, shortDate } from '../../lib/utils';
import type { SectionId } from '../../types';

type Source = 'apunte' | 'chat' | 'generada' | 'audio';
interface Entry {
  id: string;
  refId: string;
  name: string;
  mime: string;
  size: number;
  blobKey: string;
  kind: LibraryKind;
  source: Source;
  createdAt: string;
  sentToAi: boolean;
  summary: string;
  notes: string;
  subjectId: string | '';
  origin: 'image' | 'file' | 'message';
}

const SOURCE_LABEL: Record<Source, string> = { apunte: 'Fotos y apuntes', chat: 'Enviado al chat', generada: 'Generada por IA', audio: 'Audio del chat' };
const KIND_ICON: Record<LibraryKind, typeof FileImage> = {
  image: FileImage, pdf: FileText, docx: FileText, xlsx: FileSpreadsheet,
  pptx: Presentation, txt: FileText, audio: FileAudio2, file: FileArchive,
};

export function Biblioteca({ onNavigate, compact = false, subjectId }: { onNavigate?: (s: SectionId) => void; compact?: boolean; subjectId?: ID | '' }) {
  const { state, update } = useStore();
  const toast = useToast();
  const [filter, setFilter] = useState<'all' | 'images' | 'docs' | 'audio'>('all');
  const [query, setQuery] = useState('');
  const [preview, setPreview] = useState<Entry | null>(null);
  const [deleting, setDeleting] = useState<Entry | null>(null);

  const allMessages = useMemo(() => allTutorMessages(state), [state.tutorMessages]);
  const entries = useMemo<Entry[]>(() => {
    const fromImages: Entry[] = state.images.map((i) => ({
      id: `img-${i.id}`, refId: i.id, name: i.name, mime: i.mime, size: i.size,
      blobKey: i.blobKey, kind: 'image', source: 'apunte', createdAt: i.createdAt,
      sentToAi: i.sentToAi || Boolean(i.aiSummary), summary: i.aiSummary,
      notes: i.notes, subjectId: i.subjectId, origin: 'image',
    }));
    const fromFiles: Entry[] = state.chatFiles.map((f) => ({
      id: `file-${f.id}`, refId: f.id, name: f.name, mime: f.mime, size: f.size,
      blobKey: f.blobKey, kind: f.kind, source: f.kind === 'audio' ? 'audio' : 'chat',
      createdAt: f.createdAt, sentToAi: true, summary: f.extractedText.slice(0, 400),
      notes: f.notes, subjectId: f.subjectId, origin: 'file',
    }));
    const generated: Entry[] = allMessages.filter((m) => m.imageKey).map((m) => ({
      id: `gen-${m.id}`, refId: m.id, name: 'Imagen generada por IA', mime: 'image/png', size: 0,
      blobKey: m.imageKey!, kind: 'image', source: 'generada', createdAt: m.createdAt,
      sentToAi: false, summary: '', notes: '', subjectId: m.subjectId || '', origin: 'message',
    }));
    const audios: Entry[] = allMessages.flatMap((m) => (m.audios || []).map((a) => ({
      id: `audio-${a.id}`, refId: a.id, name: a.name, mime: a.mime, size: 0,
      blobKey: a.blobKey, kind: 'audio' as LibraryKind, source: 'audio' as Source,
      createdAt: m.createdAt, sentToAi: true, summary: a.transcript,
      notes: '', subjectId: a.subjectId || '', origin: 'message' as const,
    })));
    return [...fromImages, ...fromFiles, ...generated, ...audios].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [state.images, state.chatFiles, allMessages]);

  const visible = entries.filter((e) => {
    if (subjectId && e.subjectId !== subjectId) return false;
    if (filter === 'images' && e.kind !== 'image') return false;
    if (filter === 'docs' && !['pdf', 'docx', 'xlsx', 'pptx', 'txt', 'file'].includes(e.kind)) return false;
    if (filter === 'audio' && e.kind !== 'audio') return false;
    const q = query.toLowerCase();
    return !q || e.name.toLowerCase().includes(q) || e.summary.toLowerCase().includes(q) || e.notes.toLowerCase().includes(q);
  });

  const sendToChat = (e: Entry) => {
    onNavigate?.('chat');
    window.setTimeout(() => window.dispatchEvent(new CustomEvent('msc:chat-attach', { detail: { refId: e.refId, subjectId: e.subjectId } })), 100);
  };

  const download = async (e: Entry) => {
    const blob = await getBlob(e.blobKey).catch(() => undefined);
    if (!blob) { toast('error', 'Archivo no disponible', 'El binario ya no está en el almacenamiento local.'); return; }
    await downloadBlob(blob, e.name);
    toast('success', 'Descarga iniciada', e.name);
  };

  const remove = (e: Entry) => {
    update((d) => {
      if (e.origin === 'image') {
        d.images = d.images.filter((i) => i.id !== e.refId);
        d.memories = d.memories.filter((m) => m.imageId !== e.refId);
      } else if (e.origin === 'file') d.chatFiles = d.chatFiles.filter((f) => f.id !== e.refId);
      else if (e.kind === 'audio') Object.values(d.tutorMessages).forEach((list) => list.forEach((m) => { m.audios = m.audios?.filter((a) => a.id !== e.refId); }));
      else Object.keys(d.tutorMessages).forEach((tid) => { d.tutorMessages[tid] = d.tutorMessages[tid].filter((m) => m.id !== e.refId); });
    });
    void deleteBlob(e.blobKey).catch(() => undefined);
    toast('info', 'Archivo eliminado de la biblioteca');
  };

  const head = compact ? (
    <div className="biblio-compact-head">
      <strong>📚 Biblioteca{subjectId ? ' de esta materia' : ''}</strong><span>{visible.length} archivos · {state.memories.filter((m) => !subjectId || m.subjectId === subjectId).length} recuerdos del tutor</span>
    </div>
  ) : (
    <>
      <SectionHeader eyebrow="Historial completo" title="Biblioteca" description="Todas las imágenes y archivos que le has mandado a la IA: fotos del cuaderno, PDFs, Word, Excel, PowerPoint, audios e imágenes generadas." actions={<Button variant="primary" icon={<Images size={16} />} onClick={() => onNavigate?.('library')}>Subir fotos / apuntes</Button>} />
      <div className="library-info glass">
        <div className="library-info__icon"><BrainCircuit size={22} /></div>
        <div><strong>{state.memories.length} páginas guardadas en las memorias de los tutores</strong><span>Cada recuerdo pertenece a una sola materia: solo el tutor de esa carpeta lo ve en su chat, aunque no vuelvas a adjuntar la imagen. Puedes ver cada recuerdo en la tarjeta del archivo.</span></div>
        <Button size="sm" onClick={() => onNavigate?.('chat')}>Ir al chat <Send size={14} /></Button>
      </div>
    </>
  );

  return (
    <div className={`view biblio-view ${compact ? 'biblio-view--compact' : ''}`}>
      {head}
      <div className="toolbar glass">
        <Search size={16} className="toolbar__icon" />
        <input className="input input--bare" placeholder="Buscar por nombre, contenido o notas…" value={query} onChange={(e) => setQuery(e.target.value)} />
        <Segmented value={filter} onChange={setFilter} options={[{ value: 'all', label: 'Todo' }, { value: 'images', label: 'Imágenes' }, { value: 'docs', label: 'Documentos' }, { value: 'audio', label: 'Audios' }]} />
      </div>
      <div className="biblio-stats">
        <Chip color="#6ee7ff">{entries.length} archivos</Chip>
        <Chip color="#a78bfa">{entries.filter((e) => e.kind === 'image').length} imágenes</Chip>
        <Chip color="#7ef0c1">{entries.filter((e) => e.sentToAi).length} enviados a la IA</Chip>
        <Chip color="#ffc978">{state.memories.length} recuerdos</Chip>
      </div>

      {visible.length === 0 ? (
        <GlassCard><EmptyState icon={<Images size={28} />} title={entries.length ? 'Sin resultados' : 'La biblioteca está vacía'} description={entries.length ? 'Prueba con otra búsqueda o cambia el filtro.' : 'Sube fotos desde “Fotos y apuntes” o adjunta archivos con el botón + del chat. Todo aparecerá aquí.'} action={!compact && <Button variant="primary" onClick={() => onNavigate?.('library')}>Ir a Fotos y apuntes</Button>} /></GlassCard>
      ) : (
        <div className="biblio-grid">
          {visible.map((e) => {
            const Icon = KIND_ICON[e.kind];
            return (
              <GlassCard key={e.id} className="biblio-card">
                <button className="biblio-card__preview" onClick={() => setPreview(e)} aria-label={`Ver ${e.name}`}>
                  {e.kind === 'image' ? <BlobImage blobKey={e.blobKey} alt={e.name} /> : <span className="biblio-card__fileicon"><Icon size={30} /></span>}
                  <span className="image-card__zoom"><ZoomIn size={17} /></span>
                  <i className="biblio-card__kind">{KIND_LABEL[e.kind]}</i>
                </button>
                <div className="biblio-card__body">
                  <strong title={e.name}>{e.name}</strong>
                  <div className="biblio-card__meta"><span>{SOURCE_LABEL[e.source]}</span><span>{shortDate(new Date(e.createdAt))}{e.size ? ` · ${formatBytes(e.size)}` : ''}</span></div>
                  {e.sentToAi && <span className="biblio-card__sent"><Sparkles size={11} /> Enviado a la IA</span>}
                  {e.summary && <p className="biblio-card__summary">{e.summary.slice(0, 140)}{e.summary.length > 140 ? '…' : ''}</p>}
                  <div className="biblio-card__actions">
                    <IconButton label="Descargar" onClick={() => void download(e)}><Download size={15} /></IconButton>
                    <IconButton label="Ver contenido" onClick={() => setPreview(e)}><ZoomIn size={15} /></IconButton>
                    <IconButton label="Enviar al chat" onClick={() => sendToChat(e)}><Send size={15} /></IconButton>
                    {e.origin !== 'message' && <IconButton label="Eliminar" onClick={() => setDeleting(e)}><Trash2 size={15} /></IconButton>}
                  </div>
                </div>
              </GlassCard>
            );
          })}
        </div>
      )}

      <Modal open={Boolean(preview)} onClose={() => setPreview(null)} title={preview?.name || 'Archivo'} subtitle={preview ? `${SOURCE_LABEL[preview.source]} · ${KIND_LABEL[preview.kind]}` : ''} size="lg" footer={<>
        {preview && <Button size="sm" icon={<Download size={14} />} onClick={() => void download(preview)}>Descargar</Button>}
        {preview && <Button size="sm" icon={<Send size={14} />} onClick={() => { sendToChat(preview); setPreview(null); }}>Enviar al chat</Button>}
        <Button variant="ghost" onClick={() => setPreview(null)}>Cerrar</Button>
      </>}>
        {preview && <>
          {preview.kind === 'image' && <div className="lightbox"><BlobImage blobKey={preview.blobKey} alt={preview.name} /></div>}
          {preview.kind === 'audio' && <AudioPreview blobKey={preview.blobKey} />}
          {preview.summary && <div className="lightbox__ai"><Sparkles size={15} /><div><strong>Contenido que la IA recuerda</strong><p>{preview.summary}</p></div></div>}
          {preview.notes && <p className="muted">{preview.notes}</p>}
        </>}
      </Modal>

      <ConfirmModal open={Boolean(deleting)} onClose={() => setDeleting(null)} onConfirm={() => { if (deleting) remove(deleting); }} title="¿Eliminar este archivo?" message="Se borrará el archivo y, si es una página analizada, también su recuerdo de la memoria de la IA." />
    </div>
  );
}

function AudioPreview({ blobKey }: { blobKey: string }) {
  const { url } = useBlobUrl(blobKey);
  return url ? <audio className="biblio-audio" controls src={url} /> : <p className="muted">Cargando audio…</p>;
}
