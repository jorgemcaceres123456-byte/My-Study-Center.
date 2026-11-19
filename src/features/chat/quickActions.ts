export type ResourceType = 'method' | 'guide' | 'image' | 'code' | 'animation' | 'slides' | 'sheet';

export interface PromptParams {
  type: ResourceType;
  subject: string;
  topic: string;
  difficulty: string;
  minutes: number;
  raster: boolean;
}

export const RESOURCES: Array<{ id: ResourceType; label: string; icon: string; hint: string }> = [
  { id: 'method', label: 'Método de estudio', icon: '🧠', hint: 'Una técnica adaptada a tu tema, dificultad y tiempo' },
  { id: 'guide', label: 'Guía de examen', icon: '📝', hint: 'Conceptos, resumen, ejemplos, preguntas y plan' },
  { id: 'image', label: 'Generar imagen', icon: '🖼️', hint: 'SVG editable o imagen con modelo de imágenes' },
  { id: 'code', label: 'Código', icon: '💻', hint: 'Código listo para copiar y descargar' },
  { id: 'animation', label: 'Animación web', icon: '✨', hint: 'HTML + CSS + JS con vista previa en vivo' },
  { id: 'slides', label: 'Diapositivas', icon: '📊', hint: 'Estructura de presentación + archivo .pptx' },
  { id: 'sheet', label: 'Hoja de cálculo', icon: '📗', hint: 'Tabla de datos + archivo .xlsx' },
];

export function buildPrompt(p: PromptParams): string {
  const base = `Materia: ${p.subject || 'la que mejor encaje con mi avance'}. Tema: ${p.topic || 'los temas pendientes y mis apuntes subidos'}. Dificultad percibida: ${p.difficulty}. Tiempo disponible: ${p.minutes} minutos.`;
  switch (p.type) {
    case 'method':
      return `${base}\nRecomiéndame UN método de estudio concreto (por ejemplo Pomodoro, repetición espaciada, Feynman, práctica intercalada, mapas conceptuales) y justifica por qué conviene para este tema, esta dificultad y este tiempo. Incluye un plan paso a paso con bloques de minutos, señales para saber si funciona y una variante si tengo menos tiempo. Usa mi avance y mis entregas del contexto.`;
    case 'guide':
      return `${base}\nGenera una GUÍA DE EXAMEN COMPLETA y bien organizada con: 1) conceptos clave, 2) resumen claro, 3) ejemplos resueltos paso a paso, 4) preguntas de repaso con sus respuestas, 5) errores frecuentes, y 6) un plan de estudio repartido en sesiones de ${Math.max(15, Math.round(p.minutes / 3))} minutos. Apóyate en mis apuntes y tareas del contexto; si algún dato no está, indícalo.`;
    case 'image':
      return `Crea una IMAGEN VECTORIAL SVG (un solo <svg> completo, con gradientes y composición clara, sin recursos externos, tamaño 900x640) que explique visualmente: ${p.topic || p.subject || 'un mapa conceptual de estudio'}. Debe ser didáctica, legible y con estética oscura tipo cristal líquido. Devuélvela dentro de un bloque \`\`\`svg y añade una breve explicación de cómo usarla para estudiar.`;
    case 'code':
      return `${base}\nEscribe código limpio, comentado y listo para ejecutar que resuelva o ilustre: ${p.topic || 'un ejercicio de la materia'}. Entrégalo en un bloque de código con el lenguaje correcto y explica brevemente la idea clave y cómo probarlo.`;
    case 'animation':
      return `${base}\nCrea una ANIMACIÓN WEB autocontenida (un único archivo HTML con CSS y JS embebidos, sin librerías externas) que visualice de forma didáctica: ${p.topic || 'el concepto principal de la materia'}. Incluye controles sencillos (pausa/reiniciar/velocidad si aplica), estética oscura con gradientes azul-violeta-cian y texto explicativo. Devuélvelo en un bloque \`\`\`html completo y explica cómo se usa.`;
    case 'slides':
      return `${base}\nDiseña una presentación para exponer: ${p.topic || 'los contenidos de la materia'}. Devuelve SOLO el bloque \`\`\`slides con un JSON array de 6 a 9 diapositivas, cada una con "title", "bullets" (3 a 5 viñetas cortas) y "notes" (notas del ponente). Después, fuera del bloque, resume el hilo conductor. Quiero descargarlo como PowerPoint.`;
    case 'sheet':
      return `${base}\nConstruye una HOJA DE CÁLCULO útil para: ${p.topic || 'organizar el plan de estudio y el seguimiento de la materia'}. Devuelve los datos en un bloque \`\`\`csv con cabecera y al menos 8 filas realistas (sin texto alrededor dentro del bloque). Fuera del bloque explica las columnas y sugiere una fórmula o gráfico. Quiero descargarlo como Excel.`;
  }
}

export const RASTER_PROMPT = (p: PromptParams) =>
  `Educational diagram, dark glassmorphism aesthetic, glowing cyan violet blue gradients, clean labels, about: ${p.topic || p.subject || 'study concept map'}. No photorealism, crisp infographic style.`;
