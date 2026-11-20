import type { AISettings, AppState, ID } from '../types';
import { USE_PROXY } from '../data/defaults';
import { blobToDataUrl } from './imageStore';
import { dateKey, parseLocal, pct, plural, sessionStreak, shortDate } from './utils';
import { resizeBlobForVision } from './files';

export interface AttachedImage { mime: string; dataUrl: string }
export interface ChatTurn {
  role: 'system' | 'user' | 'assistant';
  content: string;
  images?: AttachedImage[];
}

export class AIError extends Error {
  constructor(message: string, public hint?: string) {
    super(message);
    this.name = 'AIError';
  }
}

const ARTIFACT_RULES = `
REGLAS PARA RECURSOS QUE GENERES (muy importante):
Cuando entregues un recurso descargable, incluye SIEMPRE un bloque de código vallado con el lenguaje exacto, además de una breve explicación fuera del bloque:
- \`\`\`html  → página o animación web autocontenida (HTML + CSS + JS en un solo archivo, sin recursos externos).
- \`\`\`svg   → imagen vectorial completa (<svg ...>...</svg>), sin texto fuera del SVG dentro del bloque.
- \`\`\`csv   → tabla/datos para hoja de cálculo, con cabecera y filas separadas por comas.
- \`\`\`slides → SOLO un JSON array de diapositivas: [{"title":"...","bullets":["...","..."],"notes":"..."}]. Debe ser JSON válido.
- \`\`\`js / \`\`\`ts / \`\`\`python / \`\`\`css (o cualquier lenguaje) → código listo para copiar.
Para guías de examen usa este orden: 1) conceptos clave, 2) resumen claro, 3) ejemplos resueltos, 4) preguntas de repaso con respuesta, 5) plan de estudio por sesiones.
Para métodos de estudio adapta la recomendación al tema, la dificultad y el tiempo disponible, y explica por qué ese método conviene.
Nunca inventes haber visto el contenido de una imagen, PDF o archivo si no recibiste el contenido o su resumen; usa solo el contexto disponible.`;


/**
 * Prompt de un TUTOR DE MATERIA. Aislamiento estricto:
 * solo ve apuntes, memorias, archivos, tareas y entregas de SU materia.
 * Nunca recibe los nombres ni los contenidos de las demás materias.
 */
