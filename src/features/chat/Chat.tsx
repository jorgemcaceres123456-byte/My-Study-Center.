import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import {
  AlertCircle, ArrowLeft, Bot, BrainCircuit, CalendarDays, Clipboard, Files,
  FolderOpen, Globe, ImagePlus, KeyRound, LibraryBig, Mic, Plus, Send, Settings2, Sparkles,
  Square, Trash2, Volume2, Wand2, X, LoaderCircle, GraduationCap, ChevronRight,
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
import { tutorIdFor } from '../../lib/tutors';
import { formatBytes, formatClock, plural, uid } from '../../lib/utils';
import { TAVILY_HINT, WebSearchError, extractSourceLinks, isBalanceError, sourcesToContext, sourcesToMarkdown, tavilySearch, type WebSource } from '../../lib/web';
import type { AudioRef, ChatFile, ChatMessage, LibraryKind, ReasoningEffort, SectionId } from '../../types';

const TUTOR_KEY = 'my-study-center:tutor';
const defaultParams = (subject = ''): PromptParams => ({ type: 'method', subject, topic: '', difficulty: 'media', minutes: 60, raster: false });

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
  const [activeTutorId, setActiveTutorId] = useState<string | null>(() => localStorage.getItem(TUTOR_KEY));
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
  const [searchingWeb, setSearchingWeb] = useState(false);
  const [recording, setRecording] = useState(false);
  const [recSeconds, setRecSeconds] = useState(0);
  const [dictation, setDictation] = useState('');
  const [queuedPrompt, setQueuedPrompt] = useState<string | null>(null);
  const [queuedAttach, setQueuedAttach] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const streamRef = useRef('');
  const scrollRef = useRef<HTMLDivElement>(null);
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

  const activeTutor = state.tutors.find((t) => t.id === activeTutorId) || null;
  const subject = activeTutor ? state.subjects.find((s) => s.id === activeTutor.subjectId) || null : null;
  const messages = activeTutor ? state.tutorMessages[activeTutor.id] || [] : [];
  const ownMemories = subject ? state.memories.filter((m) => m.subjectId === subject.id) : [];
  const ownImages = subject ? state.images.filter((i) => i.subjectId === subject.id) : [];
  const ownDeadlines = subject ? state.events.filter((e) => e.subjectId === subject.id && !e.done) : [];

  const imageNames = useMemo(() => {
    const map: Record<string, string> = {};
    state.images.forEach((i) => { map[i.id] = i.name; });
    state.chatFiles.forEach((f) => { map[f.id] = f.name; });
    state.subjects.forEach((s) => { map[s.id] = `${s.icon} ${s.name}`; });
    return map;
  }, [state.images, state.chatFiles, state.subjects]);

  useEffect(() => {
    const el = scrollRef.current;
    if (el && tab === 'chat' && activeTutor && typeof el.scrollTo === 'function') el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  }, [messages.length, stream, sending, tab, activeTutor]);

  useEffect(() => {
    if (!plusOpen) return;
    const onDown = (e: MouseEvent) => {
      if (plusRef.current && !plusRef.current.contains(e.target as Node)) setPlusOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [plusOpen]);

  const toggleWebSearch = (next?: boolean) => update((d) => {
    d.settings.webSearch = typeof next === 'boolean' ? next : !d.settings.webSearch;
  });

  const selectTutor = (id: string) => {
    if (id !== activeTutorId) {
      // Nada de adjuntos de otra materia puede viajar a este tutor.
      setPendingImages([]); setPendingItems([]); setInput(''); setQueuedAttach(null);
    }
    setActiveTutorId(id);
    localStorage.setItem(TUTOR_KEY, id);
    setTab('chat');
  };
  const goBack = () => {
    setActiveTutorId(null); localStorage.removeItem(TUTOR_KEY); setTab('chat');
    setPendingImages([]); setPendingItems([]); setInput(''); setQueuedAttach(null);
  };

  /* ─── Eventos: abrir un tutor concreto, mandar prompt o adjuntar un apunte ─── */
  useEffect(() => {
    const pick = (sid?: string) => {
      if (sid && state.tutors.some((t) => t.subjectId === sid)) return tutorIdFor(sid);
      return activeTutorId && state.tutors.some((t) => t.id === activeTutorId) ? activeTutorId : state.tutors[0]?.id || null;
    };
    const onPrompt = (e: Event) => {
      const d = (e as CustomEvent).detail;
      const prompt = typeof d === 'string' ? d : String(d?.prompt || '');
      if (!prompt) return;
      const tid = pick(typeof d === 'object' ? d?.subjectId : undefined);
      if (!tid) { toast('info', 'Crea una materia primero', 'Cada materia crea su propio tutor de IA.'); onNavigate('subjects'); return; }
      selectTutor(tid);
      setQueuedPrompt(prompt);
    };
    const onAttach = (e: Event) => {
      const d = (e as CustomEvent).detail;
      const refId = typeof d === 'string' ? d : String(d?.refId || '');
      if (!refId) return;
      const img = state.images.find((i) => i.id === refId);
      const tid = pick((typeof d === 'object' ? d?.subjectId : undefined) || img?.subjectId || undefined);
      if (!tid) { toast('info', 'Crea una materia primero'); onNavigate('subjects'); return; }
      selectTutor(tid);
      setQueuedAttach(refId);
    };
    const onOpenTutor = (e: Event) => {
      const sid = String((e as CustomEvent<string>).detail || '');
      const tid = pick(sid);
      if (tid) selectTutor(tid);
    };
    window.addEventListener('msc:chat-prompt', onPrompt);
    window.addEventListener('msc:chat-attach', onAttach);
    window.addEventListener('msc:open-tutor', onOpenTutor);
    return () => {
      window.removeEventListener('msc:chat-prompt', onPrompt);
      window.removeEventListener('msc:chat-attach', onAttach);
      window.removeEventListener('msc:open-tutor', onOpenTutor);
    };
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
        if (item.kind === 'audio') { try { text = await transcribeAudio(settings, item.blob); } catch { text = ''; } }
        else if (item.kind !== 'image') text = await extractText(item.blob as File, item.kind);
        setPendingItems((p) => p.map((x) => x.id === item.id ? { ...x, text, extracting: false } : x));
      })();
    });
  };

  const onFileInput = (e: ChangeEvent<HTMLInputElement>) => {
    addFiles(Array.from(e.target.files || []));
    e.target.value = '';
    setPlusOpen(false);
  };

  const addExisting = async (refId: string, tutorId = activeTutorId) => {
    if (!tutorId) return;
    const img = state.images.find((i) => i.id === refId);
    const file = state.chatFiles.find((f) => f.id === refId);
    const all = Object.values(state.tutorMessages).flat();
    const msg = all.find((m) => m.id === refId);
    const audio = all.flatMap((m) => m.audios || []).find((a) => a.id === refId);
    const blobKey = img?.blobKey || file?.blobKey || msg?.imageKey || audio?.blobKey;
    if (!blobKey) { toast('error', 'No se encontró el archivo'); return; }
    const blob = await getBlob(blobKey).catch(() => undefined);
    if (!blob) { toast('error', 'Archivo no disponible', 'El binario ya no está en el almacenamiento local.'); return; }
    if (img) {
      if (!img.subjectId || tutorId !== tutorIdFor(img.subjectId)) {
        toast('warning', 'Apunte de otra materia bloqueado', 'El aislamiento estricto impide enviar estos temas a otro tutor. Ábrelo en su materia.');
        return;
      }
      setPendingImages((a) => a.includes(img.id) ? a : [...a, img.id]);
      toast('info', 'Apunte adjunto', img.name);
      return;
    }
    if ((file?.subjectId && tutorId !== tutorIdFor(file.subjectId))
      || (audio?.subjectId && tutorId !== tutorIdFor(audio.subjectId))
      || (msg?.subjectId && tutorId !== tutorIdFor(msg.subjectId))) {
      toast('warning', 'Archivo de otra materia bloqueado', 'El aislamiento estricto impide que este tutor vea temas de otra materia.');
      return;
    }
    const item: PendingItem = {
      id: uid(), name: file?.name || audio?.name || 'Imagen generada por IA', mime: file?.mime || audio?.mime || blob.type || 'image/png',
      size: file?.size || blob.size, kind: file?.kind || 'image', blob,
      text: file?.extractedText || audio?.transcript || '', extracting: false,
      isAudio: file?.kind === 'audio' || Boolean(audio), durationSec: file?.durationSec || audio?.durationSec,
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
      mediaRef.current = streamMedia; chunksRef.current = []; dictationRef.current = ''; setDictation('');
      recStartRef.current = Date.now();
      const rec = new MediaRecorder(streamMedia);
      rec.ondataavailable = (e) => { if (e.data.size) chunksRef.current.push(e.data); };
      rec.onstop = () => void finishRecording();
      recorderRef.current = rec; rec.start(); setRecording(true);
      const w = window as unknown as { webkitSpeechRecognition?: new () => SpeechRecognitionLike; SpeechRecognition?: new () => SpeechRecognitionLike };
      const Ctor = w.SpeechRecognition || w.webkitSpeechRecognition;
      if (Ctor) {
        try {
          const r = new Ctor();
          r.lang = 'es-ES'; r.continuous = true; r.interimResults = true;
          r.onresult = (e) => { let t = ''; for (let i = 0; i < e.results.length; i++) t += `${e.results[i][0].transcript} `; dictationRef.current = t.trim(); setDictation(dictationRef.current); };
          r.onerror = () => undefined; r.onend = () => undefined; r.start(); recognitionRef.current = r;
        } catch { recognitionRef.current = null; }
      }
      toast('info', 'Grabando audio', 'Habla con claridad. También puedes subir un archivo de audio.');
    } catch (e) { toast('error', 'No se pudo acceder al micrófono', e instanceof Error ? e.message : 'Revisa los permisos del navegador.'); }
  };

  const finishRecording = async () => {
    const durationSec = Math.max(1, Math.round((Date.now() - recStartRef.current) / 1000));
    const mime = recorderRef.current?.mimeType || 'audio/webm';
    const blob = new Blob(chunksRef.current, { type: mime });
    try { recognitionRef.current?.stop(); } catch { /* ignore */ }
    recognitionRef.current = null;
    mediaRef.current?.getTracks().forEach((t) => t.stop());
    mediaRef.current = null; recorderRef.current = null;
    setRecording(false); setRecSeconds(0);
    if (!blob.size) { toast('error', 'Audio vacío', 'No se capturó sonido. Inténtalo de nuevo.'); return; }
    let transcript = dictationRef.current.trim();
    if (!transcript) { try { transcript = await transcribeAudio(settings, blob); } catch { transcript = ''; } }
    const item: PendingItem = {
      id: uid(), name: `Nota de voz · ${new Date().toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })}.webm`,
      mime, size: blob.size, kind: 'audio', blob, text: transcript, extracting: false, isAudio: true, durationSec,
    };
    setPendingItems((p) => [...p, item]);
    toast(transcript ? 'success' : 'warning', transcript ? 'Audio transcrito' : 'Audio adjunto sin transcripción',
      transcript ? 'La IA leerá el texto y podrás escuchar el audio en el mensaje.' : 'Escribe una nota en el mensaje para dar contexto.');
  };

  const cancelRecording = () => {
    try { recognitionRef.current?.stop(); } catch { /* ignore */ }
    if (recorderRef.current?.state === 'recording') recorderRef.current.onstop = null, recorderRef.current.stop();
    recognitionRef.current = null; recorderRef.current = null;
    mediaRef.current?.getTracks().forEach((t) => t.stop()); mediaRef.current = null;
    setRecording(false); setRecSeconds(0); setDictation('');
    toast('info', 'Grabación cancelada');
  };

  /* ───────── Envío ───────── */
  const pushMessage = (tutorId: string, m: ChatMessage) => update((d) => {
    const list = d.tutorMessages[tutorId] || [];
    d.tutorMessages[tutorId] = [...list.filter((x) => !x.pending), m].slice(-60);
  });

  const send = async (raw: string, tutorId: string | null = activeTutorId) => {
    const tutor = state.tutors.find((t) => t.id === tutorId);
    const sub = tutor ? state.subjects.find((s) => s.id === tutor.subjectId) : null;
    if (!tutor || !sub) { toast('info', 'Elige un tutor', 'Abre el tutor de la materia con la que quieres hablar.'); return; }
    // Defensa extra: nunca se envían apuntes de otra materia a este tutor.
    const attachments = subject ? pendingImages.filter((id) => ownImages.some((i) => i.id === id)) : [];
    const hasAttachments = attachments.length > 0 || pendingItems.length > 0;
    const text = raw.trim() || (hasAttachments ? 'Analiza los archivos y apuntes que adjunto y dime qué debo repasar.' : '');
    if (!text || sending) return;

    const fileRecords: ChatFile[] = [];
    const audios: AudioRef[] = [];
    for (const item of pendingItems) {
      const blobKey = `chat-${item.id}`;
      await putBlob(blobKey, item.blob).catch((e) => console.warn(e));
      fileRecords.push({
        id: item.id, name: item.name, mime: item.mime, size: item.size, kind: item.kind,
        blobKey, extractedText: item.text, createdAt: new Date().toISOString(),
        subjectId: sub.id, notes: '', durationSec: item.durationSec,
      });
      if (item.isAudio) audios.push({ id: item.id, blobKey, name: item.name, mime: item.mime, durationSec: item.durationSec || 0, transcript: item.text, subjectId: sub.id });
    }

    const userMsg: ChatMessage = {
      id: uid(), role: 'user', content: text, createdAt: new Date().toISOString(), subjectId: sub.id,
      attachments: [...attachments], fileIds: fileRecords.map((f) => f.id), audios: audios.length ? audios : undefined,
    };
    const history: ChatTurn[] = (state.tutorMessages[tutor.id] || []).filter((m) => !m.pending && !m.error).slice(-20)
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
      for (const id of attachments) {
        const meta = ownImages.find((i) => i.id === id) || state.images.find((i) => i.id === id && i.subjectId === sub.id);
        const blob = meta ? await getBlob(meta.blobKey).catch(() => undefined) : undefined;
        if (blob) visionBlobs.push(blob);
      }
      for (const item of pendingItems) if (item.kind === 'image') visionBlobs.push(item.blob);
      if (visionBlobs.length) userTurn.images = await attachmentDataUrls(visionBlobs.slice(0, 6).map((blob) => ({ mime: blob.type || 'image/jpeg', blob })));
    }
    const isGuide = /GUÍA DE EXAMEN COMPLETA/i.test(text);
    const hasVisionImages = Boolean(userTurn.images?.length);
    const reasoning: ReasoningEffort = hasVisionImages || isGuide ? 'medium' : 'none';
    const baseSystem = buildSystemPrompt(state, sub.id);

    update((d) => {
      d.chatFiles.push(...fileRecords);
      markSentToAi(d, attachments);
      const list = d.tutorMessages[tutor.id] || [];
      d.tutorMessages[tutor.id] = [...list.filter((x) => !x.pending), userMsg].slice(-60);
    });
    setInput(''); setPendingImages([]); setPendingItems([]);
    setSending(true); setStream(''); streamRef.current = '';
    const controller = new AbortController(); abortRef.current = controller;

    let webSources: WebSource[] = [];
    let useOnline = false;
    let systemPrompt = baseSystem;

    if (settings.webSearch) {
      setSearchingWeb(true);
      if (settings.tavilyKey?.trim()) {
        try {
          webSources = await tavilySearch(text, settings.tavilyKey, controller.signal);
          systemPrompt += sourcesToContext(webSources);
        } catch (e) {
          if ((e as Error).name === 'AbortError' || controller.signal.aborted) {
            setSearchingWeb(false); setSending(false); setStream(''); abortRef.current = null;
            return;
          }
          const msg = e instanceof WebSearchError ? e.message : 'No se pudo buscar en Tavily.';
          toast('warning', 'Búsqueda web sin resultados', `${msg} Respondo sin internet.`);
        }
      } else {
        useOnline = true;
      }
      setSearchingWeb(false);
    }

    const turns: ChatTurn[] = [
      { role: 'system', content: systemPrompt }, ...history,
      { ...userTurn, content: userContent.slice(0, 30000) },
    ];

    try {
      let result = await callAI({
        settings, turns, signal: controller.signal, reasoning, online: useOnline,
        onToken: (chunk) => { streamRef.current += chunk; setStream(streamRef.current); },
        onFallback: (msg) => toast('info', 'Modelo de respaldo', msg),
      });
      if (webSources.length && !/https?:\/\//i.test(result)) {
        result += sourcesToMarkdown(webSources);
      } else if (useOnline && !/\]\(https?:\/\//i.test(result)) {
        const extracted = extractSourceLinks(result);
        if (extracted.length) result += sourcesToMarkdown(extracted);
      }
      pushMessage(tutor.id, { id: uid(), role: 'assistant', content: result, createdAt: new Date().toISOString(), subjectId: sub.id });
    } catch (e) {
      if ((e as Error).name === 'AbortError') {
        if (streamRef.current) pushMessage(tutor.id, { id: uid(), role: 'assistant', content: `${streamRef.current}\n\n*Generación detenida por ti.*`, createdAt: new Date().toISOString(), subjectId: sub.id });
      } else if (useOnline && isBalanceError(e)) {
        toast('warning', 'Búsqueda :online requiere saldo en OpenRouter', TAVILY_HINT);
        pushMessage(tutor.id, {
          id: uid(), role: 'assistant', createdAt: new Date().toISOString(), subjectId: sub.id,
          content: `**La búsqueda integrada \`:online\` de OpenRouter devolvió falta de saldo.**\n\nPara buscar en internet gratis sin gastar créditos:\n1. Crea una clave gratuita en **app.tavily.com**.\n2. Pégala en **Ajustes → Tavily API Key**.\n3. Vuelve a enviar tu pregunta con **🌐 Web** encendido (o apágalo para chatear al instante).`,
        });
      } else {
        const err = e instanceof AIError ? e : new AIError('Error inesperado al hablar con la IA.');
        pushMessage(tutor.id, { id: uid(), role: 'assistant', error: true, createdAt: new Date().toISOString(), subjectId: sub.id, content: `**${err.message}**${err.hint ? `\n\n${err.hint}` : ''}\n\nRevisa **Ajustes → Inteligencia Artificial**.` });
        toast('error', err.message, err.hint);
      }
    } finally { setSearchingWeb(false); setSending(false); setStream(''); abortRef.current = null; }
  };

  const generateRaster = async (p: PromptParams, tutorId: string | null = activeTutorId) => {
    const tutor = state.tutors.find((t) => t.id === tutorId);
    const sub = tutor ? state.subjects.find((s) => s.id === tutor.subjectId) : null;
    if (!tutor || !sub) return;
    if (!hasKey) { toast('error', 'Falta la API Key', 'Configúrala en Ajustes.'); return; }
    pushMessage(tutor.id, { id: uid(), role: 'user', content: `🖼️ Generar imagen: ${p.topic || p.subject}`, createdAt: new Date().toISOString(), subjectId: sub.id });
    setSending(true);
    try {
      const result = await generateRasterImage(settings, RASTER_PROMPT(p));
      let imageKey: string | undefined;
      if (result.dataUrl) { imageKey = `gen-${uid()}`; await putBlob(imageKey, dataUrlToBlob(result.dataUrl)); }
      pushMessage(tutor.id, { id: uid(), role: 'assistant', imageKey, imageUrl: result.url, subjectId: sub.id, createdAt: new Date().toISOString(), content: 'Aquí tienes la imagen. Si prefieres un vector editable, pide una imagen SVG.' });
      toast('success', 'Imagen generada', 'Disponible en la Biblioteca de esta materia.');
    } catch (e) {
      const err = e instanceof AIError ? e : new AIError('No se pudo generar la imagen.');
      pushMessage(tutor.id, { id: uid(), role: 'assistant', error: true, subjectId: sub.id, content: `**${err.message}**\n\n${err.hint || ''}\n\nPrueba con la opción **SVG**.`, createdAt: new Date().toISOString() });
      toast('error', err.message, err.hint);
    } finally { setSending(false); }
  };

  const openPrompt = (type: ResourceType) => { setParams({ ...defaultParams(subject?.name || ''), type }); setPromptOpen(true); };
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

  /* ───────── Cola: prompt/adjunto que llegaron antes de abrir el tutor ───────── */
  useEffect(() => {
    if (activeTutorId && queuedPrompt) { const p = queuedPrompt; setQueuedPrompt(null); void send(p, activeTutorId); }
  }, [activeTutorId, queuedPrompt]);
  useEffect(() => {
    if (activeTutorId && queuedAttach) { const r = queuedAttach; setQueuedAttach(null); void addExisting(r, activeTutorId); }
  }, [activeTutorId, queuedAttach]);

  const WELCOME = [
    { icon: '🧠', title: '¿Cómo estudio hoy?', prompt: `Con base en MIS apuntes, tareas y entregas de ${subject?.name || 'esta materia'}, recomiéndame un método de estudio y un plan para hoy.` },
    { icon: '📝', title: 'Guía para mi examen', prompt: 'Genera una guía de examen completa usando solo los apuntes que recuerdas de esta materia.' },
    { icon: '📅', title: '¿Qué entrego pronto?', prompt: 'Dime qué tareas, exámenes o proyectos de esta materia tengo próximos y cuánto falta para cada fecha.' },
    { icon: '✨', title: 'Ejercicios del tema', prompt: 'Crea 5 ejercicios de selección múltiple (a,b,c,d) sobre los temas de mis apuntes, con respuesta y explicación.' },
  ];

  return (
    <div className="view view--chat">
      <div className="chat-shell glass">
        <div className="chat-head">
          <div className="chat-head__id">
            {activeTutor && <IconButton label="Volver a los tutores" onClick={goBack}><ArrowLeft size={17} /></IconButton>}
            <span className="chat-head__avatar" style={subject ? { background: `${subject.color}22`, color: subject.color } : undefined}>{activeTutor ? <GraduationCap size={19} /> : <Bot size={19} />}</span>
            <div><strong>{activeTutor ? activeTutor.name : 'Tus tutores de IA'}</strong><span>{activeTutor ? `${subject?.icon || ''} ${subject?.name || 'Materia'} · ${settings.model}` : `${plural(state.tutors.length, 'tutor', 'tutores')} · uno por materia, con memoria aislada`}</span></div>
          </div>
          <div className="chat-head__tabs">
            <button className={tab === 'chat' ? 'is-active' : ''} onClick={() => setTab('chat')}><Wand2 size={14} /> {activeTutor ? 'Chat' : 'Tutores'}</button>
            <button className={tab === 'biblioteca' ? 'is-active' : ''} onClick={() => setTab('biblioteca')}><LibraryBig size={14} /> Biblioteca</button>
          </div>
          <div className="chat-head__actions">
            <Chip onClick={() => setMemoryOpen(true)}><BrainCircuit size={12} /> 🧠 {activeTutor ? ownMemories.length : state.memories.length} páginas</Chip>
            <IconButton label="Ver contexto de este tutor" onClick={() => setContextOpen(true)}><BrainCircuit size={16} /></IconButton>
            {activeTutor && <IconButton label="Limpiar este chat" onClick={() => setConfirmClear(true)}><Trash2 size={16} /></IconButton>}
            <IconButton label="Ajustes de IA" onClick={() => onNavigate('settings')}><Settings2 size={16} /></IconButton>
          </div>
        </div>

        {!hasKey && (
          <div className="chat-warning"><KeyRound size={18} /><div><strong>Para hablar con la IA necesitas tu propia API Key</strong><span>Se guarda solo en este navegador. El resto de la app funciona sin ella.</span></div><Button size="sm" variant="primary" onClick={() => onNavigate('settings')}>Configurar ahora</Button></div>
        )}
        {hasKey && !settings.vision && activeTutor && (
          <div className="chat-warning chat-warning--soft"><AlertCircle size={16} /><span>La visión está desactivada: el tutor usa la memoria de sus apuntes pero no ve las imágenes originales.</span><Button size="sm" variant="ghost" onClick={() => onNavigate('settings')}>Ajustes</Button></div>
        )}

        {tab === 'biblioteca' ? (
          <div className="chat-biblio"><Biblioteca compact subjectId={subject?.id} onNavigate={onNavigate} /></div>
        ) : !activeTutor ? (
          <div className="tutor-list">
            <div className="tutor-list__intro glass"><Sparkles size={20} /><div><strong>Un tutor por materia, sin mezclar temas</strong><span>Cada materia que creas genera automáticamente su tutor con su propio chat y su propia memoria. Las fotos que subas en «Fotos y apuntes → Materia» y las entregas que pongas en el Calendario solo las conoce el tutor de esa materia.</span></div></div>
            {state.tutors.length === 0 ? (
              <EmptyState icon={<GraduationCap size={28} />} title="Aún no hay tutores" description="Crea una materia y su tutor de IA aparecerá aquí al instante." action={<Button variant="primary" icon={<Plus size={15} />} onClick={() => onNavigate('subjects')}>Crear materia</Button>} />
            ) : (
              <div className="tutor-grid">{state.tutors.map((t) => {
                const sub = state.subjects.find((s) => s.id === t.subjectId);
                if (!sub) return null;
                const mem = state.memories.filter((m) => m.subjectId === sub.id).length;
                const msgs = (state.tutorMessages[t.id] || []).length;
                const deadlines = state.events.filter((e) => e.subjectId === sub.id && !e.done).length;
                return (
                  <button key={t.id} className="tutor-card glass" style={{ '--tutor-color': sub.color } as React.CSSProperties} onClick={() => selectTutor(t.id)}>
                    <span className="tutor-card__icon">{sub.icon}</span>
                    <div className="tutor-card__body"><strong>{t.name}</strong><span>{sub.name} · {sub.folder || 'Sin carpeta'}</span></div>
                    <div className="tutor-card__meta"><span><BrainCircuit size={12} /> {mem} apuntes</span><span><CalendarDays size={12} /> {deadlines} entregas</span><span><Bot size={12} /> {msgs} mensajes</span></div>
                    <em>Solo sabe de {sub.name} <ChevronRight size={13} /></em>
                  </button>
                );
              })}</div>
            )}
            <div className="tutor-list__foot"><Button icon={<Plus size={15} />} onClick={() => onNavigate('subjects')}>Crear otra materia (y su tutor)</Button><Button icon={<Clipboard size={15} />} onClick={() => onNavigate('exercises')}>Ir a Ejercicios diarios</Button></div>
          </div>
        ) : (
          <>
            <div className="chat-tutor-bar glass"><BrainCircuit size={15} /><span>Este chat solo conoce los apuntes, tareas y fechas de <b>{subject?.name}</b>. {ownMemories.length ? `${plural(ownMemories.length, 'página recordada', 'páginas recordadas')}` : 'Aún sin apuntes analizados'} · {plural(ownDeadlines.length, 'entrega', 'entregas')} en su calendario.</span><Button size="sm" onClick={() => onNavigate('library')}>Subir apuntes</Button></div>
            <div className="chat-scroll" ref={scrollRef} onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); addFiles(Array.from(e.dataTransfer.files || [])); }}>
              {messages.length === 0 && !sending && (
                <div className="chat-welcome">
                  <div className="chat-welcome__icon"><Sparkles size={30} /></div>
                  <h2>Hola, soy el {activeTutor.name}</h2>
                  <p>Solo recuerdo las páginas que subiste en <b>Fotos y apuntes → {subject?.name}</b> y las entregas de esta materia. No mezclo información de otros tutores. Mándame audios, PDFs, Word, Excel o PowerPoint con el botón <b>+</b>.</p>
                  <div className="chat-welcome__cards">{WELCOME.map((w) => <button key={w.title} className="glass" onClick={() => void send(w.prompt)}><i>{w.icon}</i><strong>{w.title}</strong><span>{w.prompt}</span></button>)}</div>
                </div>
              )}
              {messages.map((m) => <Message key={m.id} message={m} imageNames={imageNames} assistantName={activeTutor.name} />)}
              {sending && (
                <div className="message message--ai">
                  <div className="message__avatar"><Bot size={16} /></div>
                  <div className="message__bubble"><div className="message__meta"><strong>{activeTutor.name}</strong><span>{searchingWeb ? 'web' : 'en vivo'}</span></div>{stream ? <Markdown text={stream} /> : <div className="typing"><span /><span /><span /> {searchingWeb ? 'Buscando en internet…' : 'Escribiendo…'}</div>}<span className="stream-caret" /></div>
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
              <div className="recording-bar"><span className="recording-bar__dot" /><strong>Grabando {formatClock(recSeconds)}</strong>{dictation && <span className="recording-bar__dictation">“{dictation.slice(0, 90)}…”</span>}<Button size="sm" variant="primary" icon={<Square size={13} />} onClick={() => recorderRef.current?.stop()}>Detener y adjuntar</Button><Button size="sm" variant="ghost" onClick={cancelRecording}>Cancelar</Button></div>
            )}

            {settings.webSearch && (
              <div className="web-pill-row">
                <span className="web-pill glass">
                  <Globe size={13} /> 🌐 Búsqueda web activa
                  <button type="button" aria-label="Apagar búsqueda web" onClick={() => toggleWebSearch(false)}><X size={12} /></button>
                </span>
              </div>
            )}

            <div className="composer composer--capsule" onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); addFiles(Array.from(e.dataTransfer.files || [])); }}>
              <div className="dropdown composer-plus" ref={plusRef}>
                <IconButton label="Acciones del chat y búsqueda web" className={`composer-plus__btn ${plusOpen ? 'is-open' : ''}`} onClick={() => setPlusOpen((v) => !v)}><Plus size={19} /></IconButton>
                {plusOpen && (
                  <div className="composer-menu glass">
                    <span className="dropdown__label">Acciones · {activeTutor.name}</span>
                    <button type="button" onClick={() => { fileRef.current?.click(); setPlusOpen(false); }}><ImagePlus size={15} /><span><strong>Subir imagen / Foto del cuaderno</strong><small>Analiza apuntes o sube PDF, DOCX, XLSX, PPTX, TXT…</small></span></button>
                    <button type="button" className={`composer-menu__web ${settings.webSearch ? 'is-on' : ''}`} role="switch" aria-checked={Boolean(settings.webSearch)} onClick={() => toggleWebSearch()}>
                      <Globe size={15} />
                      <span><strong>Búsqueda en la Web</strong><small>{settings.tavilyKey?.trim() ? 'Tavily gratuito listo · busca datos al día' : 'OpenRouter :online · datos actualizados'}</small></span>
                      <i className={`composer-switch ${settings.webSearch ? 'is-on' : ''}`} aria-hidden="true" />
                    </button>
                    <button type="button" onClick={() => void startRecording()}><Mic size={15} /><span><strong>Grabar audio</strong><small>Nota de voz con dictado / transcripción</small></span></button>
                    <button type="button" onClick={() => { setAttachOpen(true); setPlusOpen(false); }}><FolderOpen size={15} /><span><strong>Adjuntar apunte</strong><small>Solo apuntes de {subject?.name}</small></span></button>
                    <button type="button" onClick={() => void pasteImage()}><Clipboard size={15} /><span><strong>Pegar imagen</strong><small>Desde el portapapeles</small></span></button>
                    <button type="button" onClick={() => { setTab('biblioteca'); setPlusOpen(false); }}><LibraryBig size={15} /><span><strong>Ver biblioteca</strong><small>Archivos de esta materia</small></span></button>
                  </div>
                )}
              </div>
              <input ref={fileRef} type="file" multiple hidden onChange={onFileInput} />
              <textarea className="composer__input" rows={1} value={input} placeholder={`Pregúntale al tutor de ${subject?.name}… (Enter envía)`} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send(input); } }} />
              {sending ? <Button variant="danger" size="sm" icon={<Square size={13} />} onClick={() => abortRef.current?.abort()}>Detener</Button>
                : <Button variant="primary" className="composer__send" icon={<Send size={15} />} onClick={() => void send(input)} disabled={!input.trim() && !pendingImages.length && !pendingItems.length}>Enviar</Button>}
            </div>
            <div className="composer__foot"><span><Wand2 size={12} /> Recursos con copiar · previsualizar · descargar. Cada respuesta tiene 🔊.</span><span><Volume2 size={12} /> Text to speech activo</span></div>
          </>
        )}
      </div>

      <Modal open={promptOpen} onClose={() => setPromptOpen(false)} title={RESOURCES.find((r) => r.id === params.type)?.label || 'Generar con IA'} subtitle={`El tutor de ${subject?.name} usará solo su memoria y sus entregas.`} footer={<>
        <Button variant="ghost" onClick={() => setPromptOpen(false)}>Cancelar</Button>
        <Button variant="primary" icon={<Sparkles size={15} />} onClick={runPrompt} disabled={sending}>{params.type === 'image' && params.raster ? 'Generar imagen' : 'Generar respuesta'}</Button>
      </>}>
        <Field label="Tipo de recurso"><div className="resource-grid">{RESOURCES.map((r) => <button key={r.id} className={params.type === r.id ? 'is-active' : ''} onClick={() => setParams({ ...params, type: r.id, raster: false })}><i>{r.icon}</i><strong>{r.label}</strong><small>{r.hint}</small></button>)}</div></Field>
        <div className="form-row">
          <Field label="Materia" hint="Fijada a este tutor para no mezclar contenidos."><input className="input" value={params.subject} readOnly /></Field>
          <Field label="Dificultad"><select className="select" value={params.difficulty} onChange={(e) => setParams({ ...params, difficulty: e.target.value })}><option value="baja">Baja · repaso</option><option value="media">Media</option><option value="alta">Alta · me cuesta</option></select></Field>
        </div>
        <Field label="Tema concreto"><input className="input" value={params.topic} onChange={(e) => setParams({ ...params, topic: e.target.value })} placeholder="Ej. Integrales por partes, la célula…" /></Field>
        <Field label={`Tiempo disponible: ${params.minutes} minutos`}><input type="range" min={15} max={240} step={15} value={params.minutes} onChange={(e) => setParams({ ...params, minutes: Number(e.target.value) })} className="range" /></Field>
        {params.type === 'image' && <label className="toggle-row"><span><strong>Usar modelo de imágenes</strong><small>Apagado = SVG vectorial editable. Encendido = endpoint /images/generations.</small></span><input type="checkbox" checked={params.raster} onChange={(e) => setParams({ ...params, raster: e.target.checked })} /><span className="toggle" aria-hidden="true" /></label>}
      </Modal>

      <Modal open={attachOpen} onClose={() => setAttachOpen(false)} title={`Adjuntar apuntes de ${subject?.name}`} subtitle="Este tutor solo puede ver las páginas subidas en su materia." size="lg" footer={<>
        <Button variant="ghost" onClick={() => { setPendingImages([]); setAttachOpen(false); }}>Quitar todos</Button>
        <Button variant="primary" onClick={() => setAttachOpen(false)}>Listo ({pendingImages.length})</Button>
      </>}>
        {ownImages.length === 0 ? <EmptyState icon={<ImagePlus size={26} />} title="Aún no hay apuntes de esta materia" description={`Sube fotos en Fotos y apuntes → ${subject?.name}.`} action={<Button variant="primary" onClick={() => { setAttachOpen(false); onNavigate('library'); }}>Ir a subir fotos</Button>} /> : (
          <div className="attach-grid">{ownImages.map((img) => {
            const active = pendingImages.includes(img.id);
            return <button key={img.id} className={`attach-item ${active ? 'is-active' : ''}`} onClick={() => setPendingImages((a) => active ? a.filter((x) => x !== img.id) : [...a, img.id])}>
              <BlobImage blobKey={img.blobKey} alt={img.name} /><span><strong>{img.name}</strong><small>{img.aiSummary ? 'En la memoria del tutor' : 'Sin analizar'}</small></span>{img.aiSummary && <i><Sparkles size={12} /></i>}{active && <b className="attach-check">✓</b>}
            </button>;
          })}</div>
        )}
      </Modal>

      <Modal open={memoryOpen} onClose={() => setMemoryOpen(false)} title={activeTutor ? `🧠 Memoria de ${activeTutor.name}` : '🧠 Memoria de todos los tutores'} subtitle="Cada tutor recuerda ÚNICAMENTE las páginas de su materia." size="lg" footer={<>
        <Button icon={<Files size={14} />} onClick={() => { setMemoryOpen(false); setTab('biblioteca'); }}>Ver biblioteca</Button>
        <Button variant="primary" onClick={() => setMemoryOpen(false)}>Entendido</Button>
      </>}>
        {(activeTutor ? ownMemories : state.memories).length === 0 && <EmptyState icon={<BrainCircuit size={26} />} title="Sin recuerdos todavía" description="Sube una foto en Fotos y apuntes eligiendo la materia y pulsa «Absorber con IA»." />}
        <div className="memory-list">{(activeTutor ? ownMemories : state.memories).map((m) => (
          <div key={m.id} className="memory-card"><div className="memory-card__head"><BlobImage blobKey={m.blobKey} alt={m.name} /><div><strong>{m.name}</strong><small>{imageNames[m.subjectId] || 'Sin materia'} · {new Date(m.createdAt).toLocaleDateString('es')}</small></div></div><p>{m.summary}</p></div>
        ))}</div>
      </Modal>

      <Modal open={contextOpen} onClose={() => setContextOpen(false)} title="Contexto que recibe este tutor" subtitle={activeTutor ? `Solo datos de ${subject?.name}. Ninguna otra materia aparece aquí.` : 'Vista global de todos los tutores.'} size="lg" footer={<Button variant="primary" onClick={() => setContextOpen(false)}>Entendido</Button>}>
        <p className="muted">Apuntes: {activeTutor ? ownImages.length : state.images.length} · Recuerdos: {activeTutor ? ownMemories.length : state.memories.length} · Entregas de esta materia: {activeTutor ? ownDeadlines.length : state.events.length}</p>
        <pre className="context-pre">{buildSystemPrompt(state, subject?.id)}</pre>
      </Modal>

      <ConfirmModal open={confirmClear} onClose={() => setConfirmClear(false)} onConfirm={() => {
        if (activeTutor) update((d) => { d.tutorMessages[activeTutor.id] = []; });
        toast('info', 'Chat limpiado', 'La memoria de los apuntes de esta materia se conserva.');
      }} title="¿Limpiar este chat?" message={`Se borrarán los mensajes de ${activeTutor?.name || 'este tutor'}, pero NO su memoria ni la de los demás tutores.`} confirmLabel="Limpiar chat" />
    </div>
  );
}
