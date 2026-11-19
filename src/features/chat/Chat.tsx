import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import {
  AlertCircle, Bot, BrainCircuit, Clipboard, FilePlus2, Files, FolderOpen, ImagePlus,
  KeyRound, LibraryBig, Mic, Plus, Send, Settings2, Sparkles, Square,
  Trash2, Volume2, Wand2, X, LoaderCircle,
} from 'lucide-react';
import { Button, Chip, ConfirmModal, EmptyState, Field, IconButton, Markdown, Modal, BlobImage } from '../../components/ui';
import { Message } from './Message';
import { Biblioteca } from '../biblioteca/Biblioteca';
import { RESOURCES, buildPrompt, RASTER_PROMPT, type PromptParams, type ResourceType } from './quickActions';
import { useStore } from '../../state/store';
import { USE_PROXY } from '../../data/defaults';
import { useToast } from '../../state/toast';
import { AIError, attachmentDataUrls, buildSystemPrompt, callAI, generateRasterImage, transcribeAudio, type ChatTurn } from '../../lib/ai';
import { dataUrlToBlob, getBlob, putBlob } from '../../lib/imageStore';
import { KIND_LABEL, extractText, isVideo, kindOf } from '../../lib/files';
import { markSentToAi } from '../../lib/memory';
import { formatBytes, formatClock, uid } from '../../lib/utils';
import type { AudioRef, ChatFile, ChatMessage, LibraryKind, SectionId } from '../../types';

const defaultParams = (): PromptParams => ({ type: 'method', subject: '', topic: '', difficulty: 'media', minutes: 60, raster: false });
const WELCOME = [
  { icon: '🧠', title: '¿Cómo estudio hoy?', prompt: 'Con base en mi avance, la memoria de mis apuntes y mis entregas, recomiéndame un método de estudio y un plan para hoy.' },
  { icon: '📝', title: 'Guía para mi examen', prompt: 'Genera una guía de examen completa usando los apuntes que recuerdas de mi cuaderno.' },
  { icon: '📊', title: 'Diapositivas del tema', prompt: 'Crea una presentación de diapositivas en bloque ```slides sobre el tema principal de la memoria de mis apuntes.' },
  { icon: '✨', title: 'Anima un concepto', prompt: 'Crea una animación web en bloque ```html que explique el concepto más difícil de mis apuntes.' },
];

interface PendingItem {
  id: string;
  name: string;
  mime: string;
  size: number;
  kind: LibraryKind;
  blob: Blob;
  text: string;
  extracting: boolean;
  durationSec?: number;
  isAudio: boolean;
}

interface SpeechRecognitionLike {
  lang: string; continuous: boolean; interimResults: boolean;
  start(): void; stop(): void;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
}

