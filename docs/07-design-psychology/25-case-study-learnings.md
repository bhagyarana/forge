# 25 · Case Study Learnings

> **What this is.** growth.design's ~53 case studies, synthesized into eight recurring themes, each split into two questions: _what should FORGE look for when it critiques someone else's UI_ (feeds [28 · the check catalogue](28-design-psychology-critic.md)), and _what should FORGE's own product do_ (feeds [Phase 5 / Track B](../../TASKLIST.md), FORGE's own dashboard and reports).
> **What this is not.** Not a rehash of each case study individually — the theme is the reusable unit, the individual case study is the citation. `docs/deferred/design-intelligence.md`'s warning applies here too: the goal is a small number of load-bearing lessons, not a wall of trivia.
> **Source.** [growth.design/case-studies](https://growth.design/case-studies).

---

## 1. Onboarding & the aha-moment

**Case studies:** Too Good to Go, Grammarly Onboarding, Blinkist Onboarding, Headspace Onboarding, HEY Email Onboarding, Trello Onboarding, Letterboxd, 5 Deadly Onboarding Mistakes.

**The recurring lesson:** the job of onboarding is to get a new user to their _aha moment_ — the first instant the product's value is undeniable — as fast as possible, and every screen between sign-up and that moment is a screen where the user might leave. The best examples (Headspace, Blinkist) use a **Jobs-to-be-Done** framing: ask what the user is trying to accomplish before asking anything about the product. The worst pattern (the "5 deadly mistakes" piece) is front-loading configuration, surveys, or empty states before any value is shown.

- **Look for, when critiquing a target site:** how many steps/screens separate the entry point from the first screen that demonstrates real value? Is there a setup wall (forced tutorial, empty dashboard, unavoidable survey) before that? → feeds `PSY`/`LOGIC` checks on entry-to-value path length (§24 `#47`).
- **FORGE's own product should:** the Start screen (`18-ui-spec.md` §4.1) already gets this right by design — one field, one button, no configuration. The lesson to _keep_ protecting: never let the optional drawer's fields creep into the default view, and never require a completed run before the dashboard shows something meaningful (the empty/loading states in §18 §6 already cover this — this theme is the reason those states matter).

## 2. Checkout & conversion friction

**Case studies:** Audible, Amazon Purchase, GoDaddy Checkout, Adobe Trial UX, Beehiiv Newsletter, Sniper Links, Zapier Upgrade, Mine Trial.

**The recurring lesson:** most checkout/upgrade friction is not a missing feature, it's an **unnecessary decision or an unclear consequence** inserted right before commitment — surprise fees revealed late, ambiguous plan differences, a required field that isn't actually required. The fix pattern across these studies is consistently the same: surface the true cost/consequence _before_ the commit action, not after.

- **Look for:** does a form or purchase flow reveal new requirements, costs, or consequences only _after_ the user has already invested effort (typed a form, clicked "next")? → this is exactly `DC-08`'s error-adjacency check generalized, and a `LOGIC-xx` candidate: an assertion/requirement that appears late in a flow but could have been surfaced at step 1.
- **FORGE's own product should:** the report's "residual gaps" vs. "accepted risk" separation (`14-quality-report-and-score.md`, `18-ui-spec.md` §4.5.6) already applies this principle to FORGE itself — never let a user discover a limitation only by reading fine print at the end. Keep that separation whenever the Delight Score's methodology has caveats.

## 3. Ethical scarcity & urgency

**Case studies:** Scarcity Principle, Uber Eats Scarcity, McDonald's Self-Serve Kiosks.

**The recurring lesson:** scarcity/urgency cues (low-stock warnings, countdowns) increase conversion _and_ erode trust the moment they're caught being fake. growth.design's own framework for "ethical scarcity" requires three things to be true simultaneously: the constraint is **real**, it is **relevant** to the user's actual decision, and it is **verifiable** (the user could, in principle, check it).

- **Look for:** a scarcity/urgency claim (countdown, "only N left", "X people viewing this") with no supporting data anywhere reachable in the crawl (no inventory count elsewhere, no explanation of the timer). → a direct `CLR-C` copywriting/ethics check, cross-referencing §24 `#31`.
- **FORGE's own product should:** never use fabricated urgency anywhere in its own UI (it doesn't today — worth stating as a design law alongside `18-ui-spec.md`'s existing "we never let the UI imply reasoning that did not happen" rule, since it's the same honesty principle applied to marketing instead of AI claims).

## 4. Retention & habit formation

**Case studies:** Duolingo Retention, Clubhouse Retention, Spotify Wrapped, TikTok Feed, Temu Onboarding.

