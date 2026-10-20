import postgres from 'postgres';
import { z } from 'zod';
import { migrate } from '../migrator.js';

// Only the database URL: migrations run as a one-off job, before the services start.
const env = z
  .object({ DATABASE_URL: z.string().regex(/^postgres(ql)?:[/][/]/) })
  .parse(process.env);
const sql = postgres(env.DATABASE_URL, { max: 1, onnotice: () => undefined });
try {
  const applied = await migrate(sql);
  console.log(applied.length > 0 ? `applied: ${applied.join(', ')}` : 'schema up to date');
} finally {
  await sql.end();
}
