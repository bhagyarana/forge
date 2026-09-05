// packages/agents/explorer/src/auth.ts — 09 §2: authentication is deterministic
// first. FR-101, FR-102, FR-003.
import {
  authOutcome,
  detectLoginForm,
  rawAffordancesOf,
  type AccessibilitySnapshot,
} from "@forge/perception";
import type { BrowserDriver } from "./driver.js";

export type Credentials = { username: string; password: string };

export type AuthenticateResult = {
  authenticated: boolean;
  outcome:
    | "AUTHENTICATED"
    | "CREDENTIALS_REJECTED"
    | "NOTHING_HAPPENED"
    | "OUT_OF_SCOPE"
    | "NO_LOGIN_FORM_FOUND"
    | "NO_CREDENTIALS_SUPPLIED";
  /** The snapshot the login form was detected on — recorded even on failure (09 §2.2). */
  loginSnapshot: AccessibilitySnapshot | null;
  finalSnapshot: AccessibilitySnapshot | null;
};

const MIN_DETECTOR_CONFIDENCE = 0.6;

export function sameOrigin(a: string, b: string): boolean {
  try {
    return new URL(a).origin === new URL(b).origin;
  } catch {
    return true; // bare paths — never "off-origin" against themselves
  }
}

async function attempt(
  driver: BrowserDriver,
  before: AccessibilitySnapshot,
  identityRef: string,
  passwordRef: string,
  submitRef: string,
  credentials: Credentials,
): Promise<{ after: AccessibilitySnapshot | null; navigatedOffOrigin: boolean }> {
  const affordances = rawAffordancesOf(before);
  const identityAff = affordances.find((a) => a.ref === identityRef);
  const passwordAff = affordances.find((a) => a.ref === passwordRef);
  const submitAff = affordances.find((a) => a.ref === submitRef);
  if (!identityAff || !passwordAff || !submitAff) return { after: null, navigatedOffOrigin: false };

  await driver.exercise(identityAff, credentials.username);
  await driver.exercise(passwordAff, credentials.password);
  await driver.exercise(submitAff);

  const observed = await driver.observe();
  if (!observed.ok) return { after: null, navigatedOffOrigin: false };
  return {
    after: observed.data.snapshot,
    navigatedOffOrigin: !sameOrigin(before.url, observed.data.snapshot.url),
  };
}

/**
 * Runs the login flow once (with one retry on `NOTHING_HAPPENED` /
 * `CREDENTIALS_REJECTED`, 09 §2.2) and reports the structural verdict. Never throws —
 * an application with no login form, or no supplied credentials, is a smaller map,
 * not an error (09 §1).
 */
export async function authenticate(
  driver: BrowserDriver,
  before: AccessibilitySnapshot,
  credentials: Credentials | undefined,
): Promise<AuthenticateResult> {
  const form = detectLoginForm(before);

  if (!form || form.confidence < MIN_DETECTOR_CONFIDENCE) {
    return {
      authenticated: false,
      outcome: "NO_LOGIN_FORM_FOUND",
      loginSnapshot: null,
      finalSnapshot: before,
    };
  }
  if (!credentials) {
    return {
      authenticated: false,
      outcome: "NO_CREDENTIALS_SUPPLIED",
      loginSnapshot: before,
      finalSnapshot: before,
    };
  }

  for (let retry = 0; retry < 2; retry++) {
    const { after, navigatedOffOrigin } = await attempt(
      driver,
      before,
      form.identityRef,
      form.passwordRef,
      form.submitRef,
      credentials,
    );
    if (!after) break;
    const verdict = authOutcome(before, after, { navigatedOffOrigin });
    if (verdict.verdict !== "NOTHING_HAPPENED" && verdict.verdict !== "CREDENTIALS_REJECTED") {
      return {
        authenticated: verdict.verdict === "AUTHENTICATED",
        outcome: verdict.verdict,
        loginSnapshot: before,
        finalSnapshot: after,
      };
    }
    if (retry === 1) {
      return {
        authenticated: false,
        outcome: verdict.verdict,
        loginSnapshot: before,
        finalSnapshot: after,
      };
    }
    // one retry, per 09 §2.2's table, before giving up and continuing unauthenticated.
  }
  return {
    authenticated: false,
    outcome: "NOTHING_HAPPENED",
    loginSnapshot: before,
    finalSnapshot: before,
  };
}
