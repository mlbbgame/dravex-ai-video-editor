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

The current editor supports local video or photo import, photo ordering/removal, preview, an experimental automatic highlight director for videos, five visual styles, three transition modes, adjustable motion strength, music import and volume control, optional local beat/onset estimation, saved projects in browser storage, and WebM rendering at 720p, 1080p, or an experimental 4K (2160p) canvas preset in 9:16, 16:9, 1:1, or 4:5 formats. 4K is a high-memory option, may fail on Android devices, and upscaling a lower-resolution source does not create real detail; use 720p/1080p when reliability matters. The renderer uses canvas-based camera motion, style treatment, several native-canvas transition families, and music fade-in/fade-out; source-video audio is retained where the browser audio pipeline permits it. Photo sequences can be paced to a selected duration, and cut boundaries can be nudged toward detected audio onsets when confidence is sufficient. These are heuristic/local-browser features, not a connected generative AI model or semantic understanding of the scene. Beat detection is an energy/onset estimate rather than guaranteed musical beat tracking. MP4 export, true speed-ramping, captions, and a cloud AI model are not currently provided. The browser must remain open during rendering; memory and encoder limits vary by Android device, so use 720p for long/heavy projects and verify every exported file by playing it back.

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

This is an experimental browser-based editor, not yet a full desktop-class editor. It does not train its own model, provide unlimited free AI generation, or export MP4. Local rendering avoids sending imported media to a DRAVEX server, but browser storage can be cleared by the user/device and a tab may be terminated under memory pressure. Keep backup copies of important source files and test output playback before relying on it.


## Self-introduction video studio

The self-introduction studio creates a short, six-scene animated presentation about DRAVEX itself. Users can choose a project overview or a first-use tutorial, in English or Russian, then render a vertical 9:16 WebM locally in the browser and preview/download the result. It does not use a paid API or upload media. The current version draws illustrative interface scenes and captions; it is not a screen recording of real clicks, has no voiceover yet, and should be treated as a first prototype. Canvas capture and MediaRecorder support are checked at runtime. Android Chrome testing is still required.


## Persistent learning memory (experimental)

The Reference Lab can store locally observed pacing profiles in browser `localStorage` across visits, combine repeated samples by pace, and record explicit helpful / not-helpful feedback. Positive feedback can guide which automatic highlight variant is preselected in later sessions. This is a small transparent heuristic feedback loop, not neural-network training, not cloud synchronization, and not autonomous discovery of TikTok/YouTube media. The current browser-only app cannot read frames or audio inside cross-origin platform embeds. Automatic web research and full link-based audiovisual analysis require a permitted media source and/or a backend integration; the app must not claim these steps ran when they did not.
