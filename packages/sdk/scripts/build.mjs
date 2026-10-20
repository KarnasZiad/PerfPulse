// Bundles the SDK (ES module and <script> build) and checks the size budget.
import { mkdirSync, writeFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { build } from 'esbuild';

/** Minified and gzip-compressed, as served by a CDN. */
const BUDGET_BYTES = 5 * 1024;

const common = {
  entryPoints: ['src/index.ts'],
  bundle: true,
  minify: true,
  target: ['es2020'],
  // Bundles the protocol constants from source: no build of the workspace needed.
  conditions: ['@perfpulse/source'],
  legalComments: 'none',
  write: false,
};

const [esm, iife] = await Promise.all([
  build({ ...common, format: 'esm' }),
  build({ ...common, format: 'iife', globalName: 'PerfPulse' }),
]);

const outputs = { 'perfpulse.mjs': esm, 'perfpulse.iife.js': iife };
let failed = false;
for (const [name, result] of Object.entries(outputs)) {
  const code = result.outputFiles[0].contents;
  const gzipped = gzipSync(code, { level: 9 }).length;
  const status = gzipped <= BUDGET_BYTES ? 'ok' : 'OVER BUDGET';
  if (gzipped > BUDGET_BYTES) failed = true;
  console.log(
    `${name.padEnd(18)} ${String(code.length).padStart(6)} B minified, ${String(gzipped).padStart(5)} B gzip  ${status}`,
  );
  if (!process.argv.includes('--size')) {
    mkdirSync('dist', { recursive: true });
    writeFileSync(`dist/${name}`, code);
  }
}
console.log(`budget: ${BUDGET_BYTES} B gzip`);
if (failed) process.exit(1);
