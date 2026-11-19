# My Study Center

Aplicación web **local-first** para organización académica, estudio asistido por IA, memoria de apuntes, sesiones reales de estudio, hábitos y entregas. Estética **Liquid Glass** (inspirada en iOS 26): fondo oscuro profundo, luces ambientales difuminadas, paneles translúcidos con desenfoque, bordes iluminados y sombras suaves.

> Es una **app web estática**: `index.html` + CSS + JavaScript. No hay backend obligatorio, ni cuentas, ni base de datos en la nube.

---

## Stack

| Pieza | Tecnología |
|---|---|
| UI | React 18 + TypeScript |
| Build | Vite 6 (compila a HTML/CSS/JS estático) |
| Estilos | CSS puro (`backdrop-filter`, gradientes, máscaras) |
| Gráficos | SVG a medida (pentágono animado, anillos, heatmaps) |
| Persistencia | `localStorage` (datos) + **IndexedDB** (fotos, PDFs, audios y archivos) |
| IA | OpenRouter (`nvidia/nemotron-3.5-super-vl:free`) con visión, streaming y memoria |
| Archivos | `pdfjs-dist` (PDF), `mammoth` (DOCX), `xlsx` (Excel), `jszip` (PPTX) — cargados bajo demanda |
| Voz | Web Speech API local (dictado + text to speech) |
| Exportación | `.xlsx`, `.pptx`, SVG→PNG, `.html`, código |
| Despliegue | **Vercel** (`vercel.json` + función serverless opcional `api/ai.mjs`) |