export function buildTutorSystemPrompt(state: AppState, subjectId: ID): string {
  const subject = state.subjects.find((x) => x.id === subjectId);
  if (!subject) return buildSystemPrompt(state);
  const s = state.settings;
  const own = <T extends { subjectId: ID | '' }>(arr: T[]) => arr.filter((x) => x.subjectId === subjectId);

  const tasks = own(state.tasks);
  const done = tasks.filter((t) => t.done);
  const pending = tasks.filter((t) => !t.done);
  const memories = own(state.memories);
  const pages = own(state.images);
  const files = own(state.chatFiles);
  const events = [...own(state.events)].sort((a, b) => parseLocal(a.date).getTime() - parseLocal(b.date).getTime());
  const sessions = own(state.sessions);
  const minutes = Math.round(sessions.reduce((n, x) => n + x.durationSec, 0) / 60);

  const memoryText = memories.map((m) =>
    `### ${m.name} · ${shortDate(new Date(m.createdAt))}\n${m.summary}`).join('\n\n').slice(0, 20000);
  const pagesText = pages.slice(0, 40).map((i) =>
    `- "${i.name}" · ${shortDate(new Date(i.createdAt))} · etiquetas: ${i.tags.join(', ') || '—'} · notas: ${i.notes || '—'}${i.aiSummary ? ` · RESUMEN IA: ${i.aiSummary}` : ''}`).join('\n');
  const filesText = files.slice(-12).map((f) =>
    `- "${f.name}" [${f.kind}] · ${shortDate(new Date(f.createdAt))}${f.extractedText ? `\nCONTENIDO:\n${f.extractedText.slice(0, 1800)}` : ''}`).join('\n\n').slice(0, 18000);
  const deadlines = events.filter((e) => !e.done).slice(0, 20).map((e) =>
    `- ${e.date.replace('T', ' ')} · ${e.title} (${e.type})${e.description ? `: ${e.description}` : ''}`).join('\n');
  const pastEvents = events.filter((e) => e.done).slice(-5).map((e) =>
    `- ${e.date.replace('T', ' ')} · ${e.title} (completada)`).join('\n');

  return `Eres **${`Tutor de ${subject.name}`}**, el asistente de IA EXCLUSIVO de la materia «${subject.name}» (carpeta: ${subject.folder || 'sin carpeta'}) en "My Study Center". ${s.persona || 'Responde siempre en español.'}

🚫 REGLA DE AISLAMIENTO (la más importante):
- SOLO tienes acceso a los apuntes, temas, tareas, archivos y fechas de entrega de «${subject.name}».
- NO conoces el contenido de ninguna otra materia. No inventes, no mezcles, no cites ni compares con otras materias.
- Si te preguntan por otra materia o por apuntes que no están en tu memoria, responde con honestidad: «No tengo acceso a esa materia; abre su propio tutor en Chat de IA». Nunca respondas usando datos de otras materias.
- El usuario sube las fotos de su cuaderno en «Fotos y apuntes» eligiendo la materia; las de ${subject.name} son las ÚNICAS que tú recuerdas.

🧠 MEMORIA: las páginas analizadas quedan grabadas aquí. Recuérdalas en TODAS las conversaciones de este chat aunque no las adjunten de nuevo. Cita el nombre de la página cuando uses su contenido. Si te preguntan qué recuerdas, responde solo con tu memoria.

📅 FECHAS: cuando te pregunten por entregas, exámenes o proyectos, usa EXCLUSIVAMENTE la lista de «ENTREGAS DE ESTA MATERIA» y la fecha de hoy para calcular cuánto falta. Esas fechas las puso el usuario en el Calendario eligiendo esta materia.

HOY: ${dateKey(new Date())}

AVANCE DE «${subject.name}»:
- Tareas: ${plural(done.length, 'hecha', 'hechas')} de ${tasks.length} (${pct(done.length, tasks.length)}%).
- Pendientes: ${pending.map((t) => t.title).join(', ') || 'ninguna'}.
- Sesiones de estudio registradas en esta materia: ${plural(sessions.length, 'sesión', 'sesiones')}, ${minutes} minutos en total.

🧠 MEMORIA DE MIS APUNTES (temas que me alimentaron):
${memoryText || 'Aún no se ha analizado ninguna página de esta materia. Pide al usuario que suba fotos en Fotos y apuntes → ' + subject.name + '.'}

PÁGINAS SUBIDAS EN ESTA MATERIA:
${pagesText || 'Aún no hay páginas subidas.'}

ARCHIVOS QUE ME ENVIARON EN ESTE CHAT:
${filesText || 'Aún no se han enviado archivos.'}

ENTREGAS DE ESTA MATERIA (calendario):
${deadlines || 'Sin entregas pendientes en esta materia.'}
${pastEvents ? `\nENTREGAS YA COMPLETADAS:\n${pastEvents}` : ''}

${ARTIFACT_RULES}`;
}

