import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Sql } from 'postgres';

/** migrations/ sits next to src/ and dist/, in the repository and in the Docker image alike. */
export const MIGRATIONS_DIR = fileURLToPath(new URL('../migrations', import.meta.url));

// Arbitrary but fixed: every instance contends for the same lock.
const LOCK = 5_118_204_771;

export interface Migration {
  id: string;
  checksum: string;
  sql: string;
}

export async function loadMigrations(directory = MIGRATIONS_DIR): Promise<Migration[]> {
  const files = (await readdir(directory))
    .filter((file) => /^\d{4}_[\w-]+\.sql$/.test(file))
    .sort();
  return Promise.all(
    files.map(async (file) => {
      const sql = await readFile(join(directory, file), 'utf8');
      return {
        id: file.replace(/\.sql$/, ''),
        checksum: createHash('sha256').update(sql).digest('hex'),
        sql,
      };
    }),
  );
}

/**
 * Applies pending migrations in order, in one transaction (all or nothing), under an advisory lock.
 * A migration edited after being applied is refused: history is rewritten by a new migration only.
 */
export async function migrate(sql: Sql, directory = MIGRATIONS_DIR): Promise<string[]> {
  const migrations = await loadMigrations(directory);
  return sql.begin(async (lock) => {
    await lock`select pg_advisory_xact_lock(${LOCK})`;
    await lock`
      create table if not exists schema_migrations (
        id text primary key,
        checksum text not null,
        applied_at timestamptz not null default now()
      )`;
    const applied = new Map(
      (
        await lock<{ id: string; checksum: string }[]>`select id, checksum from schema_migrations`
      ).map((row) => [row.id, row.checksum]),
    );
    const done: string[] = [];
    for (const migration of migrations) {
      const checksum = applied.get(migration.id);
      if (checksum !== undefined) {
        if (checksum !== migration.checksum) {
          throw new Error(`Migration ${migration.id} was modified after being applied`);
        }
        continue;
      }
      await lock.savepoint(async (step) => {
        await step.unsafe(migration.sql);
        await step`insert into schema_migrations (id, checksum) values (${migration.id}, ${migration.checksum})`;
      });
      done.push(migration.id);
    }
    return done;
  });
}
