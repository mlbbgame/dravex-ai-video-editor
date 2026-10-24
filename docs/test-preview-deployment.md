# DRAVEX test preview

This branch is deployed to the isolated GitHub Pages preview at `/preview/` by `.github/workflows/deploy-test-branch-preview.yml`.

The workflow builds the production site from `main` for the root path and builds this branch separately under `/preview/`. It does not merge this branch into `main`.

Use this preview to validate Android video loading, automatic montage, audio, and export before considering any merge.