/** Contexto global (compatibilidad / vista general). Los tutores usan buildTutorSystemPrompt. */
export function buildSystemPrompt(state: AppState, subjectId?: ID): string {
  if (subjectId) return buildTutorSystemPrompt(state, subjectId);
  const s = state.settings;
  const subjectLine = state.subjects.map((sub) => {
    const total = state.tasks.filter((t) => t.subjectId === sub.id).length;
    const done = state.tasks.filter((t) => t.subjectId === sub.id && t.done).length;
    return `- ${sub.name} (carpeta: ${sub.folder || 'sin carpeta'}): ${pct(done, total)}% · ${plural(done, 'tarea hecha', 'tareas hechas')} de ${total}. Pendientes: ${state.tasks.filter((t) => t.subjectId === sub.id && !t.done).map((t) => t.title).join(', ') || 'ninguna'}.`;
  }).join('\n');

  const memoryLines = state.memories.map((m) => {
    const sub = state.subjects.find((x) => x.id === m.subjectId)?.name || 'Sin materia';
    return `### ${m.name} · ${sub} · ${shortDate(new Date(m.createdAt))}\n${m.summary}`;
  }).join('\n\n').slice(0, 20000);

  const pages = state.images.slice(0, 40).map((img) => {
    const sub = state.subjects.find((x) => x.id === img.subjectId)?.name || 'Sin materia';
    return `- "${img.name}" · ${sub} · ${shortDate(new Date(img.createdAt))} · etiquetas: ${img.tags.join(', ') || '—'} · notas: ${img.notes || '—'}${img.aiSummary ? ` · RESUMEN IA: ${img.aiSummary}` : ''}`;
  }).join('\n');

  const files = state.chatFiles.slice(-12).map((f) => {
    const text = f.extractedText ? `\nCONTENIDO EXTRAÍDO:\n${f.extractedText.slice(0, 1800)}` : '\n(sin texto extraído: archivo binario o imagen)';
    return `- "${f.name}" [${f.kind}] · ${shortDate(new Date(f.createdAt))}${text}`;
  }).join('\n\n').slice(0, 18000);

  const days = Array.from(new Set(state.sessions.map((x) => x.day)));
  const totalSec = state.sessions.reduce((n, x) => n + x.durationSec, 0);
  const recentSessions = [...state.sessions].sort((a, b) => b.startedAt.localeCompare(a.startedAt)).slice(0, 10)
    .map((x) => `- ${x.day} · ${Math.round(x.durationSec / 60)} min · ${state.subjects.find((s) => s.id === x.subjectId)?.name || 'General'}${x.note ? ` · ${x.note}` : ''}`).join('\n');

  const deadlines = [...state.events]
    .filter((e) => !e.done)
    .sort((a, b) => parseLocal(a.date).getTime() - parseLocal(b.date).getTime())
    .slice(0, 12)
    .map((e) => {
      const sub = state.subjects.find((x) => x.id === e.subjectId)?.name || 'General';
      return `- ${e.date.replace('T', ' ')} · ${e.title} (${e.type}, ${sub})${e.description ? `: ${e.description}` : ''}`;
    }).join('\n');

  const habits = state.habits.map((h) => `- ${h.name}: ${h.dates.length} días marcados, objetivo ${h.goal}/semana.`).join('\n');

  return `Eres el asistente de estudio de "My Study Center". ${s.persona || 'Responde en español.'}

REGLAS DE MEMORIA: el usuario sube fotos de su cuaderno ÚNICAMENTE desde la sección "Fotos y apuntes". Esas páginas se analizan y quedan grabadas en tu MEMORIA. Debes recordarlas y usarlas en CUALQUIER conversación del chat, aunque el usuario no las adjunte de nuevo. Cita la página por su nombre cuando uses su contenido. Si te preguntan qué recuerdas, responde a partir de la memoria y del historial de la biblioteca.

CONTEXTO REAL DEL ESTUDIANTE (fecha de hoy: ${dateKey(new Date())}):

MATERIAS Y AVANCE:
${subjectLine || 'Sin materias registradas todavía.'}

🧠 MEMORIA DE PÁGINAS ANALIZADAS (recuerdos permanentes de sus apuntes):
${memoryLines || 'Aún no se ha analizado ninguna página.'}

APUNTES / IMÁGENES SUBIDAS (biblioteca):
${pages || 'Aún no hay imágenes subidas.'}

ARCHIVOS ENVIADOS AL CHAT (PDF, DOCX, XLSX, PPTX, texto, audio transcrito):
${files || 'Aún no se han enviado archivos al chat.'}

SESIONES DE ESTUDIO REALES (racha = días consecutivos con sesión terminada):
${state.sessions.length ? `Racha actual: ${sessionStreak(days)} días · ${plural(state.sessions.length, 'sesión', 'sesiones')} · ${(totalSec / 3600).toFixed(1)} h totales.\n${recentSessions}` : 'Sin sesiones registradas todavía.'}

PRÓXIMAS ENTREGAS:
${deadlines || 'Sin entregas registradas.'}

HÁBITOS:
${habits || 'Sin hábitos registrados.'}

${ARTIFACT_RULES}`;
}

function endpoint(settings: AISettings) {
  const base = (settings.baseUrl || 'https://openrouter.ai/api/v1').replace(/\/$/, '');
  return `${base}/chat/completions`;
}

function authHeaders(settings: AISettings): Record<string, string> {
  const h: Record<string, string> = { 'Content-Type': 'application/json' };
  if (settings.apiKey.trim()) h.Authorization = `Bearer ${settings.apiKey.trim()}`;
  if (/openrouter\.ai/i.test(settings.baseUrl) || settings.provider === 'openrouter') {
    if (typeof window !== 'undefined') {
      h['HTTP-Referer'] = window.location.origin;
      h['X-Title'] = 'My Study Center';
    }
  }
  return h;
}

