# My Study Center

Aplicación web **local-first**, en español, para organizar materias, apuntes, sesiones reales de estudio, entregas y práctica asistida por IA. Estética **Liquid Glass** inspirada en iOS 26: fondo oscuro profundo, manchas de luz azul/violeta/cian, cristal translúcido con `backdrop-filter`, bordes iluminados, sombras suaves y alto contraste.

> Es una **app web que corre en el navegador**, no una app nativa ni de escritorio. Se entrega como sitio estático: `index.html` + CSS + JavaScript generados por Vite. No hay cuentas ni backend obligatorio.

---

## Stack

| Pieza | Tecnología |
|---|---|
| UI | React 18 + TypeScript |
| Build | Vite 6 → `dist/` (HTML/CSS/JS estático) |
| Estilos | CSS puro (`backdrop-filter`, gradientes, máscaras, variables de color) |
| Gráficos | SVG a medida: pentágono animado, anillos, heatmaps |
| Persistencia | `localStorage` (`my-study-center:v3`) + IndexedDB para fotos, PDFs y audios |
| IA | OpenRouter · `nvidia/nemotron-3.5-super-vl:free`, con visión, streaming y memoria por materia |
| Archivos | `pdfjs-dist` (PDF), `mammoth` (DOCX), `xlsx` (Excel), `jszip` (PPTX), cargados bajo demanda |
| Voz | Web Speech API local: dictado y text to speech |
| Exportación | Respaldo JSON completo, `.xlsx`, `.pptx`, SVG→PNG, `.html`, código |
| Despliegue | GitHub → Vercel (`vercel.json` + `api/ai.mjs` como proxy opcional) |

## Inicio rápido

```bash
npm install
npm run dev        # http://localhost:5173
npm run typecheck
npm run build      # genera dist/
npm run preview
```

**La app arranca vacía a propósito.** Materias, tareas, hábitos, proyectos, entregas, sesiones y apuntes los creas tú manualmente; no hay hábitos, proyectos ni trackers precargados. El pentágono muestra huecos `+ materia` hasta que añadas las tuyas. Los datos de demostración solo se cargan si vas a **Ajustes → Cargar datos de ejemplo** y lo confirmas.

---

## Novedades de la versión 3

### 1. Una materia = una carpeta = un tutor IA
Al crear una materia sucede **sin recargar**:

1. Aparece como tarjeta/carpeta con **solo su nombre** en **Fotos y apuntes**.
2. Nace automáticamente su **Tutor de IA** en **Chat de IA**, con su propio historial.
3. Entra en **Ejercicios diarios** para tener su quiz del día.
4. Puede recibir tareas, exámenes y proyectos fechados desde el **Calendario**.

Dentro de la carpeta de una materia se suben las fotos de **sus temas** (arrastrar, clic o `Ctrl+V`). No hay un dropzone global que mezcle apuntes: primero eliges la materia y luego subes las páginas.

### 2. Aislamiento estricto de la memoria
Cada tutor recibe un *system prompt* construido únicamente con datos de **su** materia:

- fotos y apuntes subidos en su carpeta;
- recuerdos/resúmenes de esas páginas;
- archivos enviados en su chat;
- tareas de esa materia;
- tareas, exámenes y proyectos con fecha cuyo selector de materia apunte a ella;
- sesiones registradas de esa materia.

El prompt prohíbe citar, comparar o inventar contenido de otras materias. La UI además bloquea adjuntar una página o archivo de otra materia a un tutor distinto. Si borras una materia, su tutor y su chat desaparecen; los apuntes y archivos huérfanos quedan **sin materia asignada** y no se filtran a otro tutor.

### 3. Chat de IA por tutores
La pantalla de **Chat de IA** muestra primero la lista de tutores existentes. Al entrar a uno sí aparece su conversación, con:

- historial y memoria separados por tutor;
- nombre del tutor en la cabecera y en cada respuesta;
- botón **Ver contexto** con el *system prompt* exacto de ese tutor;
- apuntes adjuntables solo de su materia;
- PDFs, DOCX, XLSX, PPTX, TXT, imágenes y audios con el botón `+` (todo menos videos);
- dictado/transcripción de audio y 🔊 debajo de cada respuesta de IA;
- copiar, previsualizar y descargar artefactos generados.

### 4. Ejercicios diarios
Sección propia con quizzes A/B/C/D generados por día y por materia a partir de **los temas alimentados a ese tutor** (2 básicas, 2 intermedias y 2 avanzadas). Incluye un test de inglés por nivel **MCER A1, A2, B1, B2, C1, C2**. Cada quiz se cachea por día/materia/nivel, se puede resolver, muestra resultado y explicación, permite reintentar, regenerar y consultar el historial. Si no hay clave o falla la IA, se usa un repaso local de emergencia. La generación automática se puede apagar en Ajustes.

---

## Módulos

