// packages/store/src/paths.ts — I-9: writes stay inside the allowlist; traversal is rejected.
import { dirname, isAbsolute, join, normalize, relative } from "node:path";
import { mkdirSync, writeFileSync } from "node:fs";

export class UnsafeWriteError extends Error {}

/**
 * Writes `content` to `<root>/<relativePath>`, refusing anything that would resolve
 * outside `root` — a `..` traversal or an absolute override. Returns bytes written.
 */
export function safeWrite(root: string, relativePath: string, content: string | Buffer): number {
  const resolvedRoot = normalize(root);
  const target = normalize(join(resolvedRoot, relativePath));
  const rel = relative(resolvedRoot, target);

  if (rel === "" || rel.startsWith("..") || isAbsolute(rel)) {
    throw new UnsafeWriteError(`refusing to write outside ${resolvedRoot}: ${relativePath}`);
  }

  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, content);
  return Buffer.byteLength(content);
}
