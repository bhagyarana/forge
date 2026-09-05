// packages/store/src/evidence.ts — I-2: an evidence path always contains its own sha256
// prefix, and putEvidence() compares the FULL hash on a prefix hit — never the
// filesystem fan-out prefix alone. I-8 (store half): resolveEvidence() always resolves
// a stored id.
import { createHash } from "node:crypto";
import type { Clock, Evidence, EvidenceType, IdGen } from "@forge/core";
import type { Db } from "./db.js";
import { safeWrite } from "./paths.js";

export function sha256Hex(content: string | Buffer): string {
  return createHash("sha256").update(content).digest("hex");
}

/**
 * Fan out by the first two hex chars, git-object style — a filesystem convenience
 * only. Identity is always the full hash; nothing may treat this prefix as identity.
 */
export function evidencePath(sha256: string, extension: string): string {
  return `evidence/${sha256.slice(0, 2)}/${sha256}.${extension}`;
}

export type PutEvidenceInput = {
  sessionId: string;
  lapId?: string | null;
  runId?: string | null;
  stepId?: string | null;
  type: EvidenceType;
  content: string | Buffer;
  label: string;
  metadata?: Record<string, unknown>;
  extension?: string;
};

type EvidenceRow = {
  id: string;
  session_id: string;
  lap_id: string | null;
  run_id: string | null;
  step_id: string | null;
  type: EvidenceType;
  path: string;
  sha256: string;
  bytes: number;
  captured_at: string;
  label: string;
  metadata_json: string;
};

function rowToEvidence(row: EvidenceRow): Evidence {
  return {
    id: row.id,
    sessionId: row.session_id,
    lapId: row.lap_id,
    runId: row.run_id,
    stepId: row.step_id,
    type: row.type,
    path: row.path,
    sha256: row.sha256,
    bytes: row.bytes,
    capturedAt: row.captured_at,
    label: row.label,
    metadata: JSON.parse(row.metadata_json) as Record<string, unknown>,
  };
}

export function putEvidence(
  db: Db,
  ctx: { clock: Clock; idGen: IdGen },
  artifactsRoot: string,
  input: PutEvidenceInput,
): Evidence {
  const sha256 = sha256Hex(input.content);

  // I-2: only a FULL hash match is a real hit. `sha256 = ?` is an exact-value
  // comparison — the directory fan-out prefix in the path is never consulted here.
  const existing = db
    .prepare("SELECT * FROM evidence WHERE session_id = ? AND sha256 = ? AND type = ?")
    .get(input.sessionId, sha256, input.type) as EvidenceRow | undefined;
  if (existing) return rowToEvidence(existing);

  const extension = input.extension ?? "bin";
  const path = evidencePath(sha256, extension);
  const bytes = safeWrite(artifactsRoot, path, input.content);

  const id = ctx.idGen.next("ev");
  const capturedAt = ctx.clock.now().toISOString();
  const metadata = input.metadata ?? {};

  db.prepare(
    `INSERT INTO evidence
       (id, session_id, lap_id, run_id, step_id, type, path, sha256, bytes, label, metadata_json, captured_at)
     VALUES (@id, @sessionId, @lapId, @runId, @stepId, @type, @path, @sha256, @bytes, @label, @metadataJson, @capturedAt)`,
  ).run({
    id,
    sessionId: input.sessionId,
    lapId: input.lapId ?? null,
    runId: input.runId ?? null,
    stepId: input.stepId ?? null,
    type: input.type,
    path,
    sha256,
    bytes,
    label: input.label,
    metadataJson: JSON.stringify(metadata),
    capturedAt,
  });

  return {
    id,
    sessionId: input.sessionId,
    lapId: input.lapId ?? null,
    runId: input.runId ?? null,
    stepId: input.stepId ?? null,
    type: input.type,
    path,
    sha256,
    bytes,
    capturedAt,
    label: input.label,
    metadata,
  };
}

/** I-8 (store half): every evidenceId cited elsewhere must resolve through here. */
export function resolveEvidence(db: Db, id: string): Evidence | null {
  const row = db.prepare("SELECT * FROM evidence WHERE id = ?").get(id) as EvidenceRow | undefined;
  return row ? rowToEvidence(row) : null;
}