async function readableError(res: Response): Promise<AIError> {
  let detail = '';
  try {
    const j = await res.clone().json();
    detail = String(j?.error?.message || j?.message || j?.error || '').slice(0, 300);
  } catch { detail = (await res.text().catch(() => '')).slice(0, 200); }
  if (res.status === 401 || res.status === 403) return new AIError('API Key inválida o sin permisos.', 'Revisa la clave en Ajustes y que el modelo esté disponible en tu cuenta.');
  if (res.status === 429) return new AIError('Límite de peticiones alcanzado.', 'Los modelos :free de OpenRouter tienen cuota; espera unos segundos o cambia de modelo.');
  if (res.status === 404) return new AIError('Modelo o endpoint no encontrado.', 'Comprueba el nombre del modelo y la URL base en Ajustes.');
  if (res.status >= 500) return new AIError('El proveedor de IA tuvo un error.', 'Inténtalo de nuevo en unos instantes.');
  return new AIError(detail ? `Error ${res.status}: ${detail}` : `Error ${res.status} en la petición.`);
}

function toOpenAIMessages(turns: ChatTurn[]) {
  return turns.map((t) => {
    if (t.images?.length && t.role === 'user') {
      return {
        role: 'user',
        content: [
          { type: 'text', text: t.content },
          ...t.images.map((img) => ({ type: 'image_url', image_url: { url: img.dataUrl, detail: 'high' } })),
        ],
      };
    }
    return { role: t.role, content: t.content };
  });
}

function chatBody(settings: AISettings, turns: ChatTurn[], stream: boolean) {
  return {
    model: settings.model,
    messages: toOpenAIMessages(turns),
    ...(/^o\d/.test(settings.model) ? {} : { temperature: settings.temperature }),
    stream,
  };
}

/** Proxy serverless de Vercel: la clave queda en el servidor, nunca en el bundle. */
export async function proxyRequest(settings: AISettings, path: string, body: unknown): Promise<unknown> {
  let res: Response;
  try {
    res = await fetch('/api/ai', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ baseUrl: settings.baseUrl, path, body, extraHeaders: { 'HTTP-Referer': window.location.origin, 'X-Title': 'My Study Center' } }),
    });
  } catch {
    throw new AIError('No se pudo contactar al proxy de IA (/api/ai).', 'Si estás en desarrollo local, desactiva VITE_AI_PROXY; en Vercel la función api/ai.mjs se despliega automáticamente.');
  }
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new AIError(String(j?.error?.message || `Error ${res.status}`), 'Revisa AI_API_KEY en las variables de entorno de Vercel.');
  return j;
}

async function proxyChat(settings: AISettings, turns: ChatTurn[], signal?: AbortSignal, onToken?: (c: string) => void): Promise<string> {
  const j = await proxyRequest(settings, '/chat/completions', chatBody(settings, turns, false)) as { choices?: Array<{ message?: { content?: unknown } }> };
  const content = j?.choices?.[0]?.message?.content;
  const text = typeof content === 'string' ? content : Array.isArray(content) ? content.map((p: { text?: string }) => p.text || '').join('') : '';
  if (!text) throw new AIError('El modelo no devolvió contenido.', 'Prueba con otro modelo en Ajustes.');
  if (signal?.aborted) throw new DOMException('Abortado', 'AbortError');
  onToken?.(text);
  return text;
}

