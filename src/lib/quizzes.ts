import type { AISettings, AppState, DailyQuiz, EnglishLevel, QuizDifficulty, QuizQuestion, Subject } from '../types';
import { AIError, callAI } from './ai';
import { dateKey, uid } from './utils';

export const LEVEL_INFO: Record<EnglishLevel, { label: string; desc: string }> = {
  A1: { label: 'A1 · Principiante', desc: 'Frases simples, saludos, vocabulario básico y presente simple.' },
  A2: { label: 'A2 · Elemental', desc: 'Situaciones cotidianas, pasado simple y descripciones sencillas.' },
  B1: { label: 'B1 · Intermedio', desc: 'Opiniones, textos cotidianos, presente perfecto y conectores.' },
  B2: { label: 'B2 · Intermedio alto', desc: 'Matices, condicionales, textos argumentativos y phrasal verbs.' },
  C1: { label: 'C1 · Avanzado', desc: 'Registros formales, expresiones idiomáticas, matices y textos densos.' },
  C2: { label: 'C2 · Maestría', desc: 'Precisión casi nativa, ironía, colocaciones y estructuras complejas.' },
};

interface RawQuestion {
  prompt?: unknown;
  options?: unknown;
  answer?: unknown;
  explanation?: unknown;
  topic?: unknown;
  difficulty?: unknown;
}

/** Extrae y valida el JSON del modelo, tolerando ```json, texto alrededor y comillas. */
export function parseQuizJSON(raw: string, fallbackDifficulty: QuizDifficulty = 'intermedio'): QuizQuestion[] {
  let text = raw.trim();
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(text);
  if (fenced) text = fenced[1];
  const start = text.indexOf('[');
  const end = text.lastIndexOf(']');
  if (start < 0 || end <= start) throw new Error('La IA no devolvió una lista de preguntas válida.');
  let parsed: unknown;
  try { parsed = JSON.parse(text.slice(start, end + 1)); }
  catch { throw new Error('La IA devolvió un JSON inválido. Intenta de nuevo.'); }
  if (!Array.isArray(parsed)) throw new Error('Formato de preguntas inesperado.');
  const out: QuizQuestion[] = [];
  for (const [i, item] of (parsed as RawQuestion[]).entries()) {
    if (!item || typeof item !== 'object') continue;
    const prompt = String(item.prompt ?? '').trim();
    const opts = Array.isArray(item.options) ? item.options.map((x) => String(x ?? '').trim()) : [];
    const answer = Number(item.answer);
    if (!prompt || opts.length !== 4 || opts.some((o) => !o)) continue;
    if (!Number.isInteger(answer) || answer < 0 || answer > 3) continue;
    const d = item.difficulty;
    const difficulty: QuizDifficulty = d === 'basico' || d === 'intermedio' || d === 'avanzado'
      ? d : (i % 3 === 2 ? 'avanzado' : i % 3 === 1 ? 'intermedio' : 'basico');
    out.push({
      id: uid(), prompt, options: opts as [string, string, string, string],
      answer: answer as 0 | 1 | 2 | 3,
      explanation: String(item.explanation ?? '').trim() || 'Revisa este concepto en tus apuntes.',
      topic: String(item.topic ?? '').trim() || 'Tema general',
      difficulty,
    });
    if (out.length >= 10) break;
  }
  if (out.length < 4) throw new Error('La IA generó muy pocas preguntas válidas. Intenta de nuevo.');
  if (!out.some((q) => q.difficulty === 'avanzado')) out[out.length - 1].difficulty = 'avanzado';
  void fallbackDifficulty;
  return out;
}

const topicsFrom = (state: AppState, subjectId: string) => {
  const tags = state.images.filter((i) => i.subjectId === subjectId).flatMap((i) => i.tags);
  const mem = state.memories.filter((m) => m.subjectId === subjectId)
    .flatMap((m) => m.summary.split(/[,;\n]/).map((x) => x.trim()).filter((x) => x.length > 4 && x.length < 60));
  const files = state.chatFiles.filter((f) => f.subjectId === subjectId).map((f) => f.name);
  return Array.from(new Set([...tags, ...mem.slice(0, 12), ...files])).filter(Boolean).slice(0, 16);
};

const memoBlock = (state: AppState, subjectId: string) =>
  state.memories.filter((m) => m.subjectId === subjectId).slice(-8)
    .map((m) => `### ${m.name}\n${m.summary.slice(0, 1200)}`).join('\n\n')
  || state.images.filter((i) => i.subjectId === subjectId).slice(-8)
    .map((i) => `### ${i.name}\n${i.aiSummary || i.notes || i.tags.join(', ')}`).join('\n\n');

