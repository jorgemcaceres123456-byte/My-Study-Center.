import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft, BrainCircuit, CalendarDays, ChevronRight, CloudUpload, FileImage,
  Folder, GraduationCap, Image as ImageIcon, LoaderCircle, Pencil, Plus, Search,
  Send, Sparkles, Trash2, ZoomIn,
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
import { formatBytes, plural, shortDate, uid } from '../../lib/utils';
import type { SectionId, StudyImage } from '../../types';

const FOLDER_KEY = 'my-study-center:library-subject';
type ViewMode = 'grid' | 'list';

export function Library({ onNavigate }: { onNavigate: (s: SectionId) => void }) {
  const { state, update } = useStore();
  const toast = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const dragDepth = useRef(0);
  const [activeSubjectId, setActiveSubjectId] = useState<string | null>(() => localStorage.getItem(FOLDER_KEY));
  const activeSubjectRef = useRef<string | null>(activeSubjectId);
  const [pendingSubjectId, setPendingSubjectId] = useState('');
  const [dragging, setDragging] = useState(false);
  const [pending, setPending] = useState<File[]>([]);
  const [uploadNotes, setUploadNotes] = useState('');
  const [uploadTags, setUploadTags] = useState('');
  const [uploading, setUploading] = useState(false);
  const [query, setQuery] = useState('');
  const [mode, setMode] = useState<ViewMode>('grid');
  const [preview, setPreview] = useState<StudyImage | null>(null);
  const [editing, setEditing] = useState<StudyImage | null>(null);
  const [deleting, setDeleting] = useState<StudyImage | null>(null);
  const [analyzing, setAnalyzing] = useState<string | null>(null);

  const subject = state.subjects.find((s) => s.id === activeSubjectId) || null;
  const uploadSubject = state.subjects.find((s) => s.id === pendingSubjectId) || subject;
  useEffect(() => { activeSubjectRef.current = activeSubjectId; }, [activeSubjectId]);
  useEffect(() => {
    if (activeSubjectId && !state.subjects.some((s) => s.id === activeSubjectId)) setActiveSubjectId(null);
  }, [state.subjects, activeSubjectId]);

  const openSubject = (id: string | null) => {
    setActiveSubjectId(id);
    activeSubjectRef.current = id;
    if (id) localStorage.setItem(FOLDER_KEY, id); else localStorage.removeItem(FOLDER_KEY);
    setQuery('');
  };

  const openTutor = () => {
    if (!subject) return;
    onNavigate('chat');
    window.setTimeout(() => window.dispatchEvent(new CustomEvent('msc:open-tutor', { detail: subject.id })), 90);
  };

  useQuickAdd('image', () => {
    if (!state.subjects.length) { toast('info', 'Crea una materia primero', 'Las fotos se suben dentro de la carpeta de una materia.'); onNavigate('subjects'); return; }
    if (!subject) openSubject(state.subjects[0].id);
    window.setTimeout(() => inputRef.current?.click(), 40);
  });

  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const files = Array.from(e.clipboardData?.files || []).filter((f) => f.type.startsWith('image/'));
      if (!files.length || (e.target as HTMLElement)?.tagName === 'INPUT' || (e.target as HTMLElement)?.tagName === 'TEXTAREA') return;
      if (!subject) { toast('info', 'Elige una materia', 'Abre la carpeta de una materia antes de pegar fotos.'); return; }
      openPending(files);
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  });

  const openPending = (files: File[]) => {
    const valid = files.filter((f) => f.type.startsWith('image/')).slice(0, 12);
    if (!valid.length) { toast('error', 'Archivo no compatible', 'Selecciona imágenes JPG, PNG, WEBP, GIF o SVG.'); return; }
    const target = state.subjects.find((s) => s.id === activeSubjectRef.current);
    if (!target) { toast('info', 'Elige una materia', 'Abre una carpeta antes de subir fotos.'); return; }
    setPendingSubjectId(target.id);
    setPending(valid); setUploadNotes(''); setUploadTags('');
  };

  const commitUpload = async () => {
    if (!pending.length) return;
    const target = state.subjects.find((s) => s.id === pendingSubjectId);
    if (!target) { toast('error', 'Materia no disponible', 'Abre de nuevo la carpeta antes de guardar.'); return; }
    const targetId = target.id;
    const targetName = target.name;
    setUploading(true);
    const added: StudyImage[] = [];
    try {
      for (const file of pending) {
        const blobKey = `img-${uid()}`;
        await putBlob(blobKey, file);
        added.push({
          id: uid(), blobKey, subjectId: targetId, name: file.name || `apunte-${Date.now()}.png`,
          mime: file.type || 'image/png', size: file.size, createdAt: new Date().toISOString(),
          notes: uploadNotes.trim(), tags: uploadTags.split(',').map((t) => t.trim()).filter(Boolean),
          aiSummary: '', sentToAi: false,
        });
      }
      update((d) => { d.images = [...added, ...d.images]; });
      toast('success', `${plural(added.length, 'apunte subido', 'apuntes subidos')}`, `Guardado en la carpeta de ${targetName}.`);
      setPending([]);
      // Solo el TUTOR de esta materia absorberá estas páginas.
      if (state.settings.autoAbsorb && (state.settings.apiKey.trim() || USE_PROXY)) {
        for (const img of added) {
          setAnalyzing(img.id);
          try {
            const blob = await getBlob(img.blobKey);
            if (!blob) continue;
            const summary = await analyzeImage(state.settings, blob, img.name, targetName);
            update((d) => { upsertMemory(d, img, summary); });
          } catch (e) {
            toast('warning', 'No se pudo analizar una página', `${img.name}: ${e instanceof Error ? e.message : 'revisa la clave'}. Puedes pulsar “Absorber con IA” después.`);
          } finally { setAnalyzing(null); }
        }
        toast('success', 'Memoria del tutor actualizada', `Solo el Tutor de ${targetName} recordará estas páginas.`);
      }
    } catch (e) {
      console.error(e);
      toast('error', 'No se pudo guardar la imagen', 'Puede que el navegador esté sin espacio. Prueba con archivos más pequeños.');
    } finally { setUploading(false); }
  };

  const absorb = async (img: StudyImage) => {
    if (!state.settings.apiKey.trim() && !USE_PROXY) { toast('error', 'Falta la API Key', 'Añádela en Ajustes para que la IA lea tus apuntes.'); return; }
    setAnalyzing(img.id);
    try {
      const blob = await getBlob(img.blobKey);
      if (!blob) throw new Error('No se encontró el archivo en el almacenamiento local.');
      const summary = await analyzeImage(state.settings, blob, img.name, subject?.name || '');
      update((d) => { upsertMemory(d, img, summary); });
      toast('success', 'Apunte absorbido', `Solo el Tutor de ${subject?.name || 'esta materia'} recordará “${img.name}”.`);
    } catch (e) {
      toast('error', 'No se pudo analizar la imagen', e instanceof Error ? e.message : 'Revisa tu clave, el modelo y la conexión.');
    } finally { setAnalyzing(null); }
  };

  const sendToChat = (img: StudyImage) => {
    onNavigate('chat');
    window.setTimeout(() => window.dispatchEvent(new CustomEvent('msc:chat-attach', { detail: { refId: img.id, subjectId: img.subjectId } })), 90);
  };

  const saveEdit = () => {
    if (!editing) return;
    update((d) => {
      const i = d.images.findIndex((x) => x.id === editing.id);
      if (i >= 0) d.images[i] = editing;
      const mem = d.memories.find((m) => m.imageId === editing.id);
      if (mem) { mem.subjectId = editing.subjectId; mem.name = editing.name; if (editing.aiSummary) mem.summary = editing.aiSummary; }
    });
    setEditing(null);
    toast('success', 'Apunte actualizado', 'El recuerdo del tutor sigue a la materia asignada.');
  };

  const previewUrls = useMemo(() => pending.map((f) => URL.createObjectURL(f)), [pending]);
  useEffect(() => () => { previewUrls.forEach((u) => URL.revokeObjectURL(u)); }, [previewUrls]);

  const folderImages = subject ? state.images.filter((i) => i.subjectId === subject.id) : [];
  const orphanCount = state.images.filter((i) => !i.subjectId).length;
  const visible = folderImages.filter((img) => {
    const q = query.toLowerCase();
    return !q || img.name.toLowerCase().includes(q) || img.notes.toLowerCase().includes(q) || img.tags.join(' ').toLowerCase().includes(q) || img.aiSummary.toLowerCase().includes(q);
  });
  const memorized = folderImages.filter((i) => i.aiSummary).length;

  return (
    <div className="view view--library">
      <SectionHeader
        eyebrow={subject ? `Carpeta · ${subject.folder || 'Sin carpeta'}` : 'Memoria de temas por materia'}
        title={subject ? subject.name : 'Fotos y apuntes'}
        description={subject ? `Sube aquí las fotos de los temas de ${subject.name}. Solo el Tutor de ${subject.name} conocerá su contenido.` : 'Elige una materia: cada una es una carpeta donde subes las fotos de sus temas. Cada carpeta alimenta únicamente a su propio tutor de IA.'}
        actions={<>
          {subject && <Button icon={<ArrowLeft size={16} />} onClick={() => openSubject(null)}>Todas las materias</Button>}
          <Button icon={<Sparkles size={16} />} onClick={() => onNavigate('biblioteca')}>Biblioteca completa</Button>
          {subject ? <Button variant="primary" icon={<CloudUpload size={16} />} onClick={() => inputRef.current?.click()}>Subir fotos aquí</Button>
            : <Button variant="primary" icon={<Plus size={16} />} onClick={() => onNavigate('subjects')}>Nueva materia</Button>}
        </>} />

      {!subject ? (
        <>
          <div className="library-info glass"><div className="library-info__icon"><BrainCircuit size={22} /></div><div><strong>Una materia = una carpeta = un tutor IA</strong><span>Cuando creas una materia aparece aquí al instante y nace su tutor en Chat de IA. Las fotos que subas dentro de esa materia no se mezclan con las de las demás: su tutor es el único que las recuerda.</span></div><Button size="sm" onClick={openTutor} disabled={!state.subjects.length}>Ir a los tutores <ChevronRight size={14} /></Button></div>

          {state.subjects.length === 0 ? (
            <GlassCard><EmptyState icon={<Folder size={28} />} title="Aún no hay materias" description="Crea tu primera materia: aquí aparecerá su carpeta y en Chat de IA aparecerá su tutor." action={<Button variant="primary" icon={<Plus size={15} />} onClick={() => onNavigate('subjects')}>Crear materia</Button>} /></GlassCard>
          ) : (
            <div className="subject-folder-grid">
              {state.subjects.map((s) => {
                const count = state.images.filter((i) => i.subjectId === s.id).length;
                const mem = state.memories.filter((m) => m.subjectId === s.id).length;
                return (
                  <button key={s.id} className="subject-folder glass" style={{ '--folder-color': s.color } as React.CSSProperties} onClick={() => openSubject(s.id)}>
                    <span className="subject-folder__icon">{s.icon}</span>
                    <strong>{s.name}</strong>
                    <span className="subject-folder__folder"><Folder size={12} /> {s.folder || 'Sin carpeta'}</span>
                    <span className="subject-folder__meta"><span>{plural(count, 'foto', 'fotos')}</span><span><BrainCircuit size={12} /> {mem} recuerdos</span></span>
                    <em>Subir fotos de esta materia <ChevronRight size={13} /></em>
                  </button>
                );
              })}
              {orphanCount > 0 && <button className="subject-folder subject-folder--orphan glass" onClick={() => { openSubject(null); setQuery(''); }}><span className="subject-folder__icon">📥</span><strong>Sin materia</strong><span className="subject-folder__folder">{plural(orphanCount, 'foto', 'fotos')} sin asignar</span><em>Reasígnalas desde la Biblioteca</em></button>}
            </div>
          )}
        </>
      ) : (
        <>
          <div className="folder-banner glass" style={{ '--folder-color': subject.color } as React.CSSProperties}>
            <span><GraduationCap size={20} /></span>
            <div><strong>Tutor de {subject.name}</strong><span>{plural(memorized, 'página analizada', 'páginas analizadas')} en su memoria · {plural(folderImages.length, 'foto', 'fotos')} en esta carpeta. Las demás materias no aparecen en su chat.</span></div>
            <Button size="sm" onClick={openTutor}>Abrir su chat <ChevronRight size={14} /></Button>
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
            <h3>Sube fotos de los temas de {subject.name}</h3>
            <p>Arrastra aquí, haz clic o pega con Ctrl+V. Se guardarán en esta carpeta y solo su tutor las recordará. Máx. 12 imágenes por lote.</p>
            <span className="dropzone__formats">JPG · PNG · WEBP · GIF · SVG</span>
          </div>

          <div className="toolbar glass">
            <Search size={16} className="toolbar__icon" />
            <input className="input input--bare" placeholder={`Buscar en los apuntes de ${subject.name}…`} value={query} onChange={(e) => setQuery(e.target.value)} />
            <Chip color={subject.color}>{plural(visible.length, 'apunte', 'apuntes')}</Chip>
            <Segmented value={mode} onChange={setMode} options={[{ value: 'grid', label: 'Cuadrícula' }, { value: 'list', label: 'Lista' }]} />
          </div>

          {visible.length === 0 ? (
            <GlassCard><EmptyState icon={<ImageIcon size={28} />} title={folderImages.length ? 'Sin resultados' : `La carpeta de ${subject.name} está vacía`} description={folderImages.length ? 'Prueba con otra búsqueda.' : 'Sube la primera página de esta materia para alimentar a su tutor.'} action={!folderImages.length && <Button variant="primary" icon={<CloudUpload size={15} />} onClick={() => inputRef.current?.click()}>Subir fotos</Button>} /></GlassCard>
          ) : (
            <div className={`image-grid ${mode === 'list' ? 'image-grid--list' : ''}`}>
              {visible.map((img) => {
                const busy = analyzing === img.id;
                return (
                  <GlassCard key={img.id} className="image-card">
                    <button className="image-card__preview" onClick={() => setPreview(img)} aria-label={`Ampliar ${img.name}`}><BlobImage blobKey={img.blobKey} alt={img.name} /><span className="image-card__zoom"><ZoomIn size={18} /></span></button>
                    <div className="image-card__body">
                      <div className="image-card__title"><FileImage size={15} /><strong title={img.name}>{img.name}</strong></div>
                      <div className="image-card__meta"><Chip color={subject.color}>{subject.icon} {subject.name}</Chip><span><CalendarDays size={12} /> {shortDate(new Date(img.createdAt))} · {formatBytes(img.size)}</span></div>
                      {img.notes && <p className="image-card__notes">{img.notes}</p>}
                      {img.tags.length > 0 && <div className="image-card__tags">{img.tags.map((t) => <span key={t}>#{t}</span>)}</div>}
                      {img.aiSummary && <div className="image-card__ai"><Sparkles size={13} /><span>{img.aiSummary.slice(0, 130)}{img.aiSummary.length > 130 ? '…' : ''}</span></div>}
                      <div className="image-card__actions">
                        <Button size="sm" variant={img.aiSummary ? 'glass' : 'primary'} icon={busy ? <LoaderCircle size={13} className="spin" /> : <Sparkles size={13} />} disabled={busy} onClick={() => void absorb(img)}>{busy ? 'Analizando…' : img.aiSummary ? 'Reabsorber' : 'Absorber con IA'}</Button>
                        <IconButton label="Enviar al tutor" onClick={() => sendToChat(img)}><Send size={15} /></IconButton>
                        <IconButton label="Editar apunte" onClick={() => setEditing({ ...img })}><Pencil size={15} /></IconButton>
                        <IconButton label="Eliminar apunte" onClick={() => setDeleting(img)}><Trash2 size={15} /></IconButton>
                      </div>
                    </div>
                  </GlassCard>
                );
              })}
            </div>
          )}
        </>
      )}

      <Modal open={pending.length > 0} onClose={() => !uploading && setPending([])} title={`Guardar en ${uploadSubject?.name || 'la carpeta'}`} subtitle="Estas fotos quedarán vinculadas a esta materia y solo su tutor IA las recordará." footer={<>
        <Button variant="ghost" onClick={() => setPending([])} disabled={uploading}>Cancelar</Button>
        <Button variant="primary" icon={uploading ? <LoaderCircle size={15} className="spin" /> : <CloudUpload size={15} />} disabled={uploading} onClick={() => void commitUpload()}>{uploading ? 'Guardando…' : 'Guardar en esta materia'}</Button>
      </>}>
        <div className="upload-preview">{pending.map((f, i) => <div key={i} className="upload-preview__item"><img src={previewUrls[i]} alt={f.name} /><span title={f.name}>{f.name}</span><small>{formatBytes(f.size)}</small></div>)}</div>
        <Field label="Materia / carpeta" hint="Fijada a la carpeta que abriste. Para otra materia, vuelve y elige su carpeta."><input className="input" value={`${uploadSubject?.icon || ''} ${uploadSubject?.name || ''}`} readOnly /></Field>
        <Field label="Notas rápidas" hint="Cuéntale al tutor qué contiene la página: tema, profesor, dudas…"><textarea className="textarea" rows={2} value={uploadNotes} onChange={(e) => setUploadNotes(e.target.value)} placeholder="Ej. Apuntes de la clase de integrales, ejercicios 1 a 8" /></Field>
        <Field label="Etiquetas (separadas por comas)"><input className="input" value={uploadTags} onChange={(e) => setUploadTags(e.target.value)} placeholder="examen, fórmulas, repaso" /></Field>
        <div className="notice-box"><BrainCircuit size={16} /><div><strong>Memoria aislada</strong><span>Solo el Tutor de {uploadSubject?.name} recibirá estos temas. Los demás tutores no los verán nunca.</span></div></div>
      </Modal>

      <Modal open={Boolean(preview)} onClose={() => setPreview(null)} title={preview?.name || 'Vista previa'} subtitle={preview ? `${subject?.name || 'Sin materia'} · ${shortDate(new Date(preview.createdAt))}` : ''} size="lg" footer={<>
        {preview && <Button size="sm" icon={<Send size={14} />} onClick={() => { sendToChat(preview); setPreview(null); }}>Enviar al tutor</Button>}
        {preview && <Button size="sm" icon={<Sparkles size={14} />} onClick={() => { void absorb(preview); setPreview(null); }}>Absorber con IA</Button>}
        <Button variant="ghost" onClick={() => setPreview(null)}>Cerrar</Button>
      </>}>
        {preview && <><div className="lightbox"><BlobImage blobKey={preview.blobKey} alt={preview.name} /></div>{preview.notes && <p className="muted">{preview.notes}</p>}{preview.aiSummary && <div className="lightbox__ai"><Sparkles size={15} /><div><strong>Lo que recuerda el Tutor de {subject?.name}</strong><p>{preview.aiSummary}</p></div></div>}</>}
      </Modal>

      <Modal open={Boolean(editing)} onClose={() => setEditing(null)} title="Editar apunte" footer={<><Button variant="ghost" onClick={() => setEditing(null)}>Cancelar</Button><Button variant="primary" onClick={saveEdit}>Guardar cambios</Button></>}>
        {editing && <>
          <Field label="Nombre"><input className="input" value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} /></Field>
          <Field label="Materia" hint="Si la cambias, el recuerdo pasa al tutor de la nueva materia."><select className="select" value={editing.subjectId} onChange={(e) => setEditing({ ...editing, subjectId: e.target.value })}><option value="">Sin asignar</option>{state.subjects.map((s) => <option key={s.id} value={s.id}>{s.icon} {s.name}</option>)}</select></Field>
          <Field label="Notas rápidas"><textarea className="textarea" rows={3} value={editing.notes} onChange={(e) => setEditing({ ...editing, notes: e.target.value })} /></Field>
          <Field label="Etiquetas (separadas por comas)"><input className="input" value={editing.tags.join(', ')} onChange={(e) => setEditing({ ...editing, tags: e.target.value.split(',').map((t) => t.trim()).filter(Boolean) })} /></Field>
          <Field label="Resumen de la IA (memoria del tutor)" hint="Puedes editarlo a mano aunque no tengas API Key."><textarea className="textarea" rows={5} value={editing.aiSummary} onChange={(e) => setEditing({ ...editing, aiSummary: e.target.value })} placeholder="Escribe aquí lo que el tutor debe recordar de esta página…" /></Field>
        </>}
      </Modal>

      <ConfirmModal open={Boolean(deleting)} onClose={() => setDeleting(null)} onConfirm={() => {
        if (!deleting) return;
        update((d) => { d.images = d.images.filter((x) => x.id !== deleting.id); d.memories = d.memories.filter((m) => m.imageId !== deleting.id); });
        void removeImageBlob(deleting.blobKey);
        toast('info', 'Apunte eliminado', 'También se borró su recuerdo de la memoria del tutor.');
      }} title="¿Eliminar este apunte?" message="Se borrará la imagen y su recuerdo de la memoria de este tutor. No afecta a las demás materias." />
    </div>
  );
}