/** OpenAI-compatible streaming chat (OpenRouter, OpenAI, Ollama, LM Studio…). */
async function openAICompatible(settings: AISettings, turns: ChatTurn[], signal?: AbortSignal, onToken?: (chunk: string) => void): Promise<string> {
  const stream = Boolean(onToken);
  const res = await fetch(endpoint(settings), {
    method: 'POST', headers: authHeaders(settings), signal,
    body: JSON.stringify(chatBody(settings, turns, stream)),
  });
  if (!res.ok) throw await readableError(res);

  if (!stream || !res.body) {
    const j = await res.json();
    const text = j?.choices?.[0]?.message?.content;
    if (typeof text === 'string') return text;
    if (Array.isArray(text)) return text.map((p: { text?: string }) => p.text || '').join('');
    throw new AIError('La respuesta del modelo no trajo texto.', 'Prueba con otro modelo en Ajustes.');
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let full = '';
  const consume = (part: string) => {
    for (const line of part.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data:')) continue;
      const data = trimmed.slice(5).trim();
      if (data === '[DONE]') continue;
      try {
        const j = JSON.parse(data);
        const delta = j?.choices?.[0]?.delta?.content;
        const chunk = typeof delta === 'string' ? delta : Array.isArray(delta) ? delta.map((p: { text?: string }) => p.text || '').join('') : '';
        if (chunk) { full += chunk; onToken?.(chunk); }
      } catch { /* keep-alive / marco parcial */ }
    }
  };
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split(/\r?\n\r?\n/);
    buffer = parts.pop() || '';
    parts.forEach(consume);
  }
  if (buffer.trim()) consume(buffer);
  if (!full) {
    try {
      const j = JSON.parse(buffer);
      const text = j?.choices?.[0]?.message?.content || j?.choices?.[0]?.text;
      if (typeof text === 'string') { onToken?.(text); return text; }
    } catch { /* sin fallback */ }
    throw new AIError('El modelo no devolvió contenido.', 'Prueba de nuevo o cambia de modelo.');
  }
  return full;
}

/** Google Gemini REST API (non-streaming). */
async function gemini(settings: AISettings, turns: ChatTurn[], signal?: AbortSignal, onToken?: (chunk: string) => void): Promise<string> {
  const system = turns.filter((t) => t.role === 'system').map((t) => t.content).join('\n\n');
  const contents = turns.filter((t) => t.role !== 'system').map((t) => ({
    role: t.role === 'assistant' ? 'model' : 'user',
    parts: [
      { text: t.content },
      ...(t.images || []).map((img) => ({ inline_data: { mime_type: img.mime, data: img.dataUrl.split(',')[1] } })),
    ],
  }));
  const configured = (settings.baseUrl || '').replace(/\/$/, '');
  const base = configured && !/openai\.com|openrouter\.ai/i.test(configured) ? configured : 'https://generativelanguage.googleapis.com/v1beta';
  const url = `${base}/models/${encodeURIComponent(settings.model)}:generateContent?key=${encodeURIComponent(settings.apiKey.trim())}`;
  const res = await fetch(url, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, signal,
    body: JSON.stringify({ systemInstruction: system ? { parts: [{ text: system }] } : undefined, contents, generationConfig: { temperature: settings.temperature } }),
  });
  if (!res.ok) throw await readableError(res);
  const j = await res.json();
  const text = (j?.candidates?.[0]?.content?.parts || []).map((p: { text?: string }) => p.text || '').join('');
  if (!text) throw new AIError('La respuesta de Gemini llegó vacía.', 'Puede que el modelo haya bloqueado el contenido o que falte permiso.');
  onToken?.(text);
  return text;
}

export async function callAI(options: {
  settings: AISettings; turns: ChatTurn[]; signal?: AbortSignal; onToken?: (chunk: string) => void;
}): Promise<string> {
  const { settings, turns, signal, onToken } = options;
  if (!settings.apiKey.trim() && !USE_PROXY) {
    throw new AIError('Falta la API Key.', 'Abre Ajustes → Inteligencia Artificial y pega tu clave. Se guarda solo en este navegador.');
  }
  if (!settings.model.trim()) throw new AIError('Falta el modelo.', 'Escribe o elige un modelo en Ajustes.');
  try {
    if (USE_PROXY && settings.provider !== 'gemini') return await proxyChat(settings, turns, signal, onToken);
    if (settings.provider === 'gemini') return await gemini(settings, turns, signal, onToken);
    return await openAICompatible(settings, turns, signal, onToken);
  } catch (e) {
    if (e instanceof AIError) throw e;
    if ((e as Error).name === 'AbortError') throw e;
    throw new AIError('No se pudo conectar con el proveedor de IA.', 'Revisa tu conexión, la URL base y que el proveedor permita peticiones desde el navegador (CORS).');
  }
}

export async function testConnection(settings: AISettings): Promise<string> {
  const text = await callAI({ settings, turns: [
    { role: 'system', content: 'Responde con una sola frase corta en español.' },
    { role: 'user', content: 'Confirma que la conexión funciona.' },
  ] });
  return text.slice(0, 160);
}