**The recurring lesson:** the products that retain best make **progress visible and resumable** (streaks, wrapped-style recaps, saved state) rather than relying purely on content quality. The darker pattern (TikTok, Temu) pairs the same mechanism — variable reward, infinite low-friction continuation — with an explicit design choice to _remove_ natural stopping points.

- **Look for:** a multi-session workflow with no visible saved progress, forcing the user to restart from zero on return — a `LOGIC`/`PSY-06` (Zeigarnik/goal-gradient) flag.
- **FORGE's own product should:** the "Recent runs" list on the Start screen (`18-ui-spec.md` §4.1) already does this — a finished session is resumable/replayable, not thrown away. The lesson to actively _avoid_: never adopt the infinite-scroll/no-stopping-point pattern anywhere in FORGE's own UI — a QA report should have a clear, respectable end, not an engagement loop. This is a deliberate contrast with the retention case studies, not an imitation of them.

## 5. Offboarding & graceful exit

**Case studies:** Adobe Offboarding (most popular), Typeform Offboarding, Shortform Offboarding, Signal Monetization.

**The recurring lesson:** how a product handles someone _leaving_ is remembered longer than most of what happened while they stayed (Peak-End Rule, §24 `#91`). The best offboarding flows ask why, offer a real alternative (pause, downgrade) without dark-patterning the cancel button, and close with dignity rather than guilt.

- **Look for:** is there a genuine, single-click way to cancel/leave/undo, or is the exit path obstructed relative to the entry path (more steps, hidden link, guilt-copy)? A `CLR-C`/ethics check comparing entry-path length to exit-path length for the same commitment.
- **FORGE's own product should:** apply Peak-End deliberately to the **Report** screen (`18-ui-spec.md` §4.5) — it is the last thing a user sees in a session, so its closing framing (the score, the one-sentence summary) carries disproportionate weight in how the whole run is remembered. This is the direct justification for Phase 5's "Peak-End-aligned closing moment" on the report.

## 6. Notifications & re-engagement

**Case studies:** LinkedIn Notifications (500% opt-in lift), Apple Sleep Notification, Amber Alert Redesign, Balance Advertising.

**The recurring lesson:** the difference between a notification that gets acted on and one that gets dismissed is almost entirely in the **framing at the moment of the ask**, not the content of the notification itself — LinkedIn's 500% lift came from explaining _why_ before asking permission, not from a better notification.

- **Look for:** a permission/consent prompt (in a crawled flow, this shows up as a native browser-permission trigger or an in-app opt-in) fired with no preceding explanation of its purpose — a `CLR-C` copy-sequencing check.
- **FORGE's own product should:** not directly applicable (FORGE requests no permissions of its own user), but the framing lesson generalizes to the deterministic-mode banner (`18-ui-spec.md` §4.1) — explaining _why_ capability is reduced, not just _that_ it is, is the same move.

## 7. Monetization & paywalls

**Case studies:** Tinder Monetization, Instagram Monetization, Blinkist Trial Paywall, Strava Premium.

**The recurring lesson:** conversion-optimized paywalls that ignore the underlying psychology (Strava Premium) underperform ones that don't — the strongest results (Blinkist's 23% lift) came from timing the paywall at the moment the free value was _already proven_, not from harder-sell copy.

- **Look for:** a paywall/upgrade prompt that interrupts _before_ any value has been demonstrated in the crawled session — a `LOGIC`/`PSY` entry-to-value-path check, same family as theme 1.
- **FORGE's own product should:** not applicable — FORGE has no paywall in its own UI. No action.

## 8. Dark-pattern avoidance & design ethics

**Case studies:** Apple vs. Meta Threads Privacy ("illusion of privacy"), Design Blunders, Product Team Pitfalls, Net Promoter Score limitations.

**The recurring lesson:** the most damaging UX mistakes are rarely subtle — they are cases where the interface's stated behaviour and its actual behaviour diverge (a "private" toggle that doesn't fully stop data collection), or where a metric (NPS) is trusted well past what it can actually measure.

- **Look for:** exactly the class of thing FORGE's existing `CONTENT_DRIFT` diagnosis and the deferred `DC-02` accessible-name-fidelity check already catch structurally — a stated label/promise and an observed behaviour that don't match. This theme is the strongest argument that the new `LOGIC-xx` checks (§28) belong in the same evidence-layer discipline as the rest of FORGE: **never originate a finding from tone or inference, only from a provable mismatch between what the UI claims and what the crawl observed.**
- **FORGE's own product should:** hold itself to the identical standard — every claim the dashboard makes (a score, a "healed" badge, a "deterministic" label) must be checkable against stored evidence, which `18-ui-spec.md`'s Principle 2 ("evidence is one click away, always") already guarantees. This theme is the reason that principle is right, not just a style choice.