## Inicio rápido

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # genera dist/ (sitio estático publicable)
npm run preview
npm run typecheck
```

**La app arranca vacía a propósito**: materias, tareas, hábitos, proyectos, entregas y sesiones los creas tú manualmente. El pentágono muestra 5 huecos `+ materia` hasta que añadas las tuyas. Si quieres probar con datos de demostración, ve a **Ajustes → Cargar datos de ejemplo** (opcional y bajo petición explícita).

---

## Publicar en Vercel

Ya está todo incluido: `vercel.json`, `.vercelignore`, `.env.example` y `api/ai.mjs`.

### Opción A · Importar el repo (recomendado)
1. Sube esta rama a GitHub.
2. En Vercel → **Add New → Project → Import Git Repository**.
3. Vercel detecta `framework: vite`, `buildCommand: npm run build` y `outputDirectory: dist` desde `vercel.json`. No hay que configurar nada más.
4. **(Importante)** En *Settings → Environment Variables* añade:

   | Variable | Valor | Por qué |
   |---|---|---|
   | `VITE_AI_PROXY` | `1` | Activa el proxy serverless y **evita que la API Key aparezca en el JavaScript público** |
   | `AI_API_KEY` | `sk-or-v1-…` | Clave real, solo la lee el servidor (`api/ai.mjs`) |
   | `VITE_AI_MODEL` | `nvidia/nemotron-3.5-super-vl:free` | Opcional: ya es el valor por defecto |

5. Deploy. La función `api/ai.mjs` se despliega sola en `/api/ai`.

### Opción B · CLI
```bash
npm i -g vercel
vercel            # preview
vercel --prod     # producción
```

### ⚠️ Seguridad de la clave
La clave que pediste está en **`.env.local`** (archivo local, **ignorado por Git**) para que la app funcione al abrir. No está en ningún archivo versionado: el repositorio de GitHub es **público**, y un secreto escrito en el código sería visible para cualquiera con F12 o en el historial de Git.

En el **preview local** la clave se inyecta desde `.env.local` y la app llama directamente a OpenRouter (el bundle sí la contiene, pero solo en tu navegador).

- Con `VITE_AI_PROXY=1` el build **no contiene la clave** (verificado con un build de prueba: el string desaparece del bundle) y `api/ai.mjs` la inyecta desde `AI_API_KEY` en el servidor.
- Al importar el repo en Vercel, `.env.local` **no viaja**: por eso `AI_API_KEY` es obligatoria allí.
- Como la clave apareció en un chat/repo público, conviene **rotarla** en OpenRouter y poner la nueva solo en `AI_API_KEY` de Vercel y en tu `.env.local`.
- `api/ai.mjs` solo reenvía a `/chat/completions`, `/images/generations`, `/audio/transcriptions` y `/audio/speech` sobre HTTPS.

---

## Módulos

### Inicio · Pentágono 0–100%
Radar pentagonal interactivo con 5 materias elegidas y reordenables. Cada vértice muestra el % real de tareas completadas; tooltip al pasar/tocar/teclado con el porcentaje exacto y `hechas / total`. Estadísticas, entregas urgentes, foco del día, **sesiones de hoy** y apuntes recientes.

### Materias y tareas
CRUD de materias (carpeta, color, icono) y tareas con prioridad. Marcar una tarea actualiza el pentágono al instante.

### Fotos y apuntes · 🧠 memoria de la IA
**Aquí es el único sitio donde subes fotos de tu cuaderno** (arrastrar, clic o Ctrl+V). Cada página se vincula a una materia, con notas y etiquetas.

- **Absorción automática** (activable en Ajustes): al subir, la IA con visión lee la imagen y guarda un **recuerdo permanente** (resumen detallado + conceptos + preguntas).
- Esa memoria se inyecta en **todas** las conversaciones del chat, aunque no adjuntes la foto otra vez. El chat muestra `🧠 Memoria: N páginas` y permite ver cada recuerdo.
- También puedes pulsar **"Absorber con IA"** manualmente o **editar el resumen a mano** sin clave.

### Biblioteca
Pestaña propia en el menú **y** dentro del chat. Muestra **todas las imágenes y archivos que le has mandado a la IA**: fotos del cuaderno, PDFs, Word, Excel, PowerPoint, audios e imágenes generadas, con vista previa, origen, fecha, resumen, descarga, reenvío al chat y borrado.

### Chat de IA
- Key y modelo configurados: **OpenRouter · `nvidia/nemotron-3.5-super-vl:free`** (admite visión para leer apuntes).
- Proveedores: OpenRouter, OpenAI, Gemini o cualquier endpoint OpenAI-compatible.
- **Streaming**, botón *Detener*, *Probar conexión* y errores claros (clave, 401, cuota 429 de modelos `:free`, 404 de modelo, CORS).
- Contexto automático: materias/avance, **memoria de páginas**, archivos con texto extraído, sesiones reales, entregas y hábitos. Botón *Ver contexto* muestra el system prompt exacto.
- **Botón `+` al lado del cuadro de texto**: sube **cualquier archivo excepto videos** (se filtran por MIME y extensión). El texto se extrae y se le pasa al modelo:

  | Tipo | Extracción |
  |---|---|
  | PDF | `pdfjs-dist` (hasta 40 páginas) |
  | DOCX | `mammoth` |
  | XLSX / XLS / CSV | `xlsx` → CSV por hoja |
  | PPTX | `jszip` → texto de cada diapositiva |
  | TXT, MD, JSON, código, XML… | lectura directa |
  | Imágenes | se envían al modelo con visión |
  | Audio | transcripción `/audio/transcriptions` o dictado del navegador |

- **Audios**: botón de micrófono para grabar una nota de voz (`MediaRecorder` + dictado Web Speech gratuito), o sube un archivo de audio con `+`. El mensaje incluye reproductor y transcripción.
- **🔊 Text to speech**: debajo de **cada respuesta de la IA** hay un botón *Escuchar respuesta* con pausa/reanudar/detener. Usa la voz local del navegador (sin coste ni API). Velocidad y voz se eligen en Ajustes.
- Acciones rápidas con tema / dificultad / tiempo: métodos de estudio, guías de examen, imágenes (SVG o modelo de imágenes), código, animaciones web, diapositivas y hojas de cálculo. Cada recurso se entrega con **copiar · previsualizar · descargar** (`.html`, `.svg/.png`, `.xlsx`, `.pptx`, código).

### Sesiones y racha (registro REAL)
El contador de la racha **ya no depende de casillas marcadas a mano**: sube solo cuando registras estudio real.

- **Cronómetro** persistente (sobrevive a recargas y cambios de pestaña) con materia, nota, pausa/reanudar y *Terminar y registrar*.
- **Registro manual** de sesiones pasadas (día, materia, minutos, nota).
- Racha = días consecutivos con al menos una sesión terminada; tiempo total, minutos de hoy/7 días, heatmap de 30 días y barras de 14 días.
- El Inicio muestra la **Racha real** y el resumen de sesiones de hoy.

### Hábitos (manual, vacío por defecto)
Tracker estilo Notion: **tú creas cada hábito** (icono, color, objetivo semanal). Vistas semana/14/30 días, casillas manuales, rachas propias por hábito y constancia. No viene ningún hábito precargado.

### Calendario
Mes navegable, CRUD manual de tareas/exámenes/proyectos/recordatorios con materia, descripción, fecha-hora y recordatorios múltiples. Avisos internos (banner + campana) y notificaciones del navegador si das permiso. **Sin eventos precargados.**

### Ajustes y datos
IA (proveedor, clave, modelo, visión, absorción automática, transcripción), voz, notificaciones, acento, y **exportar/importar respaldo JSON** con todos los datos **y todos los binarios**.

---

## Arquitectura

```
├── api/ai.mjs                    # Vercel serverless proxy (clave en servidor)
├── vercel.json / .vercelignore / .env.example
├── index.html · vite.config.ts
└── src/
    ├── main.tsx · App.tsx · types.ts · vite-env.d.ts
    ├── data/defaults.ts         # estado vacío, demo opcional, key/modelo, proveedores
    ├── state/{store,toast}.tsx  # estado global + persistencia v2
    ├── lib/
    │   ├── ai.ts                # OpenRouter/Gemini/custom, streaming, proxy, visión, transcripción
    │   ├── files.ts             # filtro de videos + extracción PDF/DOCX/XLSX/PPTX + resize
    │   ├── memory.ts            # recuerdos permanentes de páginas
    │   ├── tts.ts               # text to speech local
    │   ├── imageStore.ts        # IndexedDB de blobs
    │   ├── artifacts.ts         # parseo + .xlsx/.pptx/.png
    │   ├── backup.ts · reminders.ts · quickAdd.ts · utils.ts
    ├── components/{ui,layout}/
    └── features/
        ├── dashboard/           # PentagonChart + Dashboard
        ├── subjects/ · library/ · biblioteca/
        ├── chat/                # Chat, Message, ArtifactCard, quickActions
        ├── sessions/            # cronómetro real y racha
        ├── calendar/ · habits/ · settings/
    └── styles/                  # base, glass, layout, components, features
