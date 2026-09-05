// packages/perception/src/denylist.ts — 08 §4.1: the destructive deny-list.
// FR-106, NFR-6, I-20. Deliberately broader than veto V2 (13 §6) — see 08 §4.1's
// note: this list also blocks `pay`, `transfer` and `place order`, which are
// legitimate for a generated test to *do* but never acceptable for a crawler to
// press uninvited. Unit-tested here; V2's list is a separate constant in
// packages/core/healing and must never be merged with this one.
export const DESTRUCTIVE = new RegExp(
  "\\b(delete|remove|cancel|void|refund|discard|revoke|terminate|" +
    "destroy|clear|reset|deactivate|unsubscribe|pay|transfer|" +
    "submit order|place order|close account)\\b",
  "i",
);

export function isDestructive(accessibleName: string | null): boolean {
  if (!accessibleName) return false;
  return DESTRUCTIVE.test(accessibleName);
}
