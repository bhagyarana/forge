# ADR-018 · The Design & Psychology Critic pillar is reinstated

|                |                                                                                                                    |
| -------------- | ------------------------------------------------------------------------------------------------------------------ |
| **Status**     | Accepted                                                                                                           |
| **Decided**    | 5 Sep 2026                                                                                                         |
| **Deciders**   | User + build agent                                                                                                 |
| **Supersedes** | Reinstates [ADR-013](ADR-013-design-intelligence-deferred.md)                                                      |
| **Governs**    | [docs/07-design-psychology/28-design-psychology-critic.md](../07-design-psychology/28-design-psychology-critic.md) |

---

## 1. Context

[ADR-013](ADR-013-design-intelligence-deferred.md) deferred the original "Design Intelligence" pillar (`DC-01`…`DC-10`) for one reason: a hackathon rubric that scored it zero, under an 8-hour clock where every hour had a higher-leverage home. It named its own flip triggers explicitly:

> _"We ship this beyond the hackathon. Then the pillar returns in full."_

FORGE is now being extended beyond that hackathon scope, and the user has asked for exactly this pillar back — reinstated and substantially extended with real design-psychology research (growth.design's 106-principle cheatsheet, its case studies, and its CLEAR framework), applied both to the sites FORGE tests and to FORGE's own UI. The flip trigger is satisfied.

## 2. Decision

Reinstate the pillar as a new, additive stage: the **Design & Psychology Critic**. It is deliberately **not** merged into the existing Coverage Critic (`packages/core/critic`) — that Critic gates the re-plan loop (`PASS`/`REPLAN`/`ACCEPT_RISK`); this one never gates anything. It only ever adds information to the report, matching the deferred spec's own separation of `design_findings` from `runs.status`.

What's kept from the deferred spec:

- The evidence-layer discipline: **structural and semantic and geometric evidence originate a finding; a screenshot only corroborates.** No finding in this pass is minted from a screenshot alone.
- `DC-03` (heading hierarchy), `DC-04` (above-the-fold CTA), `DC-06` (WCAG AA contrast) — implemented in this pass, verbatim in spirit.
- The severity → outcome table (`BLOCKER`/`MAJOR`/`MINOR`/`INFO`), reused unchanged.

What's new, from the growth.design research in `docs/07-design-psychology/`:

- `PSY-xx` checks — Fitts's Law target size, Miller's Law list length.
- `CLR-xx` checks — vague CTA copy, competing primary actions, missing form labels — one per CLEAR letter, drawn from [26-clear-framework.md](../07-design-psychology/26-clear-framework.md).
- `LOGIC-xx` checks — dead-end states and orphaned destructive affordances, computed entirely from data FORGE's Explorer already produces (`CapabilityMap`, `Affordance[]`), no new capture needed.
- A **Delight Score** (0–100, five CLEAR-weighted components) alongside the existing Robustness Score — same "recomputable by hand" transparency principle as `robustnessScore()`.
- A human-friendly, narrative report format (Problem → Principle → Evidence → Why it matters → Suggested fix per finding), inspired by growth.design's own case-study structure ([27-growth-design-inspiration.md](../07-design-psychology/27-growth-design-inspiration.md)).
- Live screenshot capture during exploration, so a human watching `forge ui` can see the pages FORGE is testing as it tests them — not just a text timeline.

## 3. What is deliberately not built in this pass

Named honestly, same discipline as `docs/deferred/design-intelligence.md`'s own "Deliberate limitations" table:

| Not built                                               | Why                                                                                                                                                                           |
| ------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DC-01`/`DC-02`/`DC-05`/`DC-07`/`DC-08`/`DC-09`/`DC-10` | Real checks, deferred to a later pass — this pass ships ten checks end-to-end rather than seventeen half-built ones                                                           |
| Masked pixel diff against a reference screenshot        | No reference contract exists yet; screenshots in this pass are for human viewing and evidence, not automated diffing                                                          |
| A `Reward` (CLEAR "R") check                            | Needs before/after interaction observation, not a single static snapshot — the Delight Score's `reward` component is a documented placeholder (100) until that capture exists |
| Findings gating the pipeline                            | By design, permanent — see §2                                                                                                                                                 |

## 4. Consequences

- New, additive capture in `packages/perception/src/design-snapshot.ts` — a browser-touching, untested-by-design module (same convention as `snapshot.ts`), never invoked by the existing Explorer/Planner/Critic path.
- New pure engine `packages/core/design-critic` and renderer `packages/core/design-report`, following the exact shape of `core/critic`/`core/report` and respecting the `core-is-pure` dependency-cruiser rule (no import of `@forge/perception` from `@forge/core` — the shared shape is structurally typed, not imported).
- `packages/agents/explorer/src/playwright-driver.ts` gains an optional screen-capture callback, off by default, so every existing call site is unaffected.
- `forge demo` and `forge ui` both surface the new pillar; neither the functional pipeline's exit code nor its pass/fail outcome changes because of anything this pillar finds.