### Inicio · Pentágono 0–100%
Radar pentagonal interactivo con 5 materias elegidas y reordenables. Cada vértice muestra el % real de tareas completadas; tooltip al pasar/tocar/teclado con el porcentaje exacto y `hechas / total`. Estadísticas, entregas urgentes, foco del día, **sesiones de hoy** y apuntes recientes (al pulsar uno se abre la carpeta de su materia).

### Materias y tareas
CRUD de materias (carpeta, color, icono) y tareas con prioridad. Cada tarjeta tiene accesos directos a **Sus apuntes** y **Su tutor**. Marcar una tarea actualiza el pentágono al instante.

### Fotos y apuntes · carpetas por materia
Índice de carpetas: solo el nombre de cada materia. Dentro de una carpeta:

- arrastrar / clic / pegar imágenes JPG, PNG, WEBP, GIF o SVG;
- notas rápidas y etiquetas por lote;
- **Absorber con IA** manual o automático (en Ajustes);
- resumen editable a mano, vista previa, reenvío al tutor y borrado;
- aviso explícito de que solo ese tutor recordará esas páginas.

### Biblioteca
Pestaña propia y también dentro del chat (filtrada por materia). Muestra todas las imágenes y archivos enviados a la IA: fotos, PDFs, Word, Excel, PowerPoint, audios e imágenes generadas, con vista previa, origen, fecha, resumen, descarga, reenvío al tutor correcto y borrado.

### Chat de IA
OpenRouter, OpenAI, Gemini o cualquier endpoint compatible. Streaming, botón *Detener*, *Probar conexión* y errores claros (clave, 401, cuota 429, modelo 404, CORS). Acciones rápidas: métodos de estudio, guías de examen, imágenes SVG/raster, código, animaciones web, diapositivas y hojas de cálculo. Cada tutor usa su propio contexto y su propio historial.

### Ejercicios diarios
Quizzes diarios por materia, test de inglés MCER A1–C2, generación para todas las materias, explicación de respuestas, puntuación, reintento e historial.

### Sesiones y racha (registro REAL)
La racha **no depende de casillas marcadas a mano**: sube solo cuando registras estudio real. Cronómetro persistente, registro manual, heatmap de 30 días, barras de 14 días y resumen en Inicio.

### Calendario
Mes navegable, CRUD manual de tareas/exámenes/proyectos/recordatorios con **selector de materia**, fecha-hora y recordatorios. Esa materia determina qué tutor conoce la entrega. Avisos internos y notificaciones del navegador si das permiso. Sin eventos precargados.

### Hábitos
Tracker estilo Notion: tú creas cada hábito (icono, color, objetivo semanal). Vistas semana/14/30 días, casillas manuales y rachas propias. Vacío por defecto.

### Ajustes y datos
IA (proveedor, clave, modelo, visión, absorción automática, ejercicios diarios), voz, notificaciones, acento y **exportar/importar respaldo JSON** con todos los datos, tutores, chats, quizzes y binarios.

---

## IA y seguridad de la clave

- Modelo por defecto: **`nvidia/nemotron-3.5-super-vl:free`**.
- La clave que proporcionaste está en **`.env.local`**, ignorado por Git, para que el preview local funcione al abrir. **No está en ningún archivo versionado** del repositorio público.
- En Vercel usa el proxy: `VITE_AI_PROXY=1` hace que el bundle del cliente reciba una clave vacía; `api/ai.mjs` inyecta `AI_API_KEY` en el servidor.
- `api/ai.mjs` solo reenvía `/chat/completions`, `/images/generations`, `/audio/transcriptions` y `/audio/speech` sobre HTTPS.
- Sin proxy, una variable `VITE_*` es pública por diseño: cualquiera podría verla con F12. Como la clave apareció en un chat/repo público, conviene **rotarla** en OpenRouter y poner la nueva solo en `AI_API_KEY` de Vercel y en tu `.env.local`.

Copia `.env.example` a `.env.local` en local; en Vercel define:

| Variable | Valor | Por qué |
|---|---|---|
| `VITE_AI_PROXY` | `1` | Activa el proxy y evita que la clave aparezca en el JavaScript público |
| `AI_API_KEY` | `sk-or-v1-…` | Clave real, solo la lee el servidor |
| `VITE_AI_MODEL` | `nvidia/nemotron-3.5-super-vl:free` | Opcional: ya es el valor por defecto |

---

## Publicar en GitHub y Vercel

El flujo de producción es: `commit` → `push` a la rama de trabajo → **Pull Request y merge a `main`** → Vercel despliega `main` automáticamente. Ya están incluidos `vercel.json`, `.vercelignore`, `.env.example` y `api/ai.mjs`.

### 🚨 Si sale 404 o *Protected Deployment* en producción

