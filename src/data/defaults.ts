import type { AppState, Subject, Task, CalendarEvent, Habit } from '../types';
import { addDays, dateKey, toLocalInput, uid } from '../lib/utils';
import { ensureTutors } from '../lib/tutors';
import { createAcademicCycle, ensureAcademic } from '../lib/academic';

/**
 * API Key solicitada por el usuario. Se inyecta en tiempo de BUILD desde
 * `.env.local` (NO está en el código versionado: el repo de GitHub es público).
 *
 * En Vercel, con VITE_AI_PROXY=1, este valor es '' y `api/ai.mjs` pone la clave
 * real desde AI_API_KEY en el servidor: el bundle del cliente no contiene nada.
 */
export const EMBEDDED_API_KEY = __CLIENT_AI_KEY__;
export const USE_PROXY = import.meta.env.VITE_AI_PROXY === '1';
export const DEFAULT_API_KEY = EMBEDDED_API_KEY;
export const DEFAULT_TAVILY_KEY = __CLIENT_TAVILY_KEY__;
export const DEFAULT_MODEL = import.meta.env.VITE_AI_MODEL || 'nvidia/nemotron-3.5-super-vl:free';
export const FALLBACK_MODEL = 'openrouter/free';

export const SUBJECT_COLORS = ['#6ee7ff', '#a78bfa', '#5b9cff', '#f7a8d8', '#7ef0c1', '#ffc978', '#ff8f8f', '#c0a6ff'];
export const SUBJECT_ICONS = ['📘', '🧮', '🧪', '🧠', '🌍', '💻', '📐', '🎨', '📚', '⚡', '🔬', '✍️'];

export const BASE_URLS: Record<AppState['settings']['provider'], string> = {
  openrouter: 'https://openrouter.ai/api/v1',
  openai: 'https://api.openai.com/v1',
  gemini: 'https://generativelanguage.googleapis.com/v1beta',
  custom: 'http://localhost:11434/v1',
};

export const defaultSettings: AppState['settings'] = {
  provider: 'openrouter',
  apiKey: DEFAULT_API_KEY,
  tavilyKey: DEFAULT_TAVILY_KEY,
  baseUrl: BASE_URLS.openrouter,
  model: DEFAULT_MODEL,
  fallbackModel: FALLBACK_MODEL,
  webSearch: false,
  temperature: 0.6,
  vision: true,
  imageModel: 'google/gemini-2.5-flash-image-preview',
  transcribeModel: 'whisper-1',
  autoAbsorb: true,
  dailyQuizzes: true,
  ttsRate: 1,
  ttsVoice: '',
  persona: 'Responde siempre en español, con un tono cercano, claro y motivador.',
};

export const MODEL_SUGGESTIONS: Record<AppState['settings']['provider'], string[]> = {
  openrouter: ['nvidia/nemotron-3.5-super-vl:free', 'openrouter/free', 'google/gemini-2.0-flash-exp:free', 'meta-llama/llama-3.3-70b-instruct:free', 'qwen/qwen2.5-vl-72b-instruct:free'],
  openai: ['gpt-4o-mini', 'gpt-4o', 'gpt-4.1-mini', 'gpt-4.1', 'o4-mini'],
  gemini: ['gemini-2.0-flash', 'gemini-2.5-flash', 'gemini-2.5-pro'],
  custom: ['gpt-4o-mini', 'llama-3.3-70b', 'qwen2.5-72b', 'modelo-local'],
};

/** Estado inicial: COMPLETAMENTE VACÍO. Todo se crea manualmente. */
export function createEmptyState(): AppState {
  return {
    version: 4,
    subjects: [], tutors: [], tutorMessages: {}, messages: [],
    tasks: [], images: [], chatFiles: [], memories: [],
    sessions: [], activeSession: null, events: [], habits: [],
    quizzes: [], quizAttempts: {}, englishLevel: 'B1',
    pentagonSubjectIds: [],
    settings: { ...defaultSettings },
    accent: 'aurora',
    notificationsEnabled: false,
    seeded: false,
    academic: createAcademicCycle(),
    archives: [],
  };
}

