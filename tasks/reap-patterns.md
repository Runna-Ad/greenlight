# Reap patterns — bug classes the reap keeps catching (check these WHILE writing, not after)

## 1. Check-then-write race (leer, decidir en JS, escribir)
**Seen:** lessons in 7 projects (greenlight, greenlight-roles, SnapPad Command Center, snappad-launch-tool,
chore-champions, daily-briefings, social-influencers) + 3 wiki articles. Greenlight 2026-10-02 (Formatos), twice in
one feature: `prepararSalidas` read the "procesando" rows and then upserted unconditionally; the route processed the
row it READ instead of the row it CLAIMED.
**Rule at write time:** if the decision depends on a row's current state, the decision goes INSIDE the write:
`update … where <condition> returning *` (PostgREST: `.update().or(…).select("*")`), `insert … on conflict`, or a
unique index + catch 23505. Then use what the write RETURNED, never the earlier read. A select before a write is fine
for permission checks and early exits only.

## 2026-10-13 · Prisma › Formatos › `psd.ts` (puerta PSD) — code-reviewer + security-reviewer
**Pattern: a verification that is true by construction.** The module checked itself by reassembling pieces whose
colours it had just copied from the reference. Seen before in this project as "placeholder compared against a real
value" (row_hash "imported", 2026-07-31) and in the wiki (`auto-diagnostics-must-be-true-by-construction`). Count
here: 2. Other projects: runna-pitch/tasks/lessons.md mentions it (not read in detail). Proposed? no (below 3 confirmed).
**Rule at write time:** the proof of a transform is an input whose hidden truth you control, never its own round trip.
**Pattern: limits on each side, none on the product.** `w ≤ MAX` and `h ≤ MAX` let through `w × h`; a count cap on
layers let through "one full-size buffer per layer name". Count here: 1.
**Rule at write time:** every cap on untrusted input is on what gets ALLOCATED (area, count × size, decompressed
size), checked before the first allocation.

