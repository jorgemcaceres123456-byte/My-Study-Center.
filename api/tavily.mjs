/**
 * Vercel Serverless Function · proxy opcional de búsqueda web Tavily.
 *
 * El cliente puede enviar su propia Tavily Key (guardada en localStorage) o,
 * si no la tiene, el servidor usa TAVILY_API_KEY. Siempre reenvía EXACTAMENTE
 * el cuerpo que pide Tavily: api_key, query, search_depth y max_results.
 */

const TAVILY_URL = 'https://api.tavily.com/search';

export const config = { maxDuration: 30 };

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Método no permitido' });
  }
  try {
    const { query, apiKey } = req.body || {};
    const cleanQuery = String(query || '').trim().slice(0, 500);
    if (!cleanQuery) return res.status(400).json({ error: 'Falta la consulta de búsqueda.' });
    const key = String(apiKey || process.env.TAVILY_API_KEY || '').trim();
    if (!key) {
      return res.status(400).json({ error: 'Falta la Tavily API Key. Pónala en Ajustes o define TAVILY_API_KEY en Vercel.' });
    }
    const upstream = await fetch(TAVILY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: key,
        query: cleanQuery,
        search_depth: 'basic',
        max_results: 5,
      }),
    });
    const text = await upstream.text();
    let data;
    try { data = JSON.parse(text); } catch { data = { error: text.slice(0, 300) || 'Respuesta no JSON' }; }
    if (!upstream.ok) {
      return res.status(upstream.status).json({ error: data?.error || `Error ${upstream.status} de Tavily`, upstream: data });
    }
    return res.status(200).json(data);
  } catch (err) {
    return res.status(502).json({ error: 'No se pudo contactar con Tavily.', detail: String(err?.message || err) });
  }
}