/** Datos de demostración OPCIONALES: solo se cargan si el usuario lo pide en Ajustes. */
export function createDemoState(): AppState {
  const subjects: Subject[] = [
    { id: 's-math', name: 'Matemáticas', color: '#6ee7ff', icon: '🧮', folder: 'Ciencias exactas', createdAt: new Date().toISOString() },
    { id: 's-phys', name: 'Física', color: '#a78bfa', icon: '⚡', folder: 'Ciencias exactas', createdAt: new Date().toISOString() },
    { id: 's-bio', name: 'Biología', color: '#7ef0c1', icon: '🔬', folder: 'Ciencias naturales', createdAt: new Date().toISOString() },
    { id: 's-hist', name: 'Historia', color: '#ffc978', icon: '🌍', folder: 'Humanidades', createdAt: new Date().toISOString() },
    { id: 's-prog', name: 'Programación', color: '#f7a8d8', icon: '💻', folder: 'Tecnología', createdAt: new Date().toISOString() },
    { id: 's-lang', name: 'Inglés', color: '#5b9cff', icon: '✍️', folder: 'Idiomas', createdAt: new Date().toISOString() },
  ];

  const taskSeeds: Array<[string, string, boolean, Task['priority']]> = [
    ['s-math', 'Repasar límites y continuidad', true, 'alta'],
    ['s-math', 'Ejercicios de derivadas (1–20)', true, 'media'],
    ['s-math', 'Guía de integrales por partes', false, 'alta'],
    ['s-math', 'Cuestionario de series', false, 'baja'],
    ['s-phys', 'Leer capítulo de cinemática', true, 'media'],
    ['s-phys', 'Resolver problemas de energía', true, 'alta'],
    ['s-phys', 'Laboratorio: péndulo simple', false, 'media'],
    ['s-bio', 'Mapa conceptual de la célula', true, 'media'],
    ['s-bio', 'Resumen de genética Mendeliana', false, 'alta'],
    ['s-bio', 'Práctica de microscopio', false, 'baja'],
    ['s-hist', 'Línea de tiempo siglo XX', true, 'baja'],
    ['s-hist', 'Leer fuentes de la Revolución', false, 'media'],
    ['s-prog', 'Completar proyecto de API REST', true, 'alta'],
    ['s-prog', 'Estudiar estructuras de datos', false, 'media'],
    ['s-prog', 'Refactorizar componentes', false, 'baja'],
    ['s-lang', 'Vocabulario unidad 4', true, 'baja'],
    ['s-lang', 'Ensayo de 250 palabras', false, 'media'],
  ];
  const tasks: Task[] = taskSeeds.map(([subjectId, title, done, priority], i) => ({
    id: `t-${i}`,
    subjectId,
    title,
    notes: '',
    done,
    priority,
    createdAt: new Date(Date.now() - (taskSeeds.length - i) * 86400000).toISOString(),
    completedAt: done ? new Date().toISOString() : undefined,
  }));

  const now = new Date();
  const eventSeeds: Array<[string, string, string, number, CalendarEvent['type'], number[]]> = [
    ['s-math', 'Examen parcial de Cálculo', 'Temas 1 a 4: límites, derivadas e integrales.', 2, 'examen', [1440, 120]],
    ['s-prog', 'Entrega proyecto final', 'Subir repositorio + documentación en PDF.', 4, 'proyecto', [2880, 1440, 60]],
    ['s-bio', 'Reporte de laboratorio', 'Células vegetales: observaciones y conclusiones.', 1, 'tarea', [1440, 30]],
    ['s-hist', 'Ensayo histórico', 'Mínimo 800 palabras con citas.', 7, 'tarea', [1440]],
    ['s-lang', 'Presentación oral', 'Exposición de 5 minutos con diapositivas.', 9, 'examen', [2880, 120]],
  ];
  const events: CalendarEvent[] = eventSeeds.map(([subjectId, title, description, days, type, reminders]) => {
    const d = addDays(now, days);
    d.setHours(days % 2 === 0 ? 10 : 16, 0, 0, 0);
    return { id: uid(), subjectId, title, description, date: toLocalInput(d), type, reminders, firedReminders: [], done: false };
  });

  const habitSeeds: Array<[string, string, string, number, number[]]> = [
    ['📖', 'Leer 20 páginas', '#6ee7ff', 5, [0, 1, 2, 3, 5, 6, 7, 8, 10, 11, 12]],
    ['✍️', 'Repasar apuntes', '#a78bfa', 5, [0, 1, 3, 4, 6, 7, 9, 11, 12]],
    ['🧠', 'Práctica de ejercicios', '#7ef0c1', 4, [1, 2, 4, 6, 8, 10, 12]],
    ['😴', 'Dormir 8 horas', '#ffc978', 7, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]],
  ];
  const habits: Habit[] = habitSeeds.map(([icon, name, color, goal, offsets], i) => ({
    id: `h-${i}`,
    icon,
    name,
    color,
    goal,
    createdAt: new Date().toISOString(),
    dates: offsets.map((o) => dateKey(addDays(now, -o))),
  }));

  return ensureAcademic(ensureTutors({
    ...createEmptyState(),
    subjects,
    tasks,
    events,
    habits,
    pentagonSubjectIds: ['s-math', 's-phys', 's-bio', 's-hist', 's-prog'],
    seeded: true,
  }));
}

