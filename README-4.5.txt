STREAMLINE RELEASE 4.5 — GITHUB PAGES PACKAGE

Upload these files/folders to the ROOT of your GitHub Pages repository:

index.html
local-coverage-2026.json
.github/workflows/update-local-coverage.yml
scripts/update-local-coverage.mjs
README-4.5.txt

Important:
- Keep local-coverage-2026.json beside index.html at the repository root.
- Keep the .github and scripts folder structure exactly as packaged.
- GitHub Pages should serve index.html automatically.
- The scheduled GitHub Action is intended to refresh local-coverage-2026.json when usable weekly CBS/FOX coverage assignments are available.
