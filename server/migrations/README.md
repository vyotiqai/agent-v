# Migrations

Numbered SQL files, applied in order by `npm run migrate` (the runner is `src/db/migrate.ts`).

- Name each file `0001_what_it_does.sql`, numbered from 1 with no gaps.
- Never edit a file once it has been applied anywhere: the runner stores each file's checksum and
  stops on a changed file. Fix a mistake with a new migration.
- Each file runs in one transaction: it applies completely or not at all.
- Change the schema in two steps, so the running version and the new one both work during a
  deploy (stage 6, section 21): add the new column or table first; start using it in the next
  release; remove the old one in a release after that.

Slice 0 ships no tables: each slice adds the tables it needs (stage 6, section 12).