const JSON_RULES = `Devuelve ÚNICAMENTE un array JSON válido, sin texto antes ni después (ni siquiera explicación). Cada elemento:
{"prompt":"enunciado claro en español","options":["opción a","opción b","opción c","opción d"],"answer":0,"explanation":"por qué esa es la correcta","topic":"tema concreto","difficulty":"basico|intermedio|avanzado"}
"answer" es el índice 0-3 de la opción correcta. Las 4 opciones deben ser plausibles y no incluir la letra al inicio. Incluye AL MENOS 2 preguntas "avanzado" (razonamiento, aplicación o varios conceptos a la vez). Ninguna respuesta debe ser "todas las anteriores".`;

export async function generateSubjectQuiz(settings: AISettings, state: AppState, subject: Subject, day = dateKey(new Date())): Promise<DailyQuiz> {
  const memories = memoBlock(state, subject.id);
  const deadlines = state.events.filter((e) => e.subjectId === subject.id && !e.done)
    .map((e) => `- ${e.date.replace('T', ' ')} · ${e.title} (${e.type})`).join('\n');
  const prompt = `Crea el QUIZ DIARIO de la materia «${subject.name}» para hoy ${day}.

TEMAS QUE EL ALUMNO LE HA ALIMENTADO A SU TUTOR (úsalos como base, NO inventes otros):
${memories || '(Todavía no ha subido apuntes: crea entonces un diagnóstico de nivel general de la materia, e indícalo en el topic de cada pregunta.)'}
Etiquetas/páginas: ${topicsFrom(state, subject.id).join(', ') || '—'}
${deadlines ? `\nPróximas entregas de esta materia:\n${deadlines}` : ''}

Genera 6 preguntas de SELECCIÓN MÚLTIPLE (a, b, c, d) sobre ESOS temas: 2 básicas, 2 intermedias y 2 avanzadas. Las avanzadas deben exigir aplicar o relacionar conceptos, no solo recordar. En "explanation" explica el concepto y, si viene de un apunte, cita el nombre de la página.

${JSON_RULES}`;
  const raw = await callAI({
    settings: { ...settings, temperature: 0.35 },
    turns: [
      { role: 'system', content: 'Eres un generador de ejercicios académicos. Respondes exclusivamente con JSON válido. No uses bloques de código ni texto adicional.' },
      { role: 'user', content: prompt },
    ],
  });
  return {
    id: uid(), day, kind: 'subject', subjectId: subject.id,
    title: `Ejercicios de ${subject.name}`, questions: parseQuizJSON(raw),
    createdAt: new Date().toISOString(), source: 'ai',
  };
}

export async function generateEnglishQuiz(settings: AISettings, level: EnglishLevel, day = dateKey(new Date())): Promise<DailyQuiz> {
  const prompt = `Crea un TEST DE NIVEL DE INGLÉS ${level} del Marco Común Europeo de Referencia (MCER: A1, A2, B1, B2, C1, C2) para hoy ${day}.

Nivel ${level}: ${LEVEL_INFO[level].desc}.
Genera 8 preguntas de selección múltiple (a, b, c, d) en INGLÉS (enunciado y opciones en inglés; "explanation" en español):
- 3 de gramática/uso, 2 de vocabulario o colocaciones, 1 de lectura con un microtexto de 2-3 frases, y 2 AVANZADAS de matiz, registro o inferencia.
- Dificultad real del nivel ${level}: ni más fácil ni más difícil. Ninguna opción absurda.
- En "topic" pon la destreza (grammar, vocabulary, reading, register, inference…).

${JSON_RULES}`;
  const raw = await callAI({
    settings: { ...settings, temperature: 0.35 },
    turns: [
      { role: 'system', content: 'You are a CEFR exam item writer. Reply ONLY with a valid JSON array. No prose, no code fences.' },
      { role: 'user', content: prompt },
    ],
  });
  return {
    id: uid(), day, kind: 'english', subjectId: 'english', level,
    title: `Test de inglés · nivel ${level}`, questions: parseQuizJSON(raw),
    createdAt: new Date().toISOString(), source: 'ai',
  };
}

