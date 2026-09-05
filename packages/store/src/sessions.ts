// packages/store/src/sessions.ts — the sessions table (05 §4). `input_json` never
// carries a password: callers pass `Session["input"]` (already `.omit({password:true})`
// at the schema level — FR-006, I-16), and `createSession` never accepts a raw password.
import type { Clock, IdGen, Session, SessionInput, SessionStatus } from "@forge/core";
import type { Db } from "./db.js";

type SessionRow = {
  id: string;
  url: string;
  mode: string;
  status: SessionStatus;
  authenticated: number;
  storage_state_path: string | null;
  exit_code: number | null;
  defects_found: number;
  input_json: string;
  usage_json: string | null;
  created_at: string;
  finished_at: string | null;
};

function rowToSession(row: SessionRow): Session {
  return {
    id: row.id,
    input: JSON.parse(row.input_json) as Session["input"],
    status: row.status,
    authenticated: Boolean(row.authenticated),
    storageStatePath: row.storage_state_path,
    exitCode: row.exit_code,
    defectsFound: row.defects_found,
    createdAt: row.created_at,
    finishedAt: row.finished_at,
    usage: row.usage_json ? (JSON.parse(row.usage_json) as Session["usage"]) : null,
  };
}

export function createSession(
  db: Db,
  ctx: { clock: Clock; idGen: IdGen },
  input: Omit<SessionInput, "password">,
): Session {
  const id = ctx.idGen.next("ses");
  const createdAt = ctx.clock.now().toISOString();
  db.prepare(
    `INSERT INTO sessions (id, url, mode, status, authenticated, storage_state_path, exit_code, defects_found, input_json, usage_json, created_at, finished_at)
     VALUES (@id, @url, @mode, 'CREATED', 0, NULL, NULL, 0, @inputJson, NULL, @createdAt, NULL)`,
  ).run({
    id,
    url: input.url,
    mode: input.mode,
    inputJson: JSON.stringify(input),
    createdAt,
  });
  return getSession(db, id) as Session;
}

export function getSession(db: Db, id: string): Session | null {
  const row = db.prepare("SELECT * FROM sessions WHERE id = ?").get(id) as SessionRow | undefined;
  return row ? rowToSession(row) : null;
}

export function listSessions(db: Db): Session[] {
  const rows = db.prepare("SELECT * FROM sessions ORDER BY created_at DESC").all() as SessionRow[];
  return rows.map(rowToSession);
}

export function updateSessionStatus(
  db: Db,
  id: string,
  status: SessionStatus,
  patch: Partial<{
    authenticated: boolean;
    storageStatePath: string | null;
    exitCode: number | null;
    defectsFound: number;
    finishedAt: string | null;
  }> = {},
): Session {
  const current = getSession(db, id);
  if (!current) throw new Error(`no such session: ${id}`);
  db.prepare(
    `UPDATE sessions SET status = @status,
       authenticated = @authenticated,
       storage_state_path = @storageStatePath,
       exit_code = @exitCode,
       defects_found = @defectsFound,
       finished_at = @finishedAt
     WHERE id = @id`,
  ).run({
    id,
    status,
    authenticated: (patch.authenticated ?? current.authenticated) ? 1 : 0,
    storageStatePath:
      patch.storageStatePath !== undefined ? patch.storageStatePath : current.storageStatePath,
    exitCode: patch.exitCode !== undefined ? patch.exitCode : current.exitCode,
    defectsFound: patch.defectsFound ?? current.defectsFound,
    finishedAt: patch.finishedAt !== undefined ? patch.finishedAt : current.finishedAt,
  });
  return getSession(db, id) as Session;
}
