import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const serverDir = fileURLToPath(new URL('../../src/server/', import.meta.url));

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? sources(path) : path.endsWith('.ts') ? [path] : [];
  });
}

describe('SQL conventions', () => {
  // PGlite accepts `$1::jsonb` with a string, but postgres.js double-encodes it; tests would not notice.
  it('casts JSON parameters through text', () => {
    const offenders = sources(serverDir).flatMap((file) =>
      readFileSync(file, 'utf8')
        .split('\n')
        .filter((line) => /\$\d+::jsonb/.test(line))
        .map((line) => `${file}: ${line.trim()}`),
    );
    expect(offenders).toEqual([]);
  });
});
