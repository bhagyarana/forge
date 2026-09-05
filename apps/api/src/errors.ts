// apps/api/src/errors.ts — 17 §8: the error catalogue. A broken target is never an
// HTTP error (17 §8.1) — these codes exist only for the API being wrong.
import type { FastifyReply } from "fastify";

export type ApiErrorCode =
  | "VALIDATION_FAILED"
  | "HOST_NOT_ALLOWED"
  | "NOT_FOUND"
  | "INVALID_STATE"
  | "MUTATION_CONFLICT"
  | "PAYLOAD_TOO_LARGE"
  | "TOO_MANY_SESSIONS"
  | "INTERNAL";

const STATUS_FOR: Record<ApiErrorCode, number> = {
  VALIDATION_FAILED: 400,
  HOST_NOT_ALLOWED: 400,
  NOT_FOUND: 404,
  INVALID_STATE: 409,
  MUTATION_CONFLICT: 409,
  PAYLOAD_TOO_LARGE: 413,
  TOO_MANY_SESSIONS: 429,
  INTERNAL: 500,
};

export type ApiErrorIssue = { path: Array<string | number>; code: string; message: string };

export function sendError(
  reply: FastifyReply,
  code: ApiErrorCode,
  message: string,
  issues?: ApiErrorIssue[],
): FastifyReply {
  return reply.code(STATUS_FOR[code]).send({
    error: {
      code,
      message,
      requestId: reply.request.id,
      ...(issues ? { issues } : {}),
    },
  });
}
