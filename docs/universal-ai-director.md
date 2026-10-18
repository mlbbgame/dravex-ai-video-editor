# DRAVEX Universal AI Director — scene understanding and edit planning

## Product goal

DRAVEX is a universal editor, not an edit-only template generator. It should infer what is happening in uploaded photos and videos, identify useful moments, and choose an edit plan suited to the subject. Users can override the detected category and style at any time.

The current browser prototype uses heuristics and a local planning scaffold. This document describes the implementation target; it does not claim that semantic AI is already connected.

## Required scene families

The director should support mixed footage and allow more than one family in a project:

- Nature and wildlife: landscapes, forests, mountains, water, weather, flowers, animals, macro details.
- Food and cooking: ingredients, preparation steps, cutting, mixing, cooking, plating, final dish, restaurant/food reviews.
- Travel and places: establishing shots, landmarks, walking POV, transport, city/night scenes, trip recaps.
- People and lifestyle: portraits, family, celebrations, daily routines, fashion, pets, vlogs.
- Cars and motorsport: vehicles, driving, drifting, rolling shots, wheels, smoke, track action.
- Sports and fitness: action peaks, jumps, goals, lifts, training sequences, match highlights.
- Gaming, anime and animation: gameplay events, character moments, action peaks, stylized visual rhythm.
- Products and commerce: product reveal, detail shots, use demonstration, before/after, unboxing.
- Education and how-to: ordered steps, demonstrations, important details, final outcome.
- Events and performances: weddings, birthdays, concerts, dance, stage and crowd moments.
- Architecture and real estate: exterior/interior, room flow, details, lighting, before/after.
- Art, crafts and DIY: making process, progress, detail shots, finished work.
- Underwater, aerial, macro and other specialist footage.
- General/mixed footage fallback when confidence is low.

## Scene understanding pipeline

1. Ingest media and read safe technical metadata: duration, dimensions, orientation, frame rate where available, audio presence, and image/video type.
2. Sample frames across the full source, with denser sampling around motion changes or candidate events. Avoid decoding every frame on low-memory phones.
3. Build a scene description from visual signals: objects, actions, environment, people/animals, camera movement, motion intensity, shot changes, lighting, and likely focal subject. Audio analysis separately estimates speech/music/noise and possible beat/onset timing.
4. Produce confidence-scored labels, not a single irreversible category. Support mixed labels such as nature + travel, food + tutorial, car + cinematic.
5. Rank candidate moments by relevance to the chosen goal, visual clarity, motion/action peak, framing, focus/quality, variety, and continuity. Do not simply pick the most moving frames.
6. Generate multiple editable edit plans from the same media, such as natural, cinematic, energetic/social, tutorial/story, and user-defined style. Category-specific defaults must be applied before global style intensity.
7. Validate the plan: no empty clips, source-time bounds respected, sensible pacing, no repeated near-identical shots unless intentional, duration target respected, and soundtrack/cut boundaries handled safely.
8. Render, then inspect the actual exported file metadata and decode/playback success. Keep preview and final render behavior consistent.

## Category-aware direction rules

### Nature and wildlife
- Prefer stable, longer shots for landscapes, slow movement, wildlife behavior, clouds, water and changing light.
- Use gentle pans/zooms only when they do not invent distracting movement or crop the subject.
- Use natural color and restrained grading; protect highlights, foliage, sky and water from oversaturation.
- Use ambient/natural sound or calm cinematic music; avoid forcing every cut to a beat.
- Prioritize meaningful changes and animal behavior, not random cuts.

### Food and cooking
- Detect process stages when possible: ingredients, preparation, cooking, transformation, plating and final result.
- Preserve sequence and causality; do not reorder steps if it makes the process misleading.
- Use close-up/detail framing for texture, steam, ingredients and the finished dish; keep the food in frame.
- Use crisp pacing for recipe/social edits and slower pacing for premium food/cinematic edits.
- Sync selected cuts to music only when it does not obscure essential steps or speech.
- Offer captions/step labels as an optional future feature, never fabricate ingredients or instructions.

