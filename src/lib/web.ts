export interface WebSource {
  title: string;
  url: string;
  content: string;
}

export class WebSearchError extends Error {
  constructor(message: string, public hint?: string, public status?: number, public balance = false) {
    super(message);
    this.name = 'WebSearchError';
  }
}

export const TAVILY_HINT = 'Pon una Tavily API Key gratuita en Ajustes → Búsqueda web (o define TAVILY_API_KEY en Vercel).';

/** OpenRouter usa el sufijo :online para búsqueda integrada cuando no hay Tavily. */
export const appendOnline = (model: string): string => {
  const clean = model.trim();
  if (!clean || clean.endsWith(':online')) return clean;
  return `${clean}:online`;
};

export const isOpenRouter = (baseUrl: string, provider?: string) =>
  provider === 'openrouter' || /openrouter\.ai/i.test(baseUrl || '');

/** ¿El error merece probar `openrouter/free`? Límite, saturación o modelo caído. */
export function needsModelFallback(e: unknown): boolean {
  const err = e as { status?: number; message?: string } | null;
  const status = Number(err?.status || 0);
  const msg = String(err?.message || '').toLowerCase();
  return status === 429 || status === 503 || status === 504 || status === 404
    || /rate.?limit|too many requests|overloaded|saturad|capacity|temporarily unavailable|model.*not found|límite|saturaci/i.test(msg);
}

/** ¿Falta saldo/créditos en la búsqueda :online? */
export function isBalanceError(e: unknown): boolean {
  const err = e as { status?: number; message?: string } | null;
  const status = Number(err?.status || 0);
  const msg = String(err?.message || '').toLowerCase();
  return status === 402 || status === 403
    || /insufficient|credit|balance|payment required|out of funds|saldo|créditos|fondos|pago/i.test(msg);
}

function parseResults(data: unknown): WebSource[] {
  const raw = (data as { results?: unknown })?.results;
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, 5).map((r, i) => {
    const item = (r || {}) as Record<string, unknown>;
    const url = String(item.url || item.link || '').trim();
    return {
      title: String(item.title || `Fuente ${i + 1}`).trim(),
      url,
      content: String(item.content || item.snippet || item.description || '').trim().slice(0, 600),
    };
  }).filter((r) => /^https?:\/\//i.test(r.url));
}

async function readSearchResponse(res: Response): Promise<WebSource[]> {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const detail = String((data as { error?: { message?: string } | string })?.error || '');
    const message = typeof detail === 'string' && detail ? detail : `Tavily respondió ${res.status}`;
    throw new WebSearchError(message, TAVILY_HINT, res.status, isBalanceError({ status: res.status, message }));
  }
  const sources = parseResults(data);
  if (!sources.length) throw new WebSearchError('La búsqueda no devolvió resultados.', TAVILY_HINT, res.status);
  return sources;
}

/**
 * Búsqueda web gratuita. Intenta primero la petición directa EXACTA a Tavily;
 * si el navegador la bloquea por CORS, usa el proxy `/api/tavily` de Vercel.
 */
export async function tavilySearch(query: string, apiKey: string, signal?: AbortSignal): Promise<WebSource[]> {
  const cleanQuery = query.trim().slice(0, 500);
  const cleanKey = apiKey.trim();
  if (!cleanQuery) throw new WebSearchError('Escribe algo antes de buscar en la web.', TAVILY_HINT);
  if (!cleanKey) throw new WebSearchError('Falta la Tavily API Key.', TAVILY_HINT, 400);

  const body = {
    api_key: cleanKey,
    query: cleanQuery,
    search_depth: 'basic',
    max_results: 5,
  };

  try {
    const res = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal,
    });
    return await readSearchResponse(res);
  } catch (directError) {
    if (signal?.aborted || (directError as Error)?.name === 'AbortError') throw directError;
    try {
      const res = await fetch('/api/tavily', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: cleanQuery, apiKey: cleanKey }),
        signal,
      });
      return await readSearchResponse(res);
    } catch (proxyError) {
      if (signal?.aborted || (proxyError as Error)?.name === 'AbortError') throw proxyError;
      const e = proxyError instanceof WebSearchError ? proxyError : directError instanceof WebSearchError ? directError : null;
      throw e || new WebSearchError('No se pudo contactar con Tavily.', TAVILY_HINT);
    }
  }
}

/** Contexto actualizado que se inyecta en el system prompt del tutor. */
export function sourcesToContext(sources: WebSource[]): string {
  if (!sources.length) return '';
  const block = sources.map((s, i) =>
    `[${i + 1}] ${s.title}\nURL: ${s.url}\nFRAGMENTO: ${s.content || 'Sin fragmento'}`).join('\n\n');
  return `\n\n🌐 RESULTADOS DE BÚSQUEDA WEB EN TIEMPO REAL (consulta del usuario):\n${block}\n\nUsa estos datos solo como apoyo actualizado. Conserva el aislamiento estricto de la materia. Al final de tu respuesta incluye una sección «Fuentes consultadas» con enlaces Markdown clicables, por ejemplo: [${sources[0].title}](${sources[0].url}). Cita solo las fuentes que realmente usaste.`;
}

export function sourcesToMarkdown(sources: WebSource[]): string {
  if (!sources.length) return '';
  const lines = sources.map((s, i) => `${i + 1}. [${s.title || `Fuente ${i + 1}`}](${s.url})${s.content ? ` — ${s.content.slice(0, 140)}${s.content.length > 140 ? '…' : ''}` : ''}`);
  return `\n\n### Fuentes consultadas\n${lines.join('\n')}`;
}

/** Extrae URLs de una respuesta :online para convertirlas en enlaces clicables. */
export function extractSourceLinks(text: string): WebSource[] {
  const found = text.match(/https?:\/\/[^\s)>\]"']+/gi) || [];
  const urls = Array.from(new Set(found.map((u) => u.replace(/[.,;:!?]+$/, '')))).slice(0, 6);
  return urls.map((url, i) => ({ title: `Fuente ${i + 1} · ${new URL(url).hostname.replace(/^www\./, '')}`, url, content: '' }));
}
