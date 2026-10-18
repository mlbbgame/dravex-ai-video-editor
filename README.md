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

The integrated test editor supports local import and ordering of up to 12 video/mixed-media clips or up to 80 photos, actual short WebM previews of multiple styles, a browser-side highlight scan with optional local object detection, Velocity speed ramps, camera motion, style-aware color grading, transition families, music controls, beat/onset-based timing when confidence is sufficient, and export in 720p or 1080p at 9:16, 16:9, 1:1, or 4:5. Export now uses centralized profiles for dimensions, frame rate, bitrate, and supported WebM codec selection. Before recording, the renderer validates the metadata-resolved timeline and audio bounds to catch invalid trims or timeline gaps. Large Android imports show warnings instead of being rejected solely for file size. Rendering remains local in the browser, and the tab must stay open while it runs.

## Integrated QA candidate

The isolated `feature/dravex-integrated-candidate` branch combines the preview-first editor with the accumulated timeline, media-intake, export-profile, and recognition-contract work. CI runs the TypeScript/Vite build, browser tests, and a render-evidence workflow that probes the generated WebM and stores reports/screenshots as temporary artifacts. These checks are regression gates, not proof of artistic quality or a substitute for playback on a real Android device. This branch is a test candidate only; it is not the production `main` branch.

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

DRAVEX is still an experimental browser editor, not a complete desktop-class editor. The current object detector runs locally in the browser and can fall back to visual/motion heuristics; it is not reliable semantic action recognition and is not connected to a cloud AI Director or cloud rendering backend. Export is WebM, not MP4. Beat/onset detection is an estimate rather than guaranteed beat tracking, and actual playback, audio routing, memory use, and encoder behavior vary by Android device. The UI exposes 720p/1080p export; a 4K profile in code is not a claim of stable 4K export on mobile. Always play the saved file back before relying on it.


## Self-introduction video studio

The self-introduction studio creates a short, six-scene animated presentation about DRAVEX itself. Users can choose a project overview or a first-use tutorial, in English or Russian, then render a vertical 9:16 WebM locally in the browser and preview/download the result. It does not use a paid API or upload media. The current version draws illustrative interface scenes and captions; it is not a screen recording of real clicks, has no voiceover yet, and should be treated as a first prototype. Canvas capture and MediaRecorder support are checked at runtime. Android Chrome testing is still required.


## Persistent learning memory (experimental)

The Reference Lab can store locally observed pacing profiles in browser `localStorage` across visits, combine repeated samples by pace, and record explicit helpful / not-helpful feedback. Positive feedback can guide which automatic highlight variant is preselected in later sessions. This is a small transparent heuristic feedback loop, not neural-network training, not cloud synchronization, and not autonomous discovery of TikTok/YouTube media. The current browser-only app cannot read frames or audio inside cross-origin platform embeds. Automatic web research and full link-based audiovisual analysis require a permitted media source and/or a backend integration; the app must not claim these steps ran when they did not.
