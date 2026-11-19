/**
 * Vercel Serverless Function · proxy opcional de IA.
 *
 * Se activa ONLY cuando en Vercel defines VITE_AI_PROXY=1.
 * En ese modo el bundle del cliente NO contiene la API Key: este archivo la lee
 * de `process.env.AI_API_KEY` (variable de servidor) y reenvía la petición al
 * proveedor compatible con OpenAI / OpenRouter.
 *
 * No hay streaming aquí (Vercel Node runtime puede bufferizar); la app cae a
 * respuesta completa automáticamente cuando el proxy está activo.
 */

const ALLOWED_PATHS = ['/chat/completions', '/images/generations', '/audio/transcriptions', '/audio/speech'];

export const config = { maxDuration: 60 };

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Método no permitido' });
  }
  try {
    const { baseUrl, path, body, extraHeaders } = req.body || {};
    if (!baseUrl || !path || !ALLOWED_PATHS.includes(path)) {
      return res.status(400).json({ error: 'Petición inválida: baseUrl/path no permitidos.' });
    }
    if (!/^https:\/\//.test(String(baseUrl))) {
      return res.status(400).json({ error: 'La URL base debe ser HTTPS.' });
    }
    const key = process.env.AI_API_KEY || '';
    if (!key) {
      return res.status(500).json({ error: { message: 'Falta AI_API_KEY en las variables de entorno de Vercel.' } });
    }
    const upstream = await fetch(`${String(baseUrl).replace(/\/$/, '')}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${key}`,
        ...(extraHeaders || {}),
      },
      body: JSON.stringify(body),
    });
    const text = await upstream.text();
    let data;
    try { data = JSON.parse(text); } catch { data = { error: { message: text.slice(0, 300) || 'Respuesta no JSON' } }; }
    if (!upstream.ok) {
      return res.status(upstream.status).json({ error: { message: data?.error?.message || `Error ${upstream.status} del proveedor`, upstream: data } });
    }
    return res.status(200).json(data);
  } catch (err) {
    return res.status(502).json({ error: { message: 'No se pudo contactar al proveedor de IA.', detail: String(err?.message || err) } });
  }
}
