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
