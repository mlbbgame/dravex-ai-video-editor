# DRAVEX AI Director — Self-improvement loop

**Status:** first provider-neutral learning foundation implemented on this feature branch; model-weight training and automatic renderer integration are not implemented.  
**Safety boundary:** feature branch only. Do not merge to `main`, publish, or alter the live site without explicit user approval.

## Learning cycle

1. Record a compact experience after a montage: selected profile/variant, explicit user actions, and measured quality dimensions. Do not store source media, private URLs, faces, or unnecessary personal data in this record.
2. Summarize evidence per profile and quality dimension. Missing scores are ignored; absence of feedback is not treated as negative feedback.
3. After a minimum sample count, propose hypotheses for consistently low scores or repeated user edits.
4. Test candidate planner tuning on the same versioned benchmark set.
5. Promote a candidate only when it clears the minimum aggregate gain and no measured dimension exceeds the allowed regression. Otherwise preserve the previous tuning version.
6. Keep personal preference memory separate from shared/general model training. Shared learning must require a separately governed, consent-aware pipeline.

## Current implementation

- `src/video/director-learning.ts` provides typed experience records, validation, per-profile summaries, hypothesis generation, conservative tuning-candidate evaluation, and an injected local JSON store adapter.
- `src/video/director-knowledge.ts` provides explainable editing heuristics for gaming (including MLBB/PUBG), cars/drift, nature/travel, food, sports, people, products/DIY, and anime. The local plan generator now includes the matching principles, avoid-list, and quality questions when prompt keywords identify a domain.
- Experience history is bounded to 500 records and duplicate IDs are ignored by the store adapter.
- `tests/director-learning.spec.ts` covers validation, profile isolation, hypothesis generation, and acceptance/rollback decisions.
- The tuning evaluator changes only explicit bounded planner parameters. It does not edit source code or claim to retrain a neural network.
- Knowledge-domain inference is based on the text prompt, not verified video understanding. The generated plan says this explicitly; visual action recognition and renderer integration remain separate work.
- The local store adapter requires the app to inject browser storage; production integration must include clear user controls for retention/deletion and must not silently upload history.

## Deliberate limitations

- A saved score or memory is not model training. True model fine-tuning requires a suitable trainable model, curated data, compute, evaluation, and version management.
- The first iteration supports evidence-driven planner tuning and improvement suggestions. It does not automatically deploy code changes.
- Do not promote tuning until benchmark provenance, enough samples, and regression checks are reliable.
- Preserve user privacy, source media, and existing manual-editing flows.