/** Repaso local de emergencia cuando no hay clave o falla la petición. */
export function localSubjectQuiz(state: AppState, subject: Subject, day = dateKey(new Date())): DailyQuiz {
  const topics = topicsFrom(state, subject.id);
  const distractors = ['Termodinámica', 'Literatura comparada', 'Álgebra lineal', 'Geografía política', 'Historia antigua', 'Estadística bayesiana'];
  const questions: QuizQuestion[] = Array.from({ length: 5 }, (_, i) => {
    const correct = topics[i % Math.max(1, topics.length)] || subject.name;
    const wrong = distractors.filter((d) => d !== correct).slice(i % 3, i % 3 + 3);
    const options = [correct, ...wrong, `Ninguno de estos temas`].slice(0, 4) as [string, string, string, string];
    // barajado determinista para que la correcta no sea siempre la a
    const shift = i % 4;
    const rotated = Array.from({ length: 4 }, (_, k) => options[(k + shift) % 4]) as [string, string, string, string];
    const answer = (4 - shift) % 4;
    return {
      id: uid(), prompt: `¿Cuál de estos temas aparece en los apuntes que subiste de ${subject.name}?`,
      options: rotated, answer: answer as 0 | 1 | 2 | 3,
      explanation: `«${correct}» está en tu biblioteca de ${subject.name}. Este repaso se generó sin IA: sube más apuntes y configura la clave para preguntas de contenido real.`,
      topic: correct, difficulty: i >= 3 ? 'avanzado' : i >= 1 ? 'intermedio' : 'basico',
    };
  });
  return { id: uid(), day, kind: 'subject', subjectId: subject.id, title: `Repaso de ${subject.name}`, questions, createdAt: new Date().toISOString(), source: 'local' };
}

export function localEnglishQuiz(level: EnglishLevel, day = dateKey(new Date())): DailyQuiz {
  const bank: Record<EnglishLevel, Array<[string, [string, string, string, string], 0 | 1 | 2 | 3, string]>> = {
    A1: [['She ___ from Honduras.', ['am', 'is', 'are', 'be'], 1, 'Con "she" se usa "is".'], ['Choose the plural:', ['childs', 'children', 'childes', 'childrens'], 1, 'El plural irregular es "children".']],
    A2: [['I ___ to the cinema yesterday.', ['go', 'gone', 'went', 'going'], 2, 'Pasado simple irregular: "went".'], ['She is ___ than her brother.', ['tall', 'taller', 'tallest', 'more tall'], 1, 'Comparativo corto: "taller".']],
    B1: [['I have lived here ___ 2019.', ['for', 'since', 'during', 'from'], 1, '"Since" + punto en el tiempo.'], ['If it rains, we ___ at home.', ['stay', 'will stay', 'stayed', 'would stay'], 1, 'First conditional: will + infinitivo.']],
    B2: [['Hardly ___ the meeting when the fire alarm went off.', ['we had started', 'had we started', 'did we start', 'we started'], 1, 'Inversión tras "Hardly" con past perfect.'], ['The proposal was turned ___ by the board.', ['up', 'over', 'down', 'out'], 2, '"Turn down" = rechazar.']],
    C1: [['The report is ___ speculative to be cited as evidence.', ['too', 'so', 'enough', 'much'], 0, '"Too + adj + to" expresa exceso.'], ['His remarks were ___ rather than openly critical.', ['tacit', 'implicit', 'candid', 'overt'], 1, '"Implicit" = sugerido, no dicho.'], ['Not only ___ the data, but he also questioned the method.', ['he challenged', 'did he challenge', 'challenged he', 'he did challenge'], 1, 'Inversión con "Not only".']],
    C2: [['The argument hinges on a ___ distinction rarely drawn in the literature.', ['nuanced', 'blunt', 'crude', 'gross'], 0, '"Nuanced" = con matices.'], ['Her account is ___ with inconsistencies, yet curiously persuasive.', ['riddled', 'laden', 'fraught', 'replete'], 0, 'Colocación fija: "riddled with".'], ['Were the committee to reconsider, the precedent ___ undermined.', ['will be', 'would be', 'is', 'was'], 1, 'Condicional invertido de tipo 2.']],
  };
  const items = bank[level];
  const questions: QuizQuestion[] = Array.from({ length: 6 }, (_, i) => {
    const [p, o, a, e] = items[i % items.length];
    return { id: uid(), prompt: `${p}${i >= items.length ? ' (repaso)' : ''}`, options: o, answer: a, explanation: e, topic: level, difficulty: i >= 4 ? 'avanzado' : i >= 2 ? 'intermedio' : 'basico' };
  });
  return { id: uid(), day, kind: 'english', subjectId: 'english', level, title: `Test de inglés · nivel ${level}`, questions, createdAt: new Date().toISOString(), source: 'local' };
}

export const scoreOf = (quiz: DailyQuiz, answers: number[]) =>
  quiz.questions.reduce((n, q, i) => n + (answers[i] === q.answer ? 1 : 0), 0);

export const isAIError = (e: unknown) => e instanceof AIError;
