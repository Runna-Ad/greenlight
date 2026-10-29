# Greenlight — next session prompt

> Written 2026-10-28 (Formatos session). Replaces the 2026-08-19 prompt (bold paste in «Copiar guión», done long ago).

Working dir: `/Users/runna/Projects/greenlight` · branch `prisma` (preview only; never ship without Pedro's "ship it").
Read first: `tasks/todo.md` § ⭐ PRIMERO, the last entry of `tasks/session-log.md`, `tasks/lessons.md`.

## FIRST TASK: Formatos test battery + top performers as best-practice examples
Pedro: "do the battery of tests we talked about with different images and different degrees and challenges so we can
make it work for all those types and more. also all of those examples are top performers and would benefit to have
them registered as examples of best practices layout etc."

1. Get the top performers from Pedro (PSD + flat images). Client images stay OUT of the repo (it is public): use
   `~/Desktop/formatos-prueba/`.
2. Read each flat image once on the preview (cache 0087 keeps it), pull the readings, build
   `scripts/bateria-formatos.mjs` (like `scripts/probar-lectura.mjs`) and produce a results table per ad BEFORE fixing.
3. Fix by failure group, one test per fix, rerun the whole battery and diff the full table.
4. For best practices: measure each ad's layout (where each piece goes, sizes, margins, per ratio) and give Pedro 2-3
   ways to store it before building.