/** "Absorbe" una página: el modelo con visión lee la imagen y escribe un recuerdo durable. */
export async function analyzeImage(settings: AISettings, blob: Blob, name: string, subjectName = ''): Promise<string> {
  // Comprimimos antes de enviar: reduce coste y evita el límite de tamaño del proxy.
  const small = await resizeBlobForVision(blob);
  const dataUrl = await blobToDataUrl(small);
  return callAI({
    settings: { ...settings, vision: true },
    turns: [
      { role: 'system', content: 'Eres un asistente de apuntes. Analiza la imagen y devuelve en español: 1) un resumen detallado de 6-10 líneas del contenido (fórmulas, definiciones, esquemas, ejercicios, todo lo que veas), 2) los conceptos/temas clave separados por comas, 3) 3 preguntas de repaso. No uses bloques de código. Sé concreto y fiel a lo que ves. Este texto se guardará como memoria permanente para futuras conversaciones.' },
      { role: 'user', content: `Analiza esta página de mi cuaderno llamada "${name}"${subjectName ? `, de la materia ${subjectName}` : ''} y recuerda su contenido para futuras conversaciones con el tutor de esa materia.`, images: [{ mime: small.type || 'image/jpeg', dataUrl }] },
    ],
  });
}

/** Transcripción de audio por endpoint /audio/transcriptions (si el proveedor lo ofrece). */
export async function transcribeAudio(settings: AISettings, blob: Blob): Promise<string> {
  if (USE_PROXY) throw new AIError('Transcripción no disponible con el proxy activo.', 'Usa el dictado del navegador (se captura mientras grabas) o escribe una nota.');
  const base = (settings.baseUrl || '').replace(/\/$/, '');
  const form = new FormData();
  form.append('file', blob, 'audio.webm');
  form.append('model', settings.transcribeModel || 'whisper-1');
  let res: Response;
  try {
    res = await fetch(`${base}/audio/transcriptions`, { method: 'POST', headers: { Authorization: `Bearer ${settings.apiKey.trim()}` }, body: form });
  } catch { throw new AIError('No se pudo transcribir el audio.', 'Tu proveedor puede no ofrecer /audio/transcriptions.'); }
  if (!res.ok) throw await readableError(res);
  const j = await res.json();
  return String(j?.text || '').trim();
}

export interface GeneratedImageResult { dataUrl?: string; url?: string }
export async function generateRasterImage(settings: AISettings, prompt: string, signal?: AbortSignal): Promise<GeneratedImageResult> {
  if (!settings.apiKey.trim() && !USE_PROXY) throw new AIError('Falta la API Key.', 'Añádela en Ajustes para generar imágenes.');
  const body = { model: settings.imageModel || 'google/gemini-2.5-flash-image-preview', prompt, n: 1, size: '1024x1024' };
  let j: Record<string, unknown>;
  if (USE_PROXY) {
    j = await proxyRequest(settings, '/images/generations', body) as Record<string, unknown>;
  } else {
    const base = (settings.baseUrl || '').replace(/\/$/, '');
    let res: Response;
    try {
      res = await fetch(`${base}/images/generations`, { method: 'POST', headers: authHeaders(settings), signal, body: JSON.stringify(body) });
    } catch { throw new AIError('No se pudo conectar con el modelo de imágenes.', 'Revisa la URL base y tu conexión.'); }
    if (!res.ok) throw await readableError(res);
    j = await res.json();
  }
  const data = (j?.data as Array<Record<string, unknown>> | undefined)?.[0];
  if (data?.b64_json) return { dataUrl: `data:image/png;base64,${data.b64_json}` };
  if (data?.url) return { url: String(data.url) };
  if (typeof j?.url === 'string') return { url: j.url };
  throw new AIError('El modelo de imágenes no devolvió ninguna imagen.', 'Prueba otro modelo de imagen en Ajustes o usa la opción SVG.');
}

export async function attachmentDataUrls(blobs: Array<{ mime: string; blob: Blob }>): Promise<AttachedImage[]> {
  return Promise.all(blobs.map(async ({ mime, blob }) => {
    const small = await resizeBlobForVision(blob);
    return { mime, dataUrl: await blobToDataUrl(small) };
  }));
}
