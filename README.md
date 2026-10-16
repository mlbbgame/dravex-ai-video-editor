# DRAVEX — AI Video Creator & Manual Studio

DRAVEX is a mobile-first video creation workspace with two equally important paths:

- **AI Creator** — the intended end-to-end workflow: describe a video, add media, review an editable plan, then render the result. The first prototype uses a local planning scaffold; it does not yet connect to a generative AI model.
- **Manual Studio** — edit your own media directly, without being required to use AI.

The user chooses the workflow. A future mixed workflow may let users switch between AI assistance and manual control at any time.

## Principles

- Start with free tools and keep the source code in GitHub.
- Design mobile-first, including Android browsers.
- Preserve editable project data and support revisions.
- Do not claim a video was generated or exported unless a real render completed.
- Keep DRAVEX separate from the Grim_gg project.

## Current prototype

The initial web app provides a responsive workspace, local media import and preview, clip ordering/removal, project settings, a basic prompt-to-storyboard scaffold, and project JSON export. AI model integration and production-grade MP4 rendering are future milestones; browser compatibility and performance must be tested on real devices.

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

1. Responsive app shell and local media bin.
2. Manual clip controls and editable project persistence.
3. Real timeline operations and reliable video export.
4. AI planning connected to a model, with validated edit instructions and undo/revisions.
5. Scene analysis, captions, music, transitions, multiple variants, and quality checks.
6. Optional image/video/audio generation providers, subject to their availability, terms, and costs.

## Current limitations

This is an early prototype, not yet a complete editor. It does not train its own model, provide unlimited free AI generation, or currently render a finished MP4. Do not upload sensitive media to third-party services; the current prototype keeps imported media in the browser session and does not upload it to a DRAVEX server.