### Travel and places
- Establish location/setting first, then alternate wide shots, details, people/action and a strong closing shot.
- Preserve orientation and recognizable landmarks; avoid overusing transitions.
- Use natural ambience and cinematic pacing by default.

### People, lifestyle and events
- Prioritize faces, expressions, interactions and key moments while respecting source framing.
- Avoid aggressive crops that cut off faces or important people.
- Preserve chronological order for ceremonies, tutorials and event recaps when order matters.

### Cars, sports, gaming and action
- Find action peaks and meaningful changes in motion; use faster cuts selectively.
- Speed ramping and motion blur must be applied only when supported by the renderer and source frame rate; never imply these are available until implemented and tested.
- Keep subject readable and avoid effects that hide the action.

### Product, education, craft and real estate
- Respect story order (overview → details → use/process → result).
- Keep key details visible and avoid fast cuts when viewers need to understand an instruction or inspect an object.
- For before/after comparisons, preserve the comparison clearly.

## Style is separate from subject

Subject/category answers “what is happening?”; style answers “how should it feel?” They must not be conflated. A nature video can be cinematic, energetic, documentary or dreamy. Food can be premium, fast recipe, cozy or commercial. Users should be able to choose:
- Auto Director (infer both subject and suitable style)
- Natural / documentary
- Cinematic
- Energetic / social
- Tutorial / story
- Custom style and intensity

Each generated variant must have a genuinely different edit plan, not only a different title or color filter.

## Confidence and user control

- Show detected categories and confidence in understandable language.
- If confidence is low or labels conflict, ask the user to select a category or use the general fallback rather than pretending to understand.
- Allow excluding clips, pinning must-keep moments, setting target duration/aspect ratio, and choosing whether source speech/ambient sound should remain.
- Keep manual timeline editing available.
- Do not upload source media to a cloud model without explicit, clear consent. Prefer local processing where feasible and disclose any cloud analysis, retention, cost, and limits before enabling it.

## Acceptance tests

Use representative fixtures for each family, including mixed and low-confidence samples. Tests should check plan structure and source bounds, not claim semantic understanding from synthetic fixtures.

1. Nature plan favors stable pacing and restrained transitions by default.
2. Food/cooking plan preserves a supplied step order and does not drop the final dish.
3. Travel plan includes establishing/detail/closing variety when those shots exist.
4. People/event plan avoids destructive face crops and can preserve chronological order.
5. Action plan can prioritize detected event peaks without making every cut aggressive.
6. Product/how-to plan preserves the explanatory sequence.
7. Mixed footage can receive multiple labels or the general fallback.
8. Low-confidence input is surfaced honestly and can be corrected by the user.
9. Every variant has distinct clip choices/timing/style parameters and remains editable.
10. Rendered artifact is checked for duration, dimensions, audio presence where expected, decode/playback validity and visual sample frames.

## Implementation order

1. Define typed scene labels, confidence values, user overrides, and an editable director plan schema.
2. Add deterministic unit tests for plan validation and category-specific rule selection.
3. Add an interchangeable scene-analysis provider interface: local heuristics now; optional vision/audio model later. Keep provider status and confidence explicit.
4. Add category-aware ranking and style rules without breaking the existing manual editor or renderer.
5. Build a small, diverse, rights-safe evaluation set of photos/videos and compare rendered outputs visually.
6. Only then connect a cloud vision model if a genuinely free, reliable option is available and user privacy/cost constraints are met.

## Current limitations

This document is a product/engineering specification. It does not itself add semantic scene recognition, a cloud model, speed ramping, or category-aware rendering. The existing prototype's README states that its current director is heuristic/local and does not yet have semantic understanding from a connected generative model. Feature claims must remain aligned with implemented and tested behavior.
