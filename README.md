# DRAVEX — AI Video Creator & Manual Studio

DRAVEX is a mobile-first video creation workspace with two equally important paths:

- **AI Creator** — the intended end-to-end workflow: describe a video, add media, review an editable plan, then render the result. The first prototype uses a local planning scaffold; it does not yet connect to a generative AI model.
- **Manual Studio** — edit your own media directly, without being required to use AI.
- **Collaboration** — review an AI-prepared draft, then edit manually; the user retains creative control.

The workflow can be switched at any time. Collaboration currently combines the local planning scaffold with the existing manual editing controls; it does not yet connect a generative model.

## Principles

- Start with free tools and keep the source code in GitHub.
- Design mobile-first, including Android browsers.
- Preserve editable project data and support revisions.
- Do not claim a video was generated or exported unless a real render completed.
- Keep DRAVEX separate from the Grim_gg project.

## Evolution Engine foundation

The first Evolution Engine layer records workflow counters and voluntary user ratings in browser-local storage, and can check local browser capabilities (WebM recording, canvas capture, audio API, workers, secure context, and storage). It does not upload telemetry, media, filenames, or feedback. Users can inspect and clear the local history. This is a measurement and feedback foundation, not autonomous self-modifying code or model training. Safe code evolution still requires automated tests, benchmark comparisons, review gates, and a separate controlled CI workflow.

## Current prototype

The initial web app provides a responsive workspace, local media import and preview, clip ordering/removal, project settings, a basic prompt-to-storyboard scaffold, and project JSON export. The first local render prototype can create a short WebM slideshow from imported images with a subtle zoom effect and title overlay, using the browser's Canvas and MediaRecorder APIs. It does not yet render imported video clips, include audio, or export MP4. AI model integration and broader device compatibility/performance testing remain future milestones.

## Run locally

Requires Node.js 20 or newer.

```bash
npm install
npm run dev
```

For a production build:

```bash
npm run build
npm run preview
```

## Roadmap

1. Responsive app shell, local media bin, and three workflow modes (AI Creator, Manual Studio, Collaboration).
2. Evolution Engine foundation: local workflow metrics, device diagnostics, and optional local feedback.
3. Manual clip controls and editable project persistence.
4. Local image-to-video WebM rendering and video sequence export; improve transitions, audio controls, and export reliability.
5. AI planning connected to an optional model, with validated edit instructions, approval, and undo/revisions.
6. Scene analysis, captions, music, transitions, multiple variants, and quality checks.
7. Safe Evolution Engine: repeatable benchmark projects, regression tests, candidate experiments, measurable acceptance thresholds, and rollback.

## Current limitations

This is an early prototype, not yet a complete editor. It does not train its own model, provide unlimited free AI generation, or currently render a finished MP4. Do not upload sensitive media to third-party services; the current prototype keeps imported media in the browser session and does not upload it to a DRAVEX server.
