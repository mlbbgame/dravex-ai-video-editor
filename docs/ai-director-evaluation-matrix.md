# AI Director evaluation matrix

## What the current automated checks establish

The browser QA workflow checks that DRAVEX can build, load representative media fixtures, create montage previews, export WebM files, and produce review frames. The current fixtures include generated placeholder photos and synthetic color-bar videos. These are useful for export and regression checks, but they are **not** evidence that the AI Director correctly understands real PUBG/MLBB matches, car drift, cooking steps, or human actions.

The current semantic model is a lightweight image classifier sampled at a few timestamps. Temporal cues summarize motion changes and changes in detected labels; they are not verified action recognition.

## Human-review benchmark set

Before claiming reliable action understanding, evaluate real, rights-cleared clips in each category below. Include both short clips (5–15 seconds) and longer sources (30 seconds–5 minutes), portrait and landscape footage, low light, fast movement, and mixed scenes.

| Category | Required examples | What a reviewer checks |
| --- | --- | --- |
| Gaming | PUBG Mobile knock/finish, vehicle, looting; MLBB team fight, objective, kill-feed/HUD; another game with a different HUD | Important gameplay moments are selected; HUD/minimap remains readable; no kill/knock is claimed unless the evidence supports it |
| Cars | Drift initiation, apex, smoke, exit, static driving shot | Cuts follow actual movement; drift is not inferred from a parked car or generic motion |
| Nature/travel | Scenic reveal, walking/hiking, landmark, moving vehicle, static landscape | Scenic moments are preserved; transitions do not cut away before the reveal |
| Cooking | Chopping, mixing, cooking heat, plating, finished dish | The sequence remains understandable and does not confuse an ingredient/utensil with a completed step |
| People/vlog | Talking head, interview, gesture, group scene | Faces remain framed; pauses and speech are not cut into unintelligible fragments |
| Sports/outdoors | Goal attempt, shot, jump, skate trick, climbing move | Peak selection matches the visible action rather than only the presence of sports equipment |
| Mixed footage | Gameplay plus facecam, travel plus talking head, several unrelated scenes | Category changes are detected conservatively and one scene does not dictate the whole montage |

## Score each clip

Record the source category, duration, aspect ratio, expected moments, selected moments, chosen style, and export result. Score each item from 0 to 2:

- **Moment relevance:** 0 = misses key events; 1 = partial; 2 = key events preserved.
- **Temporal correctness:** 0 = false action assumption; 1 = plausible but uncertain; 2 = cue is supported by visible evidence.
- **Variant distinction:** 0 = near-identical edits; 1 = mostly filter/tempo differences; 2 = meaningful differences in selected moments and pacing.
- **Framing:** 0 = subject/HUD clipped or tiny; 1 = minor issue; 2 = subject and relevant HUD remain legible.
- **Technical export:** 0 = fails/unplayable; 1 = plays with a defect; 2 = playable with expected duration, video and audio.

Do not report an accuracy percentage until there is a labeled clip set and results are recorded against it. Automated unit tests cover logic and guardrails; human review of real footage is still required for semantic quality.
