@AGENTS.md

## Database
- Before any ad-hoc `execute_sql`, run one read-only query on
  `information_schema.columns` for the tables you will touch. Never guess a
  column name (e.g. there is no `deleted_at` on these tables).

## Scripts
- A test or helper script that imports project packages (sharp, etc.) lives
  under `scripts/` in the repo (or uses `createRequire` pointed at the repo).
  Scratchpad scripts cannot find `node_modules`. (replay P5 2026-10-22)
