// packages/store/src/events.ts — I-1: session_events is append-only, seq is gapless per session.
import type { Clock } from "@forge/core";
import type { SessionEvent, SessionEventType } from "@forge/core";
import type { Db } from "./db.js";

export type AppendEventInput = {
  sessionId: string;
  lapId: string | null;
  actor: SessionEvent["actor"];
  type: SessionEventType;
  payload: Record<string, unknown>;
};

/**
 * Appends one event with the next gapless `seq` for this session, inside a single
 * transaction so two concurrent appends can never observe or assign the same seq.
 */
export function appendEvent(db: Db, clock: Clock, input: AppendEventInput): SessionEvent {
  const insert = db.transaction((): SessionEvent => {
    const row = db
      .prepare("SELECT COALESCE(MAX(seq), -1) AS maxSeq FROM session_events WHERE session_id = ?")
      .get(input.sessionId) as { maxSeq: number };
    const seq = row.maxSeq + 1;
    const at = clock.now().toISOString();
    const payloadJson = JSON.stringify(input.payload);

    db.prepare(
      `INSERT INTO session_events (session_id, seq, lap_id, at, actor, type, payload_json)
       VALUES (@sessionId, @seq, @lapId, @at, @actor, @type, @payloadJson)`,
    ).run({
      sessionId: input.sessionId,
      seq,
      lapId: input.lapId,
      at,
      actor: input.actor,
      type: input.type,
      payloadJson,
    });

    return {
      seq,
      sessionId: input.sessionId,
      lapId: input.lapId,
      at,
      actor: input.actor,
      type: input.type,
      payload: input.payload,
    };
  });
  return insert();
}

type EventRow = {
  session_id: string;
  seq: number;
  lap_id: string | null;
  at: string;
  actor: SessionEvent["actor"];
  type: SessionEventType;
  payload_json: string;
};

function rowToEvent(row: EventRow): SessionEvent {
  return {
    seq: row.seq,
    sessionId: row.session_id,
    lapId: row.lap_id,
    at: row.at,
    actor: row.actor,
    type: row.type,
    payload: JSON.parse(row.payload_json) as Record<string, unknown>,
  };
}

export function listEvents(db: Db, sessionId: string, since = -1, limit = 200): SessionEvent[] {
  const rows = db
    .prepare(
      "SELECT * FROM session_events WHERE session_id = ? AND seq > ? ORDER BY seq ASC LIMIT ?",
    )
    .all(sessionId, since, limit) as EventRow[];
  return rows.map(rowToEvent);
}

export function getEvent(db: Db, sessionId: string, seq: number): SessionEvent | null {
  const row = db
    .prepare("SELECT * FROM session_events WHERE session_id = ? AND seq = ?")
    .get(sessionId, seq) as EventRow | undefined;
  return row ? rowToEvent(row) : null;
}
