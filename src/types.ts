export type ID = string;

export interface Subject {
  id: ID;
  name: string;
  color: string;
  icon: string;
  folder: string;
  createdAt: string;
}

/* ───────── Tutores IA: uno por materia, con memoria y chat AISLADOS ───────── */

export interface Tutor {
  id: ID;
  subjectId: ID;
  name: string;
  createdAt: string;
}

export interface Task {
  id: ID;
  subjectId: ID;
  title: string;
  notes: string;
  done: boolean;
  priority: 'baja' | 'media' | 'alta';
  createdAt: string;
  completedAt?: string;
}

export type LibraryKind = 'image' | 'pdf' | 'docx' | 'xlsx' | 'pptx' | 'txt' | 'audio' | 'file';

/** Página de cuaderno subida desde "Fotos y apuntes" DENTRO de una materia. */
export interface StudyImage {
  id: ID;
  subjectId: ID | '';
  name: string;
  mime: string;
  size: number;
  createdAt: string;
  notes: string;
  tags: string[];
  /** Texto que la IA extrajo/recordó de esta página. Solo lo ve el tutor de esta materia. */
  aiSummary: string;
  blobKey: string;
  sentToAi: boolean;
}

/** Cualquier archivo enviado al chat (pdf, docx, imagen, audio, etc.). */
export interface ChatFile {
  id: ID;
  name: string;
  mime: string;
  size: number;
  kind: LibraryKind;
  blobKey: string;
  extractedText: string;
  createdAt: string;
  /** Materia cuyo tutor puede ver este archivo. */
  subjectId: ID | '';
  notes: string;
  durationSec?: number;
}

/** Recuerdo duradero generado al "absorber" una página. */
export interface Memory {
  id: ID;
  imageId: ID;
  blobKey: string;
  name: string;
  subjectId: ID | '';
  summary: string;
  createdAt: string;
}

export interface StudySession {
  id: ID;
  subjectId: ID | '';
  day: string;
  startedAt: string;
  endedAt: string;
  durationSec: number;
  note: string;
  source: 'timer' | 'manual';
}

export interface ActiveSession {
  subjectId: ID | '';
  note: string;
  running: boolean;
  startedAt: number;
  accumulatedSec: number;
}

export type EventType = 'tarea' | 'examen' | 'proyecto' | 'recordatorio' | 'otro';

export interface CalendarEvent {
  id: ID;
  /** Materia de la entrega: define QUÉ tutor conoce esta fecha. */
  subjectId: ID | '';
  title: string;
  description: string;
  /** Local datetime, yyyy-MM-ddTHH:mm */
  date: string;
  type: EventType;
  reminders: number[];
  firedReminders: string[];
  done: boolean;
}

export interface Habit {
  id: ID;
  name: string;
  icon: string;
  color: string;
  goal: number;
  createdAt: string;
  dates: string[];
}

export interface AudioRef {
  id: ID;
  blobKey: string;
  name: string;
  mime: string;
  durationSec: number;
  transcript: string;
  subjectId?: ID | '';
}

export interface ChatMessage {
  id: ID;
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
  error?: boolean;
  attachments?: ID[];
  fileIds?: ID[];
  audios?: AudioRef[];
  imageKey?: string;
  imageUrl?: string;
  pending?: boolean;
  subjectId?: ID | '';
}

/* ───────── Ejercicios diarios ───────── */

export type QuizDifficulty = 'basico' | 'intermedio' | 'avanzado';
export type EnglishLevel = 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2';
export const ENGLISH_LEVELS: EnglishLevel[] = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];

export interface QuizQuestion {
  id: ID;
  prompt: string;
  options: [string, string, string, string];
  /** índice 0..3 → a,b,c,d */
  answer: 0 | 1 | 2 | 3;
  explanation: string;
  topic: string;
  difficulty: QuizDifficulty;
}

