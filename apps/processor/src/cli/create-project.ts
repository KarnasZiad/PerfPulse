import { parseArgs } from 'node:util';
import postgres from 'postgres';
import { z } from 'zod';
import { createProject } from '../project-store.js';

// pnpm project:create --name "Boutique" --slug boutique --origin https://shop.example.ma
const { values } = parseArgs({
  options: {
    name: { type: 'string' },
    slug: { type: 'string' },
    origin: { type: 'string', multiple: true, default: [] },
  },
});

const env = z
  .object({
    DATABASE_URL: z.string().regex(/^postgres(ql)?:[/][/]/),
    API_TOKEN_PEPPER: z
      .string()
      .transform((value) => Buffer.from(value, 'base64'))
      .refine((pepper) => pepper.length >= 32, 'API_TOKEN_PEPPER must decode to at least 32 bytes'),
  })
  .parse(process.env);

if (!values.name || !values.slug || values.origin.length === 0) {
  console.error(
    'Usage: project:create --name <name> --slug <slug> --origin <https://origin> [--origin ...]',
  );
  process.exit(1);
}

const sql = postgres(env.DATABASE_URL, { max: 1 });
try {
  const project = await createProject(
    sql,
    { name: values.name, slug: values.slug, origins: values.origin },
    env.API_TOKEN_PEPPER,
  );
  console.log(`Project ${project.slug} created.`);
  console.log(`Public key (SDK):        ${project.publicKey}`);
  console.log(`Read token (dashboard):  ${project.readToken}`);
  console.log('The read token is shown only once: store it in a password manager.');
} finally {
  await sql.end();
}
