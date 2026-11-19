/** Text-to-speech 100% local: Web Speech API del navegador (sin API Key ni coste). */

export const ttsSupported = () => typeof window !== 'undefined' && 'speechSynthesis' in window;

export function plainForSpeech(markdown: string): string {
  const withoutBlocks = markdown.replace(/```[\s\S]*?```/g, ' [bloque de recurso omitido] ');
  return withoutBlocks
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/[*_`>#|~]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 4500);
}

export function speak(text: string, opts: { rate?: number; voiceURI?: string; onEnd?: () => void; onError?: (e: string) => void } = {}) {
  if (!ttsSupported()) { opts.onError?.('Este navegador no admite síntesis de voz.'); return; }
  stopSpeaking();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'es-ES';
  u.rate = opts.rate ?? 1;
  u.pitch = 1;
  const voices = window.speechSynthesis.getVoices();
  const chosen = opts.voiceURI ? voices.find((v) => v.voiceURI === opts.voiceURI) : voices.find((v) => /^es/i.test(v.lang));
  if (chosen) { u.voice = chosen; u.lang = chosen.lang; }
  u.onend = () => opts.onEnd?.();
  u.onerror = (e) => { opts.onError?.(e.error || 'Error de voz'); opts.onEnd?.(); };
  window.speechSynthesis.speak(u);
}

export function pauseSpeaking() { if (ttsSupported() && window.speechSynthesis.speaking) window.speechSynthesis.pause(); }
export function resumeSpeaking() { if (ttsSupported() && window.speechSynthesis.paused) window.speechSynthesis.resume(); }
export function stopSpeaking() {
  if (!ttsSupported()) return;
  try { window.speechSynthesis.cancel(); } catch { /* ignore */ }
}
export const isSpeaking = () => ttsSupported() && window.speechSynthesis.speaking;