1. **Project → Settings → Git → Production Branch = `main`** y asegúrate de que el código esté mergeado en `main` (no basta con dejar archivos en el workspace).
2. **Settings → General → Root Directory = `./`**, Framework `Vite`, Build `npm run build`, Output `dist`, Install `npm install`.
3. **Settings → Deployment Protection**: desactiva *Vercel Authentication* para Production si quieres que la URL sea pública; si está activa verás una pantalla de login en lugar de la app.
4. Abre el dominio exacto que aparece en **Project → Domains**. `my-study-center.vercel.app` pertenece a **otro sitio**; el dominio generado lleva el sufijo del equipo, por ejemplo `my-study-center-jorgemcaceres123456-bytes-projects.vercel.app`.
5. Revisa que el commit de `main` tenga un check de Vercel `Deployment has completed / success`. Ese status lo crea el deploy automático al hacer merge.

> Si el conector de Vercel en Arena tiene un token de alcance limitado, los cambios del panel (Environment Variables y Deployment Protection) solo se pueden hacer desde el panel de Vercel. El push/merge a `main` sí dispara el deploy.

### Opción A · Importar el repo (recomendado)
1. Sube la rama a GitHub y ábrela como PR contra `main`.
2. En Vercel → **Add New → Project → Import Git Repository**.
3. Vercel detecta `framework: vite`, `buildCommand: npm run build` y `outputDirectory: dist` desde `vercel.json`.
4. Añade las variables de entorno de la tabla anterior y haz Deploy.

### Opción B · CLI
```bash
npm i -g vercel
vercel            # preview
vercel --prod     # producción
```

---

## Arquitectura

```
├── api/ai.mjs                    # Proxy serverless de Vercel (clave en servidor)
├── vercel.json / .vercelignore / .env.example
├── index.html · vite.config.ts
└── src/
    ├── main.tsx · App.tsx · types.ts · vite-env.d.ts
    ├── data/defaults.ts         # estado vacío v3, demo opcional, key/modelo, proveedores
    ├── state/{store,toast}.tsx  # estado global, normalización y persistencia v3
    ├── lib/
    │   ├── tutors.ts            # 1 materia ↔ 1 tutor ↔ 1 chat
    │   ├── ai.ts                # buildTutorSystemPrompt (aislamiento), streaming, proxy, visión
    │   ├── quizzes.ts           # generación/parseo de quizzes por materia y MCER
    │   ├── files.ts             # filtro de videos + extracción PDF/DOCX/XLSX/PPTX + resize
    │   ├── memory.ts            # recuerdos permanentes por página
    │   ├── tts.ts               # text to speech local
    │   ├── imageStore.ts        # IndexedDB de blobs
    │   ├── artifacts.ts         # parseo + .xlsx/.pptx/.png
    │   ├── backup.ts · reminders.ts · quickAdd.ts · utils.ts
    ├── components/{ui,layout}/
    ├── features/
    │   ├── dashboard/           # PentagonChart + Dashboard
    │   ├── subjects/            # crea materia → carpeta + tutor + quiz
    │   ├── library/             # carpetas por materia y subida de fotos
    │   ├── biblioteca/          # historial completo de archivos enviados a la IA
    │   ├── chat/                # lista de tutores, Chat, Message, ArtifactCard
    │   ├── exercises/           # Ejercicios diarios
    │   ├── sessions/            # cronómetro real y racha
    │   ├── calendar/ · habits/ · settings/
    └── styles/                  # base, glass, layout, components, features
```

Librerías pesadas (`pdfjs-dist`, `mammoth`, `jszip`, `xlsx`, `pptxgenjs`) se cargan bajo demanda. El estado v3 migra suavemente datos de `my-study-center:v2`: los mensajes del chat antiguo pasan al primer tutor para no perderlos, y `ensureTutors()` garantiza que ninguna materia nueva se quede sin tutor.

---

## Verificación antes de publicar

```bash
npm run typecheck
npm run build
VITE_AI_PROXY=1 npx vite build --outDir dist-proxy
grep -R "sk-or-v1" dist-proxy || echo "OK: el bundle de producción no contiene la clave"
```

Además se smoke-testa el bundle con JSDOM: render de las 10 secciones, cambio de pestañas, persistencia local y 0 errores de consola. No hay Chromium/Playwright en el entorno, por lo que no se sustituye una prueba humana de interacción táctil o permisos reales de micrófono/notificaciones.

---

## Limitaciones honestas

- **Clave en el cliente**: sin `VITE_AI_PROXY=1` la clave es visible en el bundle. Usa el proxy en producción y rota la clave si se expuso.
- **OpenRouter `:free`** tiene cuotas y el nombre del modelo puede cambiar; si falla con 404/429, cámbialo en Ajustes.
- **Notificaciones**: solo mientras la pestaña está abierta; no hay service worker push ni backend.
- **Transcripción de audio**: depende de que el proveedor ofrezca `/audio/transcriptions`; si no, se usa dictado del navegador (Chrome/Edge) o una nota escrita. Los videos están excluidos por diseño.
- **TTS**: usa las voces instaladas en el sistema del navegador; varían por dispositivo.
- **Almacenamiento**: todo vive en tu navegador. Limpiar datos del sitio lo borra; exporta un respaldo antes.
- **Supabase no se usa**: la app es local-first y no introduce backend, cuentas ni sincronización.
