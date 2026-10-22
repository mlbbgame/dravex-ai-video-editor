# DRAVEX AI Director Master Contract

The master metaprompt is a specification, not a runtime capability by itself. The implementation must validate source references, clip bounds, output settings, and all six quality dimensions before accepting a montage plan. Local-first processing, explicit consent for external processing, free-only tools, benchmark comparison on identical clips, and rollback are required.

## Runtime integration

`buildDirectorMontagePlan` in `src/video/ai-director.ts` converts analyzed highlight moments into the versioned montage-plan contract and validates source trims, style, output settings, and evidence before returning a plan. Invalid plans return `plan: null` with validation issues. This adapter is a planning/validation boundary only: rendering, audio beat detection, quality scoring, and persistent learning remain separate capabilities and must not be reported as completed by this adapter.

Automated coverage lives in `tests/ai-director-runtime-contract.spec.ts`.
