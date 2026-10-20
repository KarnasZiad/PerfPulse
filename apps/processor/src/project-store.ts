import type { Sql } from 'postgres';
import { hashToken, parseOrigin, randomToken } from './projects.js';

export interface CreatedProject {
  id: string;
  slug: string;
  publicKey: string;
  /** Shown once: only its digest is stored. */
  readToken: string;
}

export async function createProject(
  sql: Sql,
  input: { name: string; slug: string; origins: string[] },
  pepper: Buffer,
): Promise<CreatedProject> {
  const origins = input.origins.map(parseOrigin);
  const publicKey = `pk_${randomToken(32)}`;
  const readToken = `pp_read_${randomToken(40)}`;
  return sql.begin(async (tx) => {
    const [project] = await tx<{ id: string }[]>`
      insert into projects (slug, name, public_key, allowed_origins)
      values (${input.slug}, ${input.name}, ${publicKey}, ${origins})
      returning id`;
    if (!project) throw new Error('Project not created');
    await tx`
      insert into api_tokens (project_id, label, token_hash)
      values (${project.id}, ${'created with the project'}, ${hashToken(readToken, pepper)})`;
    return { id: project.id, slug: input.slug, publicKey, readToken };
  });
}
