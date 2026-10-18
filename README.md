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

The web app provides a responsive workspace, local media import and preview, clip ordering/removal, trim points, splitting at the playhead, project JSON export, a local prompt-to-storyboard scaffold, reference-video pacing estimates, and an experimental automatic highlight director. The highlight director samples frames from a selected local video, estimates visual change/motion/contrast, and proposes aggressive, cinematic, and slower edit variants with durations chosen from available segments (up to about one minute). Applying a variant replaces the source clip with a sequence of trim ranges. For memory safety, the sequence renderer reuses a single video element for multiple trims from the same source. Sequence exports apply the selected visual style, subtle camera motion, restrained cut flashes, vignette, selected output resolution (720p, 1080p, or 4K), and target-length fitting when the imported sequence is longer than requested. Title overlays are optional and disabled by default so exports can stay clean. Original video audio is preserved where the browser pipeline supports it, and imported audio can be mixed at a fixed level. The Evolution Engine records workflow counters, optional ratings, and browser capability diagnostics locally; it does not upload telemetry or media. The highlight director is a heuristic prototype, not semantic AI: it does not recognize characters, plot, emotion, dialogue, or musical beats, and its selections must be reviewed. Connected generative AI, automatic audio beat detection, true speed-ramping, cross-clip dissolves, volume automation, MP4 encoding, benchmark-driven algorithm experiments, and autonomous code evolution are not implemented yet. Android device testing is still required. 4K export is resource-intensive on phones; use 1080p if the browser struggles.

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


## Self-introduction video studio

The self-introduction studio creates a short, six-scene animated presentation about DRAVEX itself. Users can choose a project overview or a first-use tutorial, in English or Russian, then render a vertical 9:16 WebM locally in the browser and preview/download the result. It does not use a paid API or upload media. The current version draws illustrative interface scenes and captions; it is not a screen recording of real clicks, has no voiceover yet, and should be treated as a first prototype. Canvas capture and MediaRecorder support are checked at runtime. Android Chrome testing is still required.


## Persistent learning memory (experimental)

The Reference Lab can store locally observed pacing profiles in browser `localStorage` across visits, combine repeated samples by pace, and record explicit helpful / not-helpful feedback. Positive feedback can guide which automatic highlight variant is preselected in later sessions. This is a small transparent heuristic feedback loop, not neural-network training, not cloud synchronization, and not autonomous discovery of TikTok/YouTube media. The current browser-only app cannot read frames or audio inside cross-origin platform embeds. Automatic web research and full link-based audiovisual analysis require a permitted media source and/or a backend integration; the app must not claim these steps ran when they did not.


## Preview editor update (2026-10-18)

The isolated GitHub Pages preview at `/preview/` is being rebuilt from `feature/dravex-full-editor-upgrade`. Recent preview-only improvements include a wider editor workspace, a larger source-video preview, a smooth playback-speed ramp for Velocity edits, and music-beat-aware cut timing for mixed photo/video sequences when beat detection is reliable. These changes do not alter the primary app source branch (`feature/dravex-camera-audio-v2`).

The preview is still an evolving browser-based editor: semantic scene understanding by a true AI model, a full multi-track timeline, MP4 encoding, and real-device Android export validation remain separate work items.


## Preview interface redesign (2026-10-18)

The preview editor now uses a responsive two-column workspace on wider screens, with a larger media canvas and style controls beside it. On Android, the editor stays single-column with improved touch targets and an easy-to-reach Auto Edit action. Changes are isolated to `feature/dravex-full-editor-upgrade`; the primary editor source remains unchanged.


## Preview render engine update (2026-10-18)

The isolated preview renderer now uses an eased Velocity speed curve and style-aware color grading across Cinematic, Anime, Velocity, Glitch, and Story looks. The existing camera motion, transition families, and beat-aware edit planning remain in place. Build/typecheck passed before merge; browser smoke tests are being checked. The primary site source branch remains unchanged.