/** Pretty inline SVG "notes" used as editable sample pages in the library. */
export const SAMPLE_NOTES: Array<{ name: string; subjectId: string; notes: string; tags: string[]; svg: string }> = [
  {
    name: 'Mapa conceptual · La célula.svg',
    subjectId: 's-bio',
    notes: 'Esquema de organelos y sus funciones visto en clase.',
    tags: ['esquema', 'célula'],
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="640" viewBox="0 0 900 640"><defs><linearGradient id="b" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#0c2530"/><stop offset="1" stop-color="#111a35"/></linearGradient><linearGradient id="a" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#7ef0c1"/><stop offset="1" stop-color="#6ee7ff"/></linearGradient></defs><rect width="900" height="640" fill="url(#b)"/><text x="60" y="78" fill="#eaf6ff" font-family="sans-serif" font-size="38" font-weight="700">La célula · mapa conceptual</text><g stroke="#4d7f8c" stroke-width="3" fill="none"><path d="M450 200 V280 M450 280 H230 V350 M450 280 H670 V350 M230 350 V420 M670 350 V420"/></g><rect x="315" y="150" width="270" height="60" rx="16" fill="url(#a)" opacity=".9"/><text x="450" y="188" text-anchor="middle" fill="#06202a" font-family="sans-serif" font-size="24" font-weight="700">CÉLULA</text><g fill="#14283d" stroke="#7ef0c1" stroke-width="2"><rect x="110" y="350" width="240" height="58" rx="14"/><rect x="550" y="350" width="240" height="58" rx="14"/><rect x="110" y="430" width="240" height="58" rx="14"/><rect x="550" y="430" width="240" height="58" rx="14"/></g><g fill="#dff7ee" font-family="sans-serif" font-size="20" text-anchor="middle"><text x="230" y="386">Núcleo · ADN</text><text x="670" y="386">Mitocondrias · ATP</text><text x="230" y="466">Ribosomas · proteínas</text><text x="670" y="466">Membrana · transporte</text></g><text x="60" y="580" fill="#8fb4bd" font-family="sans-serif" font-size="18">Apunte de ejemplo · edítalo o bórralo libremente</text></svg>`,
  },
  {
    name: 'Fórmulas · Cinemática.svg',
    subjectId: 's-phys',
    notes: 'Fórmulas de MRU y MRUA para el examen parcial.',
    tags: ['fórmulas', 'física'],
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="640" viewBox="0 0 900 640"><defs><linearGradient id="b" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#1a1436"/><stop offset="1" stop-color="#0e2038"/></linearGradient></defs><rect width="900" height="640" fill="url(#b)"/><text x="60" y="80" fill="#f0ebff" font-family="sans-serif" font-size="38" font-weight="700">Cinemática · fórmulas clave</text><g font-family="Georgia,serif" fill="#dcd2ff" font-size="34"><text x="80" y="190">v = v₀ + a·t</text><text x="80" y="270">x = x₀ + v₀·t + ½·a·t²</text><text x="80" y="350">v² = v₀² + 2·a·Δx</text><text x="80" y="430">a = Δv / Δt</text></g><g stroke="#a78bfa" stroke-width="2" opacity=".5"><path d="M60 215 H840 M60 295 H840 M60 375 H840 M60 455 H840"/></g><text x="80" y="560" fill="#a99fd0" font-family="sans-serif" font-size="19">Recuerda: define siempre el signo de la aceleración.</text></svg>`,
  },
];
