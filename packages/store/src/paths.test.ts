// packages/store/src/paths.test.ts — I-9: writes stay inside the allowlist; traversal
// escapes are rejected.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { UnsafeWriteError, safeWrite } from "./paths.js";

describe("safeWrite — I-9", () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "forge-safewrite-"));
  });
  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it("writes inside the root, creating intermediate directories", () => {
    const bytes = safeWrite(root, "evidence/ab/cdef.json", '{"ok":true}');
    expect(bytes).toBeGreaterThan(0);
    expect(existsSync(join(root, "evidence", "ab", "cdef.json"))).toBe(true);
    expect(readFileSync(join(root, "evidence", "ab", "cdef.json"), "utf8")).toBe('{"ok":true}');
  });

  it("rejects a simple traversal escape", () => {
    expect(() => safeWrite(root, "../escaped.txt", "nope")).toThrow(UnsafeWriteError);
  });

  it("rejects a traversal escape buried inside a longer relative path", () => {
    expect(() => safeWrite(root, "evidence/../../escaped.txt", "nope")).toThrow(UnsafeWriteError);
  });

  it("rejects an absolute path override", () => {
    const absolute = join(tmpdir(), "forge-absolute-escape.txt");
    expect(() => safeWrite(root, absolute, "nope")).toThrow(UnsafeWriteError);
  });

  it("rejects writing the root itself", () => {
    expect(() => safeWrite(root, ".", "nope")).toThrow(UnsafeWriteError);
  });

  it("allows a relative path that merely mentions '..' inside a segment name", () => {
    // "..foo" is a valid single path segment, not a traversal — only a literal ".."
    // segment must be rejected.
    const bytes = safeWrite(root, "evidence/..foo/file.txt", "ok");
    expect(bytes).toBeGreaterThan(0);
  });
});
