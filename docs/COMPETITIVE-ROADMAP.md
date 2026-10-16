# DRAVEX competitive benchmark and roadmap

**Reviewed:** 2026-10-16  
**Product constraint:** free-first, Android-friendly, browser-local where practical. Do not add paid APIs, paid hosting, or metered AI services without explicit approval.

## What the reference products already do

| Capability | CapCut (official product/help pages) | DaVinci Resolve (official page) | DRAVEX status |
|---|---|---|---|
| Trim and arrange clips | Yes | Yes | Basic start/end trim and ordered video sequence export |
| Auto edit to music / speech | Auto Cut can use beats, speech pauses, and prompts on supported platforms | Professional editing tools; AI features vary by edition | Not implemented |
| Automatic subtitles | Auto captions on supported platforms | Subtitles/captions supported | Not implemented |
| Multiple video, audio, image, and text tracks | Online editor advertises multiple tracks | Full timeline editing | Not implemented |
| Transitions, titles, effects, animation | Yes | Large effect/title/transition toolset | Basic title overlay only; no real transition engine |
| Audio mix / voice tools | Music, sound effects, voice and AI audio tools | Fairlight audio post-production suite | Source audio is now passed into WebM exports where browser support allows; music mixing and voice tools not implemented |
| AI scene / subject analysis | AI-assisted tools vary by feature and platform | Some advanced AI tools are Studio-only | Reference Lab only estimates visual changes; no semantic understanding |
| Export | Multiple formats and resolutions; feature limits can vary | Broad professional export; free edition has defined limits | Browser-local WebM; MP4 not implemented |

## Sources checked

- CapCut Auto Cut help: https://www.capcut.com/help/how-to-use-auto-cut
- CapCut auto captions help: https://www.capcut.com/help/how-to-recognise-subtitles
- CapCut online editor features / tracks: https://www.capcut.com/creative-suite
- DaVinci Resolve product and edition comparison: https://www.blackmagicdesign.com/products/davinciresolve
- DaVinci Resolve editing workflow: https://www.blackmagicdesign.com/products/davinciresolve/edit/

Availability, names, and free-tier limits can vary by region, platform, and app version. Re-check these sources before making product claims.

## DRAVEX build priorities

### P0 — Reliability before more AI
- Preserve original clip audio during local video export.
- Test trim ranges, clip ordering, long clips, and memory cleanup.
- Make the UI accurately state which media types are included in an export.
- Keep Android layout and touch controls usable.

### P1 — Core editor
- One ordered timeline that can include video and still images.
- Split, duplicate, delete, reorder, and trim with undo/redo.
- Explicit audio track controls: add music, volume, mute, fade in/out.
- Export validation and clear error messages; preserve the project JSON schema.

### P2 — Short-form creator features
- Beat detection and beat-marked timeline, followed by optional cut-to-beat.
- Caption creation/editing and safe-zone previews for TikTok/Reels/Shorts.
- Transition presets, speed changes, animated text, and style presets.
- Export profiles for 9:16, 1:1, 4:5, and 16:9.

### P3 — AI Creator
- Generate an editable edit plan from a prompt, duration, platform, and selected style.
- Analyze clips for scene changes and likely highlights; clearly distinguish heuristic results from model-based semantic analysis.
- Optional speech transcription / captions and shot selection through a free or local model where technically feasible.
- Always let users inspect and manually override the proposed edit before export.

### P4 — Quality and deployment
- Automated build checks plus practical browser/device checks.
- Test exported files for duration, sound, black frames, orientation, and subtitle safe zones.
- Keep model/provider integration optional; no secret API keys in client-side code and no surprise paid dependencies.

## Product principle

Do not try to imitate every professional feature at once. DRAVEX should aim to make the path from **idea + user's footage → editable plan → first finished short video** unusually simple, while preserving manual control and keeping the first workflow free. Never label a heuristic as AI understanding or advertise an export format until it is implemented and tested.