export function Chat({ onNavigate }: { onNavigate: (s: SectionId) => void }) {
  const { state, update } = useStore();
  const toast = useToast();
  const [tab, setTab] = useState<'chat' | 'biblioteca'>('chat');
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [stream, setStream] = useState('');
  const [pendingImages, setPendingImages] = useState<string[]>([]);
  const [pendingItems, setPendingItems] = useState<PendingItem[]>([]);
  const [attachOpen, setAttachOpen] = useState(false);
  const [promptOpen, setPromptOpen] = useState(false);
  const [params, setParams] = useState<PromptParams>(defaultParams());
  const [contextOpen, setContextOpen] = useState(false);
  const [memoryOpen, setMemoryOpen] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [plusOpen, setPlusOpen] = useState(false);
  const [recording, setRecording] = useState(false);
  const [recSeconds, setRecSeconds] = useState(0);
  const [dictation, setDictation] = useState('');
  const abortRef = useRef<AbortController | null>(null);
  const streamRef = useRef('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const plusRef = useRef<HTMLDivElement>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const mediaRef = useRef<MediaStream | null>(null);
  const recStartRef = useRef(0);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const dictationRef = useRef('');
  const settings = state.settings;
  const hasKey = Boolean(settings.apiKey.trim()) || USE_PROXY;

  const imageNames = useMemo(() => {
    const map: Record<string, string> = {};
    state.images.forEach((i) => { map[i.id] = i.name; });
    state.chatFiles.forEach((f) => { map[f.id] = f.name; });
    state.subjects.forEach((s) => { map[s.id] = `${s.icon} ${s.name}`; });
    return map;
  }, [state.images, state.chatFiles, state.subjects]);

  useEffect(() => {
    const el = scrollRef.current;
    if (el && tab === 'chat' && typeof el.scrollTo === 'function') el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  }, [state.messages.length, stream, sending, tab]);

  useEffect(() => {
    const fn = (e: Event) => { const p = (e as CustomEvent<string>).detail; if (p) { setTab('chat'); void send(p); } };
    window.addEventListener('msc:chat-prompt', fn);
    return () => window.removeEventListener('msc:chat-prompt', fn);
  });

  useEffect(() => {
    const fn = (e: Event) => {
      const id = (e as CustomEvent<string>).detail;
      if (!id) return;
      setTab('chat');
      void addExisting(id);
    };
    window.addEventListener('msc:chat-attach', fn);
    return () => window.removeEventListener('msc:chat-attach', fn);
  });

  useEffect(() => {
    const onDown = (e: MouseEvent) => { if (plusRef.current && !plusRef.current.contains(e.target as Node)) setPlusOpen(false); };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, []);

  useEffect(() => {
    if (!recording) return;
    const i = window.setInterval(() => setRecSeconds(Math.round((Date.now() - recStartRef.current) / 1000)), 500);
    return () => window.clearInterval(i);
  }, [recording]);

  /* ───────── Archivos ───────── */
  const addFiles = (list: File[]) => {
    const videos = list.filter(isVideo);
    const valid = list.filter((f) => !isVideo(f)).slice(0, 10);
    if (videos.length) toast('warning', 'Los videos no se admiten', `Se omitieron: ${videos.map((v) => v.name).join(', ')}.`);
    if (!valid.length) return;
    const items: PendingItem[] = valid.map((f) => ({
      id: uid(), name: f.name, mime: f.type || 'application/octet-stream', size: f.size,
      kind: kindOf(f), blob: f, text: '', extracting: true,
      isAudio: f.type.startsWith('audio/') || /\.(mp3|wav|m4a|ogg|opus|aac|flac)$/i.test(f.name),
    }));
    setPendingItems((p) => [...p, ...items]);
    toast('info', `${items.length === 1 ? 'Archivo preparado' : `${items.length} archivos preparados`}`, 'Extrayendo el contenido para que la IA pueda leerlo…');
    items.forEach((item) => {
      void (async () => {
        let text = '';
        if (item.kind === 'audio') {
          try { text = await transcribeAudio(settings, item.blob); }
          catch { text = ''; }
        } else if (item.kind !== 'image') text = await extractText(item.blob as File, item.kind);
        setPendingItems((p) => p.map((x) => x.id === item.id ? { ...x, text, extracting: false } : x));
      })();
    });
  };

  const onFileInput = (e: ChangeEvent<HTMLInputElement>) => {
    addFiles(Array.from(e.target.files || []));
    e.target.value = '';
    setPlusOpen(false);
  };

  const addExisting = async (refId: string) => {
    const img = state.images.find((i) => i.id === refId);
    const file = state.chatFiles.find((f) => f.id === refId);
    const msg = state.messages.find((m) => m.id === refId);
    const audio = state.messages.flatMap((m) => m.audios || []).find((a) => a.id === refId);
    const blobKey = img?.blobKey || file?.blobKey || msg?.imageKey || audio?.blobKey;
    if (!blobKey) { toast('error', 'No se encontró el archivo'); return; }
    const blob = await getBlob(blobKey).catch(() => undefined);
    if (!blob) { toast('error', 'Archivo no disponible', 'El binario ya no está en el almacenamiento local.'); return; }
    if (img) { setPendingImages((a) => a.includes(img.id) ? a : [...a, img.id]); toast('info', 'Apunte adjunto', img.name); return; }
    const item: PendingItem = {
      id: uid(), name: file?.name || audio?.name || 'Imagen generada por IA', mime: file?.mime || audio?.mime || blob.type || 'image/png',
      size: file?.size || blob.size, kind: file?.kind || 'image', blob,
      text: file?.extractedText || audio?.transcript || '', extracting: false, isAudio: file?.kind === 'audio' || Boolean(audio), durationSec: file?.durationSec || audio?.durationSec,
    };
    setPendingItems((p) => [...p, item]);
    toast('info', 'Archivo adjunto', item.name);
  };

  /* ───────── Audio ───────── */
  const startRecording = async () => {
    setPlusOpen(false);
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      toast('error', 'Grabación no disponible', 'Tu navegador no permite grabar audio. Puedes subir un archivo de audio con el botón +.');
      return;
    }
    try {
      const streamMedia = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRef.current = streamMedia;
      chunksRef.current = [];
      dictationRef.current = '';
      setDictation('');
      recStartRef.current = Date.now();
      const rec = new MediaRecorder(streamMedia);
      rec.ondataavailable = (e) => { if (e.data.size) chunksRef.current.push(e.data); };
      rec.onstop = () => void finishRecording();
      recorderRef.current = rec;
      rec.start();
      setRecording(true);
      // Dictado local del navegador (gratis, sin API): captura lo que dices mientras grabas.
      const w = window as unknown as { webkitSpeechRecognition?: new () => SpeechRecognitionLike; SpeechRecognition?: new () => SpeechRecognitionLike };
      const Ctor = w.SpeechRecognition || w.webkitSpeechRecognition;
      if (Ctor) {
        try {
          const r = new Ctor();
          r.lang = 'es-ES'; r.continuous = true; r.interimResults = true;
          r.onresult = (e) => {
            let t = '';
            for (let i = 0; i < e.results.length; i++) t += `${e.results[i][0].transcript} `;
            dictationRef.current = t.trim();
            setDictation(dictationRef.current);
          };
          r.onerror = () => undefined;
          r.onend = () => undefined;
          r.start();
          recognitionRef.current = r;
        } catch { recognitionRef.current = null; }
      }
      toast('info', 'Grabando audio', 'Habla con claridad. También puedes subir un archivo de audio.');
    } catch (e) {
      toast('error', 'No se pudo acceder al micrófono', e instanceof Error ? e.message : 'Revisa los permisos del navegador.');
    }
  };

  const finishRecording = async () => {
    const durationSec = Math.max(1, Math.round((Date.now() - recStartRef.current) / 1000));
    const mime = recorderRef.current?.mimeType || 'audio/webm';
    const blob = new Blob(chunksRef.current, { type: mime });
    try { recognitionRef.current?.stop(); } catch { /* ignore */ }
    recognitionRef.current = null;
    mediaRef.current?.getTracks().forEach((t) => t.stop());
    mediaRef.current = null;
    recorderRef.current = null;
    setRecording(false);
    setRecSeconds(0);
    if (!blob.size) { toast('error', 'Audio vacío', 'No se capturó sonido. Inténtalo de nuevo.'); return; }
    let transcript = dictationRef.current.trim();
    if (!transcript) {
      try { transcript = await transcribeAudio(settings, blob); } catch { transcript = ''; }
    }
    const item: PendingItem = {
      id: uid(), name: `Nota de voz · ${new Date().toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })}.webm`,
      mime, size: blob.size, kind: 'audio', blob, text: transcript, extracting: false,
      isAudio: true, durationSec,
    };
    setPendingItems((p) => [...p, item]);
    toast(transcript ? 'success' : 'warning', transcript ? 'Audio transcrito' : 'Audio adjunto sin transcripción',
      transcript ? 'La IA leerá el texto y podrás escuchar el audio en el mensaje.' : 'Tu proveedor no ofrece transcripción y el dictado del navegador no está disponible. Escribe una nota en el mensaje para dar contexto.');
  };

  const cancelRecording = () => {
    try { recognitionRef.current?.stop(); } catch { /* ignore */ }
    if (recorderRef.current?.state === 'recording') recorderRef.current.onstop = null, recorderRef.current.stop();
    recognitionRef.current = null; recorderRef.current = null;
    mediaRef.current?.getTracks().forEach((t) => t.stop());
    mediaRef.current = null;
    setRecording(false); setRecSeconds(0); setDictation('');
    toast('info', 'Grabación cancelada');
  };

  /* ───────── Envío ───────── */
  const pushMessage = (m: ChatMessage) => update((d) => { d.messages = [...d.messages.filter((x) => !x.pending), m].slice(-60); });

  const send = async (raw: string) => {
    const hasAttachments = pendingImages.length > 0 || pendingItems.length > 0;
    const text = raw.trim() || (hasAttachments ? 'Analiza los archivos y apuntes que adjunto y dime qué debo repasar.' : '');
    if (!text || sending) return;

    // 1) Guardar binarios y registros de archivos (para la Biblioteca y el respaldo).
    const fileRecords: ChatFile[] = [];
    const audios: AudioRef[] = [];
    for (const item of pendingItems) {
      const blobKey = `chat-${item.id}`;
      await putBlob(blobKey, item.blob).catch((e) => console.warn(e));
      fileRecords.push({
        id: item.id, name: item.name, mime: item.mime, size: item.size, kind: item.kind,
        blobKey, extractedText: item.text, createdAt: new Date().toISOString(),
        subjectId: '', notes: '', durationSec: item.durationSec,
      });
      if (item.isAudio) audios.push({ id: item.id, blobKey, name: item.name, mime: item.mime, durationSec: item.durationSec || 0, transcript: item.text });
    }

    const userMsg: ChatMessage = {
      id: uid(), role: 'user', content: text, createdAt: new Date().toISOString(),
      attachments: [...pendingImages], fileIds: fileRecords.map((f) => f.id),
      audios: audios.length ? audios : undefined,
    };

    const history: ChatTurn[] = state.messages.filter((m) => !m.pending && !m.error).slice(-20)
      .map((m) => ({ role: m.role, content: m.content }));

    let userContent = text;
    for (const f of fileRecords) {
      if (!f.extractedText || f.kind === 'image' || f.kind === 'audio') continue;
      userContent += `\n\n--- CONTENIDO DEL ARCHIVO "${f.name}" (${KIND_LABEL[f.kind]}) ---\n${f.extractedText.slice(0, 4000)}`;
    }
    for (const a of audios) {
      if (a.transcript) userContent += `\n\n--- TRANSCRIPCIÓN DEL AUDIO "${a.name}" ---\n${a.transcript.slice(0, 6000)}`;
    }
    const userTurn: ChatTurn = { role: 'user', content: userContent };

    if (settings.vision) {
      const visionBlobs: Blob[] = [];
      for (const id of pendingImages) {
        const meta = state.images.find((i) => i.id === id);
        const blob = meta ? await getBlob(meta.blobKey).catch(() => undefined) : undefined;
        if (blob) visionBlobs.push(blob);
      }
      for (const item of pendingItems) if (item.kind === 'image') visionBlobs.push(item.blob);
      if (visionBlobs.length) {
        userTurn.images = await attachmentDataUrls(visionBlobs.slice(0, 6).map((blob) => ({ mime: blob.type || 'image/jpeg', blob })));
      }
    }
    const turns: ChatTurn[] = [{ role: 'system', content: buildSystemPrompt(state) }, ...history, { ...userTurn, content: userContent.slice(0, 30000) }];

    update((d) => {
      d.chatFiles.push(...fileRecords);
      markSentToAi(d, pendingImages);
      d.messages = [...d.messages.filter((x) => !x.pending), userMsg].slice(-60);
    });
    setInput(''); setPendingImages([]); setPendingItems([]);
    setSending(true); setStream(''); streamRef.current = '';
    const controller = new AbortController(); abortRef.current = controller;
    try {
      const result = await callAI({ settings, turns, signal: controller.signal, onToken: (chunk) => { streamRef.current += chunk; setStream(streamRef.current); } });
      pushMessage({ id: uid(), role: 'assistant', content: result, createdAt: new Date().toISOString() });
    } catch (e) {
      if ((e as Error).name === 'AbortError') {
        if (streamRef.current) pushMessage({ id: uid(), role: 'assistant', content: `${streamRef.current}\n\n*Generación detenida por ti.*`, createdAt: new Date().toISOString() });
      } else {
        const err = e instanceof AIError ? e : new AIError('Error inesperado al hablar con la IA.');
        pushMessage({ id: uid(), role: 'assistant', error: true, createdAt: new Date().toISOString(), content: `**${err.message}**${err.hint ? `\n\n${err.hint}` : ''}\n\nRevisa **Ajustes → Inteligencia Artificial**.` });
        toast('error', err.message, err.hint);
      }
    } finally { setSending(false); setStream(''); abortRef.current = null; }
  };

  const generateRaster = async (p: PromptParams) => {
    if (!hasKey) { toast('error', 'Falta la API Key', 'Configúrala en Ajustes.'); return; }
    const prompt = RASTER_PROMPT(p);
    pushMessage({ id: uid(), role: 'user', content: `🖼️ Generar imagen: ${p.topic || p.subject || 'concepto de estudio'}`, createdAt: new Date().toISOString() });
    setSending(true);
    try {
      const result = await generateRasterImage(settings, prompt);
      let imageKey: string | undefined;
      if (result.dataUrl) { imageKey = `gen-${uid()}`; await putBlob(imageKey, dataUrlToBlob(result.dataUrl)); }
      pushMessage({ id: uid(), role: 'assistant', imageKey, imageUrl: result.url, createdAt: new Date().toISOString(), content: 'Aquí tienes la imagen. También aparece en la pestaña **Biblioteca**. Si prefieres un vector editable, pide una imagen SVG.' });
      toast('success', 'Imagen generada', 'Disponible en la biblioteca del chat.');
    } catch (e) {
      const err = e instanceof AIError ? e : new AIError('No se pudo generar la imagen.');
      pushMessage({ id: uid(), role: 'assistant', error: true, content: `**${err.message}**\n\n${err.hint || ''}\n\nPrueba con la opción **SVG**.`, createdAt: new Date().toISOString() });
      toast('error', err.message, err.hint);
    } finally { setSending(false); }
  };

  const openPrompt = (type: ResourceType) => { setParams({ ...defaultParams(), type, subject: state.subjects[0]?.name || '' }); setPromptOpen(true); };
  const runPrompt = () => { setPromptOpen(false); if (params.type === 'image' && params.raster) void generateRaster(params); else void send(buildPrompt(params)); };

  const pasteImage = async () => {
    setPlusOpen(false);
    try {
      const items = await navigator.clipboard.read();
      const files: File[] = [];
      for (const it of items) for (const type of it.types) if (type.startsWith('image/')) { const b = await it.getType(type); files.push(new File([b], `imagen-${Date.now()}.${type.split('/')[1]}`, { type })); }
      if (files.length) addFiles(files); else toast('info', 'No hay imágenes en el portapapeles');
    } catch { toast('info', 'Pega con Ctrl+V', 'O usa el menú para subir archivos desde tu equipo.'); }
  };

  return (
    <div className="view view--chat">
      <div className="chat-shell glass">
        <div className="chat-head">
          <div className="chat-head__id"><span className="chat-head__avatar"><Bot size={19} /></span><div><strong>Asistente de estudio</strong><span>{settings.provider === 'openrouter' ? 'OpenRouter' : settings.provider === 'gemini' ? 'Google Gemini' : settings.provider === 'custom' ? 'Proveedor personalizado' : 'OpenAI'} · {settings.model}</span></div></div>
          <div className="chat-head__tabs">
            <button className={tab === 'chat' ? 'is-active' : ''} onClick={() => setTab('chat')}><Wand2 size={14} /> Chat</button>
            <button className={tab === 'biblioteca' ? 'is-active' : ''} onClick={() => setTab('biblioteca')}><LibraryBig size={14} /> Biblioteca</button>
          </div>
          <div className="chat-head__actions">
            <Chip onClick={() => setMemoryOpen(true)}><BrainCircuit size={12} /> 🧠 Memoria: {state.memories.length} páginas</Chip>
            <IconButton label="Ver contexto" onClick={() => setContextOpen(true)}><BrainCircuit size={16} /></IconButton>
            <IconButton label="Limpiar conversación" onClick={() => setConfirmClear(true)}><Trash2 size={16} /></IconButton>
            <IconButton label="Ajustes de IA" onClick={() => onNavigate('settings')}><Settings2 size={16} /></IconButton>
          </div>
        </div>

        {!hasKey && (
          <div className="chat-warning"><KeyRound size={18} /><div><strong>Para hablar con la IA necesitas tu propia API Key</strong><span>Se guarda solo en este navegador. El resto de la app funciona sin ella.</span></div><Button size="sm" variant="primary" onClick={() => onNavigate('settings')}>Configurar ahora</Button></div>
        )}
        {hasKey && !settings.vision && (
          <div className="chat-warning chat-warning--soft"><AlertCircle size={16} /><span>La visión está desactivada: la IA usa la memoria de tus apuntes pero no ve las imágenes originales.</span><Button size="sm" variant="ghost" onClick={() => onNavigate('settings')}>Ajustes</Button></div>
        )}

        {tab === 'biblioteca' ? (
          <div className="chat-biblio"><Biblioteca compact onNavigate={onNavigate} /></div>
        ) : (
          <>
            <div className="chat-scroll" ref={scrollRef} onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); addFiles(Array.from(e.dataTransfer.files || [])); }}>
              {state.messages.length === 0 && !sending && (
                <div className="chat-welcome">
                  <div className="chat-welcome__icon"><Sparkles size={30} /></div>
                  <h2>Hola, soy tu asistente de estudio</h2>
                  <p>Recuerdo las páginas de tu cuaderno que analices en <b>Fotos y apuntes</b>, aunque no las adjuntes aquí. También puedes mandarme audios, PDFs, Word, Excel, PowerPoint y más con el botón <b>+</b>.</p>
                  <div className="chat-welcome__cards">{WELCOME.map((w) => <button key={w.title} className="glass" onClick={() => void send(w.prompt)}><i>{w.icon}</i><strong>{w.title}</strong><span>{w.prompt}</span></button>)}</div>
                </div>
              )}
              {state.messages.map((m) => <Message key={m.id} message={m} imageNames={imageNames} />)}
              {sending && (
                <div className="message message--ai">
                  <div className="message__avatar"><Bot size={16} /></div>
                  <div className="message__bubble">
                    <div className="message__meta"><strong>Asistente de estudio</strong><span>en vivo</span></div>
                    {stream ? <Markdown text={stream} /> : <div className="typing"><span /><span /><span /> Escribiendo…</div>}
                    <span className="stream-caret" />
                  </div>
                </div>
              )}
            </div>

            <div className="quick-bar">{RESOURCES.map((r) => <button key={r.id} onClick={() => openPrompt(r.id)} title={r.hint}><i>{r.icon}</i>{r.label}</button>)}</div>

            {(pendingImages.length > 0 || pendingItems.length > 0) && (
              <div className="chat-attachments">
                {pendingImages.map((id) => <span key={id} className="glass">📷 {imageNames[id] || 'Apunte'}<IconButton label="Quitar" onClick={() => setPendingImages((a) => a.filter((x) => x !== id))}><X size={12} /></IconButton></span>)}
                {pendingItems.map((f) => <span key={f.id} className="glass">{f.isAudio ? '🎙️' : f.kind === 'image' ? '🖼️' : '📎'} {f.name}{f.extracting ? <LoaderCircle size={12} className="spin" /> : <small>{KIND_LABEL[f.kind]} · {formatBytes(f.size)}</small>}<IconButton label="Quitar" onClick={() => setPendingItems((a) => a.filter((x) => x.id !== f.id))}><X size={12} /></IconButton></span>)}
              </div>
            )}

            {recording && (
              <div className="recording-bar">
                <span className="recording-bar__dot" /><strong>Grabando {formatClock(recSeconds)}</strong>
                {dictation && <span className="recording-bar__dictation">“{dictation.slice(0, 90)}…”</span>}
                <Button size="sm" variant="primary" icon={<Square size={13} />} onClick={() => recorderRef.current?.stop()}>Detener y adjuntar</Button>
                <Button size="sm" variant="ghost" onClick={cancelRecording}>Cancelar</Button>
              </div>
            )}

            <div className="composer" onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); addFiles(Array.from(e.dataTransfer.files || [])); }}>
              <div className="dropdown composer-plus" ref={plusRef}>
                <IconButton label="Añadir archivos, audio o apuntes" className="composer-plus__btn" onClick={() => setPlusOpen((v) => !v)}><Plus size={19} /></IconButton>
                {plusOpen && (
                  <div className="composer-menu glass">
                    <span className="dropdown__label">Enviar a la IA</span>
                    <button onClick={() => { fileRef.current?.click(); setPlusOpen(false); }}><FilePlus2 size={15} /><span><strong>Subir archivos</strong><small>PDF, imágenes, DOCX, XLSX, PPTX, TXT… todo menos videos</small></span></button>
                    <button onClick={() => void startRecording()}><Mic size={15} /><span><strong>Grabar audio</strong><small>Nota de voz con dictado / transcripción</small></span></button>
                    <button onClick={() => { setAttachOpen(true); setPlusOpen(false); }}><FolderOpen size={15} /><span><strong>Adjuntar apunte</strong><small>Una foto ya subida en Fotos y apuntes</small></span></button>
                    <button onClick={() => void pasteImage()}><Clipboard size={15} /><span><strong>Pegar imagen</strong><small>Desde el portapapeles</small></span></button>
                    <button onClick={() => { setTab('biblioteca'); setPlusOpen(false); }}><LibraryBig size={15} /><span><strong>Ver biblioteca</strong><small>Todo lo que le has mandado a la IA</small></span></button>
                  </div>
                )}
              </div>
              <input ref={fileRef} type="file" multiple hidden onChange={onFileInput} />
              <textarea ref={taRef} className="composer__input" rows={1} value={input} placeholder="Pregunta lo que quieras o pide un recurso… (Enter envía, Shift+Enter salto de línea)" onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send(input); } }} />
              <IconButton label="Grabar audio" onClick={() => void startRecording()} className={recording ? 'is-recording' : ''}><Mic size={17} /></IconButton>
              {sending ? <Button variant="danger" size="sm" icon={<Square size={13} />} onClick={() => abortRef.current?.abort()}>Detener</Button>
                : <Button variant="primary" icon={<Send size={15} />} onClick={() => void send(input)} disabled={!input.trim() && !pendingImages.length && !pendingItems.length}>Enviar</Button>}
            </div>
            <div className="composer__foot"><span><Wand2 size={12} /> Recursos con copiar · previsualizar · descargar. Mensajes con 🔊 para escuchar.</span><span><Volume2 size={12} /> Text to speech activo</span></div>
          </>
        )}
      </div>

      <Modal open={promptOpen} onClose={() => setPromptOpen(false)} title={RESOURCES.find((r) => r.id === params.type)?.label || 'Generar con IA'} subtitle="Ajusta tema, dificultad y tiempo; la IA usa la memoria de tus apuntes." footer={<>
        <Button variant="ghost" onClick={() => setPromptOpen(false)}>Cancelar</Button>
        <Button variant="primary" icon={<Sparkles size={15} />} onClick={runPrompt} disabled={sending}>{params.type === 'image' && params.raster ? 'Generar imagen' : 'Generar respuesta'}</Button>
      </>}>
        <Field label="Tipo de recurso"><div className="resource-grid">{RESOURCES.map((r) => <button key={r.id} className={params.type === r.id ? 'is-active' : ''} onClick={() => setParams({ ...params, type: r.id, raster: false })}><i>{r.icon}</i><strong>{r.label}</strong><small>{r.hint}</small></button>)}</div></Field>
        <div className="form-row">
          <Field label="Materia"><select className="select" value={params.subject} onChange={(e) => setParams({ ...params, subject: e.target.value })}><option value="">Automática (según mi avance)</option>{state.subjects.map((s) => <option key={s.id} value={s.name}>{s.icon} {s.name}</option>)}</select></Field>
          <Field label="Dificultad"><select className="select" value={params.difficulty} onChange={(e) => setParams({ ...params, difficulty: e.target.value })}><option value="baja">Baja · repaso</option><option value="media">Media</option><option value="alta">Alta · me cuesta</option></select></Field>
        </div>
        <Field label="Tema concreto"><input className="input" value={params.topic} onChange={(e) => setParams({ ...params, topic: e.target.value })} placeholder="Ej. Integrales por partes, la célula…" /></Field>
        <Field label={`Tiempo disponible: ${params.minutes} minutos`}><input type="range" min={15} max={240} step={15} value={params.minutes} onChange={(e) => setParams({ ...params, minutes: Number(e.target.value) })} className="range" /></Field>
        {params.type === 'image' && <label className="toggle-row"><span><strong>Usar modelo de imágenes</strong><small>Apagado = SVG vectorial editable (cualquier modelo de texto). Encendido = endpoint /images/generations.</small></span><input type="checkbox" checked={params.raster} onChange={(e) => setParams({ ...params, raster: e.target.checked })} /><span className="toggle" aria-hidden="true" /></label>}
      </Modal>

      <Modal open={attachOpen} onClose={() => setAttachOpen(false)} title="Adjuntar apuntes al mensaje" subtitle={settings.vision ? 'La IA verá las páginas originales.' : 'La visión está apagada: solo se usará la memoria de sus resúmenes.'} size="lg" footer={<>
        <Button variant="ghost" onClick={() => { setPendingImages([]); setAttachOpen(false); }}>Quitar todos</Button>
        <Button variant="primary" onClick={() => setAttachOpen(false)}>Listo ({pendingImages.length})</Button>
      </>}>
        {state.images.length === 0 ? <EmptyState icon={<ImagePlus size={26} />} title="Aún no hay apuntes" description="Sube fotos en Fotos y apuntes para adjuntarlas aquí." /> : (
          <div className="attach-grid">{state.images.map((img) => {
            const active = pendingImages.includes(img.id);
            return <button key={img.id} className={`attach-item ${active ? 'is-active' : ''}`} onClick={() => setPendingImages((a) => active ? a.filter((x) => x !== img.id) : [...a, img.id])}>
              <BlobImage blobKey={img.blobKey} alt={img.name} /><span><strong>{img.name}</strong><small>{imageNames[img.subjectId] || 'Sin materia'}</small></span>{img.aiSummary && <i title="En la memoria de la IA"><Sparkles size={12} /></i>}{active && <b className="attach-check">✓</b>}
            </button>;
          })}</div>
        )}
      </Modal>

      <Modal open={memoryOpen} onClose={() => setMemoryOpen(false)} title="🧠 Memoria de la IA" subtitle="Páginas de tu cuaderno que la IA analizó y recuerda en TODAS las conversaciones, aunque no las adjuntes." size="lg" footer={<>
        <Button icon={<Files size={14} />} onClick={() => { setMemoryOpen(false); setTab('biblioteca'); }}>Ver biblioteca</Button>
        <Button variant="primary" onClick={() => setMemoryOpen(false)}>Entendido</Button>
      </>}>
        {state.memories.length === 0 && <EmptyState icon={<BrainCircuit size={26} />} title="Sin recuerdos todavía" description="Sube una foto en Fotos y apuntes y pulsa “Absorber con IA” (o activa el análisis automático en Ajustes)." />}
        <div className="memory-list">{state.memories.map((m) => (
          <div key={m.id} className="memory-card"><div className="memory-card__head"><BlobImage blobKey={m.blobKey} alt={m.name} /><div><strong>{m.name}</strong><small>{imageNames[m.subjectId] || 'Sin materia'} · {new Date(m.createdAt).toLocaleDateString('es')}</small></div></div><p>{m.summary}</p></div>
        ))}</div>
      </Modal>

      <Modal open={contextOpen} onClose={() => setContextOpen(false)} title="Contexto que recibe la IA" subtitle="Se construye en tu navegador con tus datos y se envía al proveedor elegido." size="lg" footer={<Button variant="primary" onClick={() => setContextOpen(false)}>Entendido</Button>}>
        <p className="muted">Materias: {state.subjects.length} · Apuntes: {state.images.length} · Recuerdos: {state.memories.length} · Archivos: {state.chatFiles.length} · Sesiones: {state.sessions.length}</p>
        <pre className="context-pre">{buildSystemPrompt(state)}</pre>
      </Modal>

      <ConfirmModal open={confirmClear} onClose={() => setConfirmClear(false)} onConfirm={() => { update((d) => { d.messages = []; }); toast('info', 'Conversación limpiada', 'La memoria de tus apuntes se conserva.'); }} title="¿Limpiar la conversación?" message="Se borrarán los mensajes del chat, pero NO la memoria de tus apuntes ni la biblioteca." confirmLabel="Limpiar chat" />

    </div>
  );
}