```

Librerías pesadas (`pdfjs-dist`, `mammoth`, `jszip`, `xlsx`, `pptxgenjs`) se cargan **bajo demanda**; el bundle inicial ronda los 110 kB gzip.

---

## Limitaciones honestas

- **Clave en el cliente**: sin `VITE_AI_PROXY=1` la clave es visible en el bundle. Usa el proxy en producción y rota la clave si se expuso.
- **OpenRouter `:free`** tiene cuotas y el nombre del modelo puede cambiar; si falla con 404/429, cámbialo en Ajustes (hay sugerencias). La app lo dice claramente.
- **Notificaciones**: solo mientras la pestaña está abierta (sin service worker push ni backend).
- **Transcripción de audio**: depende de que el proveedor ofrezca `/audio/transcriptions`; si no, se usa el dictado del navegador (Chrome/Edge) o puedes escribir una nota. Los videos están excluidos por diseño.
- **TTS**: usa las voces instaladas en el sistema del navegador; la disponibilidad varía por dispositivo.
- **Almacenamiento**: todo vive en tu navegador. Limpiar datos del sitio lo borra; exporta un respaldo antes.
- El cambio a arranque vacío usa la clave `my-study-center:v2`, así que los datos de ejemplo de la v1 ya no se cargan (siguen guardados, pero no se usan).
