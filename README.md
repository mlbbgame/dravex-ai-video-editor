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

The web app provides a responsive workspace, local media import and preview, clip ordering/removal, trim points, splitting at the playhead, project JSON export, a local prompt-to-storyboard scaffold, and reference-video pacing estimates. The local renderer exports WebM from image slideshows and ordered video/image sequences. Sequence exports apply the selected visual style, subtle camera motion, restrained cut flashes, vignette, and selected output resolution (720p, 1080p, or 4K). Original video audio is preserved where the browser pipeline supports it, and imported audio can be mixed at a fixed level. The Evolution Engine records workflow counters, optional ratings, and browser capability diagnostics locally; it does not upload telemetry or media. Connected generative AI, automatic audio beat detection, true speed-ramping, cross-clip dissolves, volume automation, MP4 encoding, benchmark-driven algorithm experiments, and autonomous code evolution are not implemented yet. Android device testing is still required. 4K export is resource-intensive on phones; use 1080p if the browser struggles.

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
4. Local WebM rendering with style-based visual treatment and selectable output resolution; next improve true transitions, audio controls, and export reliability.
5. AI planning connected to an optional model, with validated edit instructions, approval, and undo/revisions.
6. Scene analysis, captions, music, transitions, multiple variants, and quality checks.
7. Safe Evolution Engine: repeatable benchmark projects, regression tests, candidate experiments, measurable acceptance thresholds, and rollback.

## Current limitations

This is an early prototype, not yet a complete editor. It does not train its own model, provide unlimited free AI generation, or currently render a finished MP4. Do not upload sensitive media to third-party services; the current prototype keeps imported media in the browser session and does not upload it to a DRAVEX server.
