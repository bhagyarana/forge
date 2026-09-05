# 28 · Design & Psychology Critic

> **What this is.** The check catalogue this pass implements — ten checks, chosen because each is mechanically provable from a single crawl with no model call, per [ADR-018](../decisions/ADR-018-design-psychology-critic-reinstated.md). Each row below cites the exact function that implements it in `packages/core/design-critic/index.ts`.
> **What this is not.** Not the full catalogue [24](24-psychology-cheatsheet.md)/[26](26-clear-framework.md) describe — see ADR-018 §3 for what's deliberately not built yet.
> **Evidence discipline.** Every check below reads structural facts (role, accessible name, computed style, bounding box) captured once per screen. None reads a screenshot to decide anything — screenshots are attached to a finding as evidence, never as the source of the finding itself.

---

## The `Finding` shape

```ts
type Finding = {
  id: string;
  checkId: string; // "DC-06", "PSY-01", "CLR-C1", "LOGIC-02", ...
  category: "copywriting" | "layout" | "emphasis" | "accessibility" | "reward" | "logic";
  severity: "BLOCKER" | "MAJOR" | "MINOR" | "INFO";
  principle: string; // human name, e.g. "Fitts's Law"
  screen: string; // the URL the finding was observed on
  element: string; // accessible name / role, for a human to locate it
  evidence: {
    bounds?: BBox;
    style?: { fontSize: number; color: string; backgroundColor: string };
    note?: string;
  };
  whyItMatters: string; // ≤2 plain-language sentences
  suggestedFix: string;
};
```

## The catalogue

| Check                                      | Category      | Severity                              | Reads                                                                                                  | Fails when                                                                                                                                                                                             |
| ------------------------------------------ | ------------- | ------------------------------------- | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `DC-03` heading hierarchy                  | accessibility | MAJOR                                 | heading levels, in DOM order                                                                           | zero or 2+ level-1 headings, or a level is skipped (e.g. `h2 → h4`)                                                                                                                                    |
| `DC-04` above-the-fold CTA                 | emphasis      | MAJOR (keyword match) / MINOR (other) | bounding box vs. viewport height                                                                       | a button/link's accessible name matches a primary-action keyword (submit, continue, checkout, pay, confirm, sign in, log in, add to cart, place order) and its box lies fully or partly below the fold |
| `DC-06` WCAG AA contrast                   | accessibility | MAJOR                                 | resolved text color vs. resolved background color, font size, font weight                              | contrast ratio < 4.5:1 (normal text) or < 3:1 (≥18.66px, or ≥14px and bold)                                                                                                                            |
| `PSY-01` Fitts's Law target size           | layout        | MINOR                                 | bounding box of interactive roles                                                                      | width or height < 44px (WCAG 2.5.5's own minimum)                                                                                                                                                      |
| `PSY-05` Miller's Law list length          | layout        | MINOR                                 | count of elements sharing one `nav`/`ul`/`ol`/`menu` parent                                            | more than 9 items in one unbroken list/menu                                                                                                                                                            |
| `CLR-C1` vague CTA copy                    | copywriting   | MINOR                                 | accessible name of button-role elements                                                                | the name, normalised, exactly matches a generic-verb list ("submit", "ok", "click here", "learn more", "button")                                                                                       |
| `CLR-E1` competing primary actions         | emphasis      | MAJOR                                 | style signature (color + background + font-size + font-weight) of all button-role elements on a screen | 2 or more buttons exist and **all** share one identical style signature — no visual hierarchy at all                                                                                                   |
| `CLR-A3` missing form label                | accessibility | MAJOR                                 | programmatic label association for textbox/checkbox/radio/combobox roles                               | no `<label for>`, no `aria-label`/`aria-labelledby`, and no wrapping `<label>`                                                                                                                         |
| `LOGIC-01` possible dead end               | logic         | INFO                                  | `CapabilityMap.transitions` vs. a state's own recorded affordances                                     | a state has interactive affordances but the crawl recorded zero outbound transitions from it — worded as a hedge, not a claim, since a bounded crawl cannot prove absence                              |
| `LOGIC-02` orphaned destructive affordance | logic         | INFO                                  | `Affordance.destructive` (already computed by the deny-list, `packages/perception/src/denylist.ts`)    | any destructive affordance exists — FORGE never exercises it by design, so it is surfaced for a human to verify by hand                                                                                |

## The Delight Score

Five components, one per CLEAR letter, each starting at 100 and reduced by the findings in its category (`BLOCKER` −40, `MAJOR` −20, `MINOR` −8, `INFO` −2, floored at 0). The overall score is the unweighted mean of the five — deliberately simple and recomputable by hand, matching `robustnessScore()`'s own transparency rule in `packages/core/report/index.ts`.

`reward` has no implemented check in this pass (ADR-018 §3) and is reported at a fixed 100 with an explicit footnote in the rendered report — never silently included as if it were measured.

## Screens, not states

Findings are keyed by **URL**, not by the Explorer's internal state id. A design snapshot is captured once per unique URL observed during the crawl (capped at the same `maxStates` budget `forge demo` already uses), because the audience for this report is a person deciding whether a _page_ looks right — the state-signature abstraction that lets FORGE deduplicate `/product/:sku` variants for coverage purposes is the wrong grain for a human reading "here's what's wrong with your checkout page."