export interface DailyQuiz {
  id: ID;
  /** yyyy-MM-dd */
  day: string;
  kind: 'subject' | 'english';
  /** subjectId para kind='subject'; 'english' para el test de nivel */
  subjectId: ID | 'english';
  level?: EnglishLevel;
  title: string;
  questions: QuizQuestion[];
  createdAt: string;
  source: 'ai' | 'local';
}

export interface QuizAttempt {
  quizId: ID;
  answers: number[];
  score: number;
  completedAt: string;
}

/* ───────── Ciclo escolar y archivo de temas ───────── */

export interface AcademicCycle {
  /** Grado actual. La app arranca en 7.º grado. */
  grade: number;
  /** Año de inicio del ciclo, p. ej. 2026 → 2026–2027. */
  schoolYear: number;
  /** Parcial actual (1, 2, 3…). */
  partial: number;
  periodId: ID;
  startedAt: string;
}

export interface AcademicArchiveCounts {
  images: number;
  memories: number;
  files: number;
  tasks: number;
  events: number;
  quizzes: number;
  messages: number;
}

export interface AcademicArchiveData {
  images: StudyImage[];
  memories: Memory[];
  chatFiles: ChatFile[];
  tasks: Task[];
  events: CalendarEvent[];
  quizzes: DailyQuiz[];
  quizAttempts: Record<ID, QuizAttempt>;
  tutorMessages: Record<ID, ChatMessage[]>;
}

export interface AcademicArchive {
  id: ID;
  kind: 'partial' | 'year';
  label: string;
  grade: number;
  schoolYear: number;
  partial: number;
  periodId: ID;
  closedAt: string;
  counts: AcademicArchiveCounts;
  topics: string[];
  data: AcademicArchiveData;
}

/* ───────── IA ───────── */

export type AIProvider = 'openrouter' | 'openai' | 'gemini' | 'custom';
export type ReasoningEffort = 'none' | 'low' | 'medium' | 'high';

export interface AISettings {
  provider: AIProvider;
  /** OpenRouter API Key. Se guarda solo en el almacenamiento local del navegador. */
  apiKey: string;
  /** Tavily API Key opcional para búsqueda web gratuita. */
  tavilyKey: string;
  baseUrl: string;
  model: string;
  /** Respaldo automático cuando el principal da límite/saturación. */
  fallbackModel: string;
  /** Estado del interruptor "Buscar en la Web" del chat. Apagado por defecto. */
  webSearch: boolean;
  temperature: number;
  vision: boolean;
  imageModel: string;
  transcribeModel: string;
  autoAbsorb: boolean;
  /** Generar automáticamente el quiz del día al abrir Ejercicios diarios. */
  dailyQuizzes: boolean;
  ttsRate: number;
  ttsVoice: string;
  persona: string;
}

export interface AppState {
  version: number;
  subjects: Subject[];
  tutors: Tutor[];
  /** Chat de CADA tutor, aislado por materia. Clave = tutor.id */
  tutorMessages: Record<ID, ChatMessage[]>;
  /** Mensajes antiguos (migración de versiones previas). No se usa en la UI. */
  messages: ChatMessage[];
  tasks: Task[];
  images: StudyImage[];
  chatFiles: ChatFile[];
  memories: Memory[];
  sessions: StudySession[];
  activeSession: ActiveSession | null;
  events: CalendarEvent[];
  habits: Habit[];
  quizzes: DailyQuiz[];
  quizAttempts: Record<ID, QuizAttempt>;
  englishLevel: EnglishLevel;
  pentagonSubjectIds: ID[];
  settings: AISettings;
  accent: 'aurora' | 'ocean' | 'sunset';
  notificationsEnabled: boolean;
  seeded: boolean;
  /** Ciclo escolar activo: arranca en 7.º grado, parcial 1. */
  academic: AcademicCycle;
  /** Temas de parciales/años anteriores, separados de tutores y quizzes. */
  archives: AcademicArchive[];
}

export type SectionId =
  | 'dashboard'
  | 'subjects'
  | 'library'
  | 'biblioteca'
  | 'chat'
  | 'exercises'
  | 'academic'
  | 'sessions'
  | 'calendar'
  | 'habits'
  | 'settings';
