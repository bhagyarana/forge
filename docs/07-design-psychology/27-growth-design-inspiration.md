# 27 · Growth.Design Inspiration

> **What this is.** Not the _content_ of growth.design (that's [24](24-psychology-cheatsheet.md), [25](25-case-study-learnings.md), [26](26-clear-framework.md)) — this is what growth.design's own site, as a _product_, does well, and what of that is worth borrowing for FORGE's own customer journey. The brief explicitly asked for this as its own document: "take inspiration from growth.design itself."
> **What this is not.** Not a mandate to copy growth.design's visual style. `18-ui-spec.md` already made deliberate, well-reasoned choices (light theme, no charts, no component library, projector-legible) that this document must work _within_, not around. Every idea below is filtered through that constraint before it reaches [Phase 5](../../TASKLIST.md).
> **Source.** Direct observation of [growth.design](https://growth.design)'s case-study index, cheatsheet, and CLEAR course pages.

---

## 1. The case-study narrative structure

**What growth.design does:** every case study follows the same shape — a specific, named problem ("why does Grammarly's onboarding survey lose people?"), the psychology principle that explains it, the before/after evidence, and the concrete fix. The structure repeats so consistently across 50+ studies that a reader learns to scan it after the second one.

**Why it works:** this is the Storytelling Effect (§24 `#102`) and the Peak-End Rule (§24 `#91`) applied to _documentation_ — a finding embedded in a story is retained better than a finding embedded in a table, and a consistent structure means the reader's cognitive load drops with every repetition (they stop parsing structure and start absorbing content).

**FORGE feature this becomes:** the exact renderer shape specified in [Phase 4](../../TASKLIST.md) for the human-friendly design report: **Problem → Principle → Evidence → Why it matters → Suggested fix**, repeated identically for every finding. This is the direct analogue of `18-ui-spec.md`'s own `<VerdictCard>` principle ("one component, four verdicts, identical structure and identical position") — the same argument that made that card work is why this narrative shape should be equally rigid.

## 2. The cheatsheet as a quick-reference artifact

**What growth.design does:** the 106-principle cheatsheet is a single dense, scannable reference — not prose, a lookup table people bookmark and return to.

**Why it works:** it serves a different reading mode than the case studies (recall/reference vs. narrative/learning) — recognizing that these are two different jobs, and building one artifact for each, is itself the lesson.

**FORGE feature this becomes:** the design report should open with a compact **findings legend** — one line per triggered check, severity glyph, and a jump link to its full narrative entry below — before the narrative section. This mirrors the existing `18-ui-spec.md` §4.5 report structure (score first, detail after) and gives a judge/reader two ways to consume the same report depending on whether they want a scan or a story.

## 3. Bite-sized lesson cards and editorial typography

**What growth.design does:** long-form content is broken into short, single-idea sections with generous whitespace and a restrained type system (this is CLEAR's own Layout and Copywriting lessons, applied reflexively to growth.design's own site).

**Why it works:** it is a working demonstration of `26-clear-framework.md` §L's whitespace/cognitive-load argument — the site practices what it teaches.

**FORGE feature this becomes:** nothing structurally new — `18-ui-spec.md`'s type scale and grid discipline already do this. The actionable takeaway for [Phase 5](../../TASKLIST.md) is narrower: audit `packages/cli/src/commands/ui.ts`'s report section (`#report`) against this same single-idea-per-block discipline, since it currently renders several distinct facts (score, components, heals, gaps) with less visual separation than the dashboard's own `.card` timeline gives individual events.

## 4. Social proof via "Most Popular" badges

**What growth.design does:** several case studies (Adobe Offboarding, Brave Browser, Clubhouse, TikTok, Tinder) carry a visible "Most Popular" badge in the index.

**Why it works:** Social Proof (§24 `#30`) and the Bandwagon Effect (§24 `#85`) — a badge cheaply signals "other readers found this worth their time," reducing the reader's own decision cost (Hick's Law, §24 `#1`) when scanning 53 entries.

**FORGE feature this becomes:** **not directly applicable** — FORGE's dashboard shows one session's data, and `18-ui-spec.md` §11 already explicitly rejects analytics/charts on the argument that "one session is one data point. A chart of one point is a lie." Manufacturing a popularity signal FORGE doesn't actually have would violate the exact honesty principle (§18 Principle 2 & 4) this whole product is built on. Logged here specifically to record _why_ it was considered and rejected, not silently skipped.

## 5. The interactive quiz / recognition format

**What growth.design does:** the "Shortform Offboarding" piece is framed as an interactive quiz teaching pattern recognition — "spot the principle" — rather than a lecture.

**Why it works:** Recognition-over-Recall (§24 `#101`) again, this time applied to _teaching_ rather than to a form field — asking a reader to recognize a principle they already half-know is lower-friction than asking them to recall one cold.

**FORGE feature this becomes:** a stretch idea, explicitly **not** in the [Phase 0–5] scope of this plan — a future "explain this finding" affordance where a finding's evidence chip, when opened, first asks "which principle do you think this violates?" before revealing the answer. Recorded here as a flip-trigger-style note for a later pass, not committed work.

## 6. Progress and completion framing

**What growth.design does:** the CLEAR course ends in a certificate and a scored exam — completion is marked, not just implied by finishing the last page.

**Why it works:** Goal-Gradient Effect and Peak-End (§24 `#51`, `#91`) — an explicit, named "you're done, here's what you accomplished" moment is remembered better than a page that simply stops.

**FORGE feature this becomes:** direct justification for [Phase 5](../../TASKLIST.md)'s "Peak-End-aligned closing moment" on FORGE's own report screen — a session that finishes should say so plainly (score, one-sentence summary, what changed since the last run if any), the same way `18-ui-spec.md` §4.5 already opens the Report screen with the score at display size. The addition is a closing line, not a new mechanic — consistent with §18 §11's rejection of gamification-style additions (streaks, badges, points) that would be a mismatch for a QA tool's tone.

---

## Summary table — adopted vs. rejected

| Pattern                                                               | Adopted for FORGE?                                            | Where                           |
| --------------------------------------------------------------------- | ------------------------------------------------------------- | ------------------------------- |
| Case-study narrative structure (Problem → Principle → Evidence → Fix) | **Yes**                                                       | Phase 4, design report          |
| Cheatsheet-style findings legend                                      | **Yes**                                                       | Phase 4, design report header   |
| Single-idea-per-block editorial density                               | **Yes, as an audit**                                          | Phase 5, `ui.ts` report section |
| "Most Popular" social-proof badges                                    | **No** — contradicts §18's one-session-is-one-data-point rule | —                               |
| Interactive quiz/recognition teaching format                          | **Deferred** — recorded as a future idea only                 | —                               |
| Explicit completion/closure framing                                   | **Yes, minimally**                                            | Phase 5, report closing line    |
