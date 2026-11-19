import { useEffect, useMemo, useRef, useState } from 'react';
import {
  BrainCircuit, CalendarDays, CloudUpload, FileImage, Folder, Image as ImageIcon,
  LoaderCircle, Pencil, Search, Send, Sparkles, Trash2, ZoomIn,
} from 'lucide-react';
import { BlobImage, Button, Chip, ConfirmModal, EmptyState, Field, GlassCard, IconButton, Modal, SectionHeader, Segmented } from '../../components/ui';
import { useStore } from '../../state/store';
import { useToast } from '../../state/toast';
import { useQuickAdd } from '../../lib/quickAdd';
import { upsertMemory } from '../../lib/memory';
import { USE_PROXY } from '../../data/defaults';
import { analyzeImage } from '../../lib/ai';
import { getBlob, putBlob } from '../../lib/imageStore';
import { removeImageBlob } from '../../lib/backup';
import { formatBytes, shortDate, uid } from '../../lib/utils';
import type { StudyImage } from '../../types';
import type { SectionId } from '../../types';

type ViewMode = 'grid' | 'list';

export function Library({ onNavigate }: { onNavigate: (s: SectionId) => void }) {
  const { state, update } = useStore();
  const toast = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const dragDepth = useRef(0);
  const [dragging, setDragging] = useState(false);
  const [pending, setPending] = useState<File[]>([]);
  const [uploadSubject, setUploadSubject] = useState('');
  const [uploadNotes, setUploadNotes] = useState('');
  const [uploadTags, setUploadTags] = useState('');
  const [uploading, setUploading] = useState(false);
  const [query, setQuery] = useState('');
  const [subjectFilter, setSubjectFilter] = useState('all');
  const [mode, setMode] = useState<ViewMode>('grid');
  const [preview, setPreview] = useState<StudyImage | null>(null);
  const [editing, setEditing] = useState<StudyImage | null>(null);
  const [deleting, setDeleting] = useState<StudyImage | null>(null);
  const [analyzing, setAnalyzing] = useState<string | null>(null);

  useQuickAdd('image', () => inputRef.current?.click());

  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const files = Array.from(e.clipboardData?.files || []).filter((f) => f.type.startsWith('image/'));
      if (files.length && (e.target as HTMLElement)?.tagName !== 'INPUT' && (e.target as HTMLElement)?.tagName !== 'TEXTAREA') {
        openPending(files);
      }
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  });

  const openPending = (files: File[]) => {
    const valid = files.filter((f) => f.type.startsWith('image/')).slice(0, 12);
    if (!valid.length) { toast('error', 'Archivo no compatible', 'Selecciona imágenes JPG, PNG, WEBP, GIF o SVG.'); return; }
    setPending(valid);
    setUploadSubject(state.subjects[0]?.id || '');
    setUploadNotes('');
    setUploadTags('');
  };

  const commitUpload = async () => {
    if (!pending.length) return;
    setUploading(true);
    const added: StudyImage[] = [];
    try {
      for (const file of pending) {
        const blobKey = `img-${uid()}`;
        await putBlob(blobKey, file);
        added.push({
          id: uid(), blobKey, subjectId: uploadSubject, name: file.name || `apunte-${Date.now()}.png`,
          mime: file.type || 'image/png', size: file.size, createdAt: new Date().toISOString(),
          notes: uploadNotes.trim(), tags: uploadTags.split(',').map((t) => t.trim()).filter(Boolean), aiSummary: '', sentToAi: false,
        });
      }
      update((d) => { d.images = [...added, ...d.images]; });
      toast('success', `${added.length === 1 ? 'Apunte subido' : `${added.length} apuntes subidos`}`, uploadSubject ? 'Vinculado a la materia elegida.' : 'Recuerda asignar una materia para organizarlo mejor.');
      setPending([]);
      // La IA se "empapa" automáticamente: analiza cada página y la graba en su memoria.
      if (state.settings.autoAbsorb && (state.settings.apiKey.trim() || USE_PROXY)) {
        for (const img of added) {
          setAnalyzing(img.id);
          try {
            const blob = await getBlob(img.blobKey);
            if (!blob) continue;
            const summary = await analyzeImage(state.settings, blob, img.name);
            update((d) => { upsertMemory(d, img, summary); });
          } catch (e) {
            toast('warning', 'No se pudo analizar una página', `${img.name}: ${e instanceof Error ? e.message : 'revisa la clave o el modelo'}. Puedes pulsar “Absorber con IA” más tarde.`);
          } finally { setAnalyzing(null); }
        }
        toast('success', 'Memoria de la IA actualizada', 'Tus nuevas páginas ya se recuerdan en el chat y en la Biblioteca.');
      }
    } catch (e) {
      console.error(e);
      toast('error', 'No se pudo guardar la imagen', 'Puede que el navegador esté sin espacio. Prueba con archivos más pequeños.');
    } finally { setUploading(false); }
  };

  const absorb = async (img: StudyImage) => {
    if (!state.settings.apiKey.trim() && !USE_PROXY) {
      toast('error', 'Falta la API Key', 'Añádela en Ajustes → Inteligencia Artificial para que la IA pueda leer tus apuntes.');
      return;
    }
    setAnalyzing(img.id);
    try {
      const blob = await getBlob(img.blobKey);
      if (!blob) throw new Error('No se encontró el archivo en el almacenamiento local.');
      const summary = await analyzeImage(state.settings, blob, img.name);
      update((d) => { upsertMemory(d, img, summary); });
      toast('success', 'Apunte absorbido por la IA', `“${img.name}” ya es un recuerdo permanente: la IA lo usará en el chat sin que lo adjuntes.`);
    } catch (e) {
      toast('error', 'No se pudo analizar la imagen', e instanceof Error ? e.message : 'Revisa tu clave, el modelo y la conexión.');
    } finally { setAnalyzing(null); }
  };

  const sendToChat = (img: StudyImage) => {
    onNavigate('chat');
    window.setTimeout(() => window.dispatchEvent(new CustomEvent('msc:chat-attach', { detail: img.id })), 90);
  };

  const saveEdit = () => {
    if (!editing) return;
    update((d) => { const i = d.images.findIndex((x) => x.id === editing.id); if (i >= 0) d.images[i] = editing; });
    setEditing(null);
    toast('success', 'Apunte actualizado');
  };

  const previewUrls = useMemo(() => pending.map((f) => URL.createObjectURL(f)), [pending]);
  useEffect(() => () => { previewUrls.forEach((u) => URL.revokeObjectURL(u)); }, [previewUrls]);
  const folders = useMemo(() => Array.from(new Set(state.subjects.map((s) => s.folder).filter(Boolean))), [state.subjects]);
  const visible = state.images.filter((img) => {
    if (subjectFilter !== 'all' && img.subjectId !== subjectFilter) return false;
    const q = query.toLowerCase();
    return !q || img.name.toLowerCase().includes(q) || img.notes.toLowerCase().includes(q) || img.tags.join(' ').toLowerCase().includes(q) || img.aiSummary.toLowerCase().includes(q);
  });
  const absorbed = state.images.filter((i) => i.aiSummary).length;

  return (
    <div className="view">
      <SectionHeader eyebrow="Memoria de temas" title="Fotos y apuntes" description="Aquí es el ÚNICO sitio donde subes las fotos de tu cuaderno. La IA las analiza y las recuerda en el chat y en la Biblioteca." actions={<>
        <Button icon={<Sparkles size={16} />} onClick={() => onNavigate('biblioteca')}>Ver biblioteca</Button>
        <Button variant="primary" icon={<CloudUpload size={16} />} onClick={() => inputRef.current?.click()}>Subir imágenes</Button>
      </>} />

      <div className="library-info glass">
        <div className="library-info__icon"><BrainCircuit size={22} /></div>
        <div><strong>Memoria de la IA: {state.memories.length} páginas recordadas ({absorbed} de {state.images.length} analizadas)</strong><span>Cada resumen queda guardado como recuerdo permanente y se incluye en TODAS las conversaciones del chat, sin necesidad de volver a adjuntar la foto. {state.settings.autoAbsorb ? 'El análisis automático está activado.' : 'Activa el análisis automático en Ajustes.'}</span></div>
        <Button size="sm" onClick={() => onNavigate('chat')}>Ir al chat <Send size={14} /></Button>
      </div>

      <input ref={inputRef} type="file" accept="image/*" multiple hidden onChange={(e) => { openPending(Array.from(e.target.files || [])); e.target.value = ''; }} />

      <div
        className={`dropzone glass ${dragging ? 'is-dragging' : ''}`}
        onDragEnter={(e) => { e.preventDefault(); dragDepth.current++; setDragging(true); }}
        onDragOver={(e) => e.preventDefault()}
        onDragLeave={(e) => { e.preventDefault(); dragDepth.current--; if (dragDepth.current <= 0) { dragDepth.current = 0; setDragging(false); } }}
        onDrop={(e) => { e.preventDefault(); dragDepth.current = 0; setDragging(false); openPending(Array.from(e.dataTransfer.files || [])); }}
        onClick={() => inputRef.current?.click()} role="button" tabIndex={0}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') inputRef.current?.click(); }}
      >
        <div className="dropzone__icon"><CloudUpload size={30} /></div>
        <h3>Arrastra aquí tus apuntes o haz clic para elegir</h3>
        <p>Fotos de páginas, esquemas, ejercicios, capturas… También puedes pegar con Ctrl+V. Máx. 12 imágenes por lote.</p>
        <span className="dropzone__formats">JPG · PNG · WEBP · GIF · SVG</span>
      </div>

      <div className="toolbar glass">
        <Search size={16} className="toolbar__icon" />
        <input className="input input--bare" placeholder="Buscar por nombre, nota, etiqueta o contenido analizado…" value={query} onChange={(e) => setQuery(e.target.value)} />
        <select className="select select--compact" value={subjectFilter} onChange={(e) => setSubjectFilter(e.target.value)} aria-label="Filtrar por materia">
          <option value="all">Todas las materias</option>
          {state.subjects.map((s) => <option key={s.id} value={s.id}>{s.icon} {s.name}</option>)}
          <option value="">Sin materia</option>
        </select>
        <Segmented value={mode} onChange={setMode} options={[{ value: 'grid', label: 'Cuadrícula' }, { value: 'list', label: 'Lista' }]} />
      </div>

      {folders.length > 0 && <div className="folder-row">{folders.map((f) => <Chip key={f} onClick={() => setSubjectFilter(state.subjects.find((s) => s.folder === f)?.id || 'all')}><Folder size={12} /> {f}</Chip>)}</div>}

      {visible.length === 0 ? (
        <GlassCard><EmptyState icon={<ImageIcon size={28} />} title={state.images.length ? 'No hay apuntes con ese filtro' : 'Tu biblioteca está vacía'} description={state.images.length ? 'Prueba con otra búsqueda o cambia la materia.' : 'Sube la primera página de tu cuaderno para empezar a construir tu memoria de temas.'} /></GlassCard>
      ) : (
        <div className={`image-grid ${mode === 'list' ? 'image-grid--list' : ''}`}>
          {visible.map((img) => {
            const sub = state.subjects.find((s) => s.id === img.subjectId);
            const busy = analyzing === img.id;
            return (
              <GlassCard key={img.id} className="image-card">
                <button className="image-card__preview" onClick={() => setPreview(img)} aria-label={`Ampliar ${img.name}`}>
                  <BlobImage blobKey={img.blobKey} alt={img.name} />
                  <span className="image-card__zoom"><ZoomIn size={18} /></span>
                </button>
                <div className="image-card__body">
                  <div className="image-card__title"><FileImage size={15} /><strong title={img.name}>{img.name}</strong></div>
                  <div className="image-card__meta">
                    <Chip color={sub?.color}>{sub ? `${sub.icon} ${sub.name}` : 'Sin materia'}</Chip>
                    <span><CalendarDays size={12} /> {shortDate(new Date(img.createdAt))} · {formatBytes(img.size)}</span>
                  </div>
                  {img.notes && <p className="image-card__notes">{img.notes}</p>}
                  {img.tags.length > 0 && <div className="image-card__tags">{img.tags.map((t) => <span key={t}>#{t}</span>)}</div>}
                  {img.aiSummary && <div className="image-card__ai"><Sparkles size={13} /><span>{img.aiSummary.slice(0, 130)}{img.aiSummary.length > 130 ? '…' : ''}</span></div>}
                  <div className="image-card__actions">
                    <Button size="sm" variant={img.aiSummary ? 'glass' : 'primary'} icon={busy ? <LoaderCircle size={13} className="spin" /> : <Sparkles size={13} />} disabled={busy} onClick={() => void absorb(img)}>{busy ? 'Analizando…' : img.aiSummary ? 'Reabsorber' : 'Absorber con IA'}</Button>
                    <IconButton label="Enviar al chat" onClick={() => sendToChat(img)}><Send size={15} /></IconButton>
                    <IconButton label="Editar apunte" onClick={() => setEditing({ ...img })}><Pencil size={15} /></IconButton>
                    <IconButton label="Eliminar apunte" onClick={() => setDeleting(img)}><Trash2 size={15} /></IconButton>
                  </div>
                </div>
              </GlassCard>
            );
          })}
        </div>
      )}

      <Modal open={pending.length > 0} onClose={() => !uploading && setPending([])} title={`Vincular ${pending.length === 1 ? 'apunte' : `${pending.length} apuntes`}`} subtitle="Asigna una materia (y su carpeta) para que la IA sepa de qué trata cada página." footer={<>
        <Button variant="ghost" onClick={() => setPending([])} disabled={uploading}>Cancelar</Button>
        <Button variant="primary" icon={uploading ? <LoaderCircle size={15} className="spin" /> : <CloudUpload size={15} />} disabled={uploading} onClick={() => void commitUpload()}>{uploading ? 'Guardando…' : 'Guardar en mi biblioteca'}</Button>
      </>}>
        <div className="upload-preview">{pending.map((f, i) => <div key={i} className="upload-preview__item"><img src={previewUrls[i]} alt={f.name} /><span title={f.name}>{f.name}</span><small>{formatBytes(f.size)}</small></div>)}</div>
        <Field label="Materia / carpeta"><select className="select" value={uploadSubject} onChange={(e) => setUploadSubject(e.target.value)}><option value="">Sin asignar</option>{state.subjects.map((s) => <option key={s.id} value={s.id}>{s.icon} {s.name} · {s.folder || 'Sin carpeta'}</option>)}</select></Field>
        <Field label="Notas rápidas" hint="Cuéntale a la IA qué contiene la página: tema, profesor, dudas…"><textarea className="textarea" rows={2} value={uploadNotes} onChange={(e) => setUploadNotes(e.target.value)} placeholder="Ej. Apuntes de la clase de integrales, ejercicios 1 a 8" /></Field>
        <Field label="Etiquetas (separadas por comas)"><input className="input" value={uploadTags} onChange={(e) => setUploadTags(e.target.value)} placeholder="examen, fórmulas, repaso" /></Field>
        {state.subjects.length === 0 && <p className="field__hint">Aún no hay materias: crea una en “Materias y tareas” para organizar mejor tus apuntes.</p>}
      </Modal>

      <Modal open={Boolean(preview)} onClose={() => setPreview(null)} title={preview?.name || 'Vista previa'} subtitle={preview ? `${state.subjects.find((s) => s.id === preview.subjectId)?.name || 'Sin materia'} · ${shortDate(new Date(preview.createdAt))}` : ''} size="lg" footer={<>
        {preview && <Button size="sm" icon={<Send size={14} />} onClick={() => { sendToChat(preview); setPreview(null); }}>Enviar al chat</Button>}
        {preview && <Button size="sm" icon={<Sparkles size={14} />} onClick={() => { void absorb(preview); setPreview(null); }}>Absorber con IA</Button>}
        <Button variant="ghost" onClick={() => setPreview(null)}>Cerrar</Button>
      </>}>
        {preview && <>
          <div className="lightbox"><BlobImage blobKey={preview.blobKey} alt={preview.name} /></div>
          {preview.notes && <p className="muted">{preview.notes}</p>}
          {preview.aiSummary && <div className="lightbox__ai"><Sparkles size={15} /><div><strong>Resumen de la IA (contexto del chat)</strong><p>{preview.aiSummary}</p></div></div>}
        </>}
      </Modal>

      <Modal open={Boolean(editing)} onClose={() => setEditing(null)} title="Editar apunte" footer={<><Button variant="ghost" onClick={() => setEditing(null)}>Cancelar</Button><Button variant="primary" onClick={saveEdit}>Guardar cambios</Button></>}>
        {editing && <>
          <Field label="Nombre"><input className="input" value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} /></Field>
          <Field label="Materia"><select className="select" value={editing.subjectId} onChange={(e) => setEditing({ ...editing, subjectId: e.target.value })}><option value="">Sin asignar</option>{state.subjects.map((s) => <option key={s.id} value={s.id}>{s.icon} {s.name}</option>)}</select></Field>
          <Field label="Notas rápidas"><textarea className="textarea" rows={3} value={editing.notes} onChange={(e) => setEditing({ ...editing, notes: e.target.value })} /></Field>
          <Field label="Etiquetas (separadas por comas)"><input className="input" value={editing.tags.join(', ')} onChange={(e) => setEditing({ ...editing, tags: e.target.value.split(',').map((t) => t.trim()).filter(Boolean) })} /></Field>
          <Field label="Resumen de la IA (contexto)" hint="Puedes editarlo a mano aunque no tengas API Key."><textarea className="textarea" rows={5} value={editing.aiSummary} onChange={(e) => setEditing({ ...editing, aiSummary: e.target.value })} placeholder="Escribe aquí lo que la IA debe recordar de esta página…" /></Field>
        </>}
      </Modal>

      <ConfirmModal open={Boolean(deleting)} onClose={() => setDeleting(null)} onConfirm={() => {
        if (!deleting) return;
        update((d) => { d.images = d.images.filter((x) => x.id !== deleting.id); });
        void removeImageBlob(deleting.blobKey);
        toast('info', 'Apunte eliminado', 'También se borró el archivo del almacenamiento local.');
      }} title="¿Eliminar este apunte?" message="Se borrará la imagen y su resumen del contexto de la IA. Esta acción no se puede deshacer." />

    </div>
  );
}
