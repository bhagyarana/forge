# 26 · The CLEAR Framework

> **What this is.** growth.design's C.L.E.A.R. framework — Copywriting, Layout, Emphasis, Accessibility, Reward — turned into a checklist per letter. Each checklist item is written so it can become a `CLR-xx` check in [28 · the catalogue](28-design-psychology-critic.md): a yes/no or measurable fact, not a taste judgement.
> **What this is not.** Not a UI redesign of FORGE. This is the reference; [Phase 5 / Track B](../../TASKLIST.md) is where it gets applied to FORGE's own dashboard, and [28](28-design-psychology-critic.md) is where it gets applied to target sites.
> **Source.** [growth.design/courses/clear-ui](https://growth.design/courses/clear-ui) — the five-lesson C.L.E.A.R. Design Masterclass structure, cross-referenced against the psychology cheatsheet in [24](24-psychology-cheatsheet.md) where a letter's guidance overlaps a named principle.
> **The framework's own thesis, worth stating up front:** _"Good UI design starts with good copywriting."_ CLEAR is ordered as a pipeline, not five independent categories — copy sets the mental model, layout positions it, emphasis directs attention through it, accessibility makes it usable by everyone, reward closes the loop. A screen can fail at any stage regardless of how well it did at the others.

---

## C — Copywriting

**Thesis:** the words are the interface. A beautifully laid-out screen with confusing copy still confuses.

**The psychology behind actionable microcopy.** Button and link text should name the _specific outcome_ of the action, not a generic verb. "Submit" and "Click here" describe the mechanism (a click), not the result; "Start free trial" and "Save changes" describe the result. This is Recognition-over-Recall (§24 `#101`) applied to language: specific text lets the user _recognize_ the right choice, generic text forces them to _recall or guess_ what happens next.

**Aligning copy with user mental models.** Copy should use the words the user already uses for the concept, not the internal/engineering term for it (§24 `#33` Mental Model, `#46` Curse of Knowledge). A settings toggle labelled with a backend flag name ("Enable v2_checkout_flag") instead of what it does ("Use the new checkout") is a mental-model mismatch.

**Common UI copywriting mistakes:**

- Vague CTAs: "Submit", "OK", "Click here", "Learn more" with no object.
- Passive-voice error messages that don't say what to do next ("An error occurred" vs. "Enter a valid email address").
- Jargon or internal terminology surfaced to the end user.
- Inconsistent terminology for the same concept across screens (called "Cart" here, "Bag" there).
- Truncated text with no way to read the full content (ties to `DC-09` overflow/clipping).

**Checklist → `CLR-C` checks:**

- [ ] `CLR-C1` Every primary CTA's accessible name contains a specific verb + object, not a generic verb alone.
- [ ] `CLR-C2` No two affordances in the same capability map use different labels for what the Explorer's transitions show is the same destination/action (terminology drift).
- [ ] `CLR-C3` Error/assertion-failure text (already captured by the Runner) states what the user should do, not only what went wrong.
- [ ] `CLR-C4` No scarcity/urgency copy without a corroborating, checkable fact elsewhere on the page (§25 theme 3).

---

## L — Layout

**Thesis:** where things sit on the screen is itself a claim about what matters and what belongs together.

**Using layout to guide users toward your goals.** The primary path through a screen should read as a single visual line — the eye should not have to search. Layout is priming (§24 `#3`) made spatial: what's positioned first is read as most important, whether or not that's intended.

**Using whitespace to reduce cognitive load.** Whitespace is not empty — it is the separator that makes grouping legible. A dense layout with no breathing room raises Cognitive Load (§24 `#4`) even when the content itself is simple, because the user must do the grouping work the whitespace should have done.

**Creating clear visual hierarchies and groupings.** This is the Law of Proximity and Law of Similarity (§24 `#24`, `#57`) made operational: elements that belong together should be closer to each other than to unrelated elements, and should share visual treatment (size, color, spacing rhythm).

**Checklist → `CLR-L` checks:**

- [ ] `CLR-L1` Related form fields (label + input + inline error) sit closer to each other than to the next unrelated field (extends `DC-08`).
- [ ] `CLR-L2` Spacing between sibling elements in a region follows a consistent rhythm — this _is_ `DC-07`, filed here as Layout's contribution to the CLEAR score.
- [ ] `CLR-L3` A form or flow with high field/step count (§24 `#26` Spark Effect) shows progressive disclosure rather than everything at once.

---

## E — Emphasis

**Thesis:** if everything is emphasized, nothing is. A screen needs exactly one thing the eye lands on first.

**Making key UI elements impossible to miss.** This is Von Restorff (§24 `#12`) as a design law: the primary action must differ from every secondary action on the same screen in more than one dimension (color _and_ size, or color _and_ position) — a single shared dimension is fragile.

**Creating visual hierarchy that drives decisions.** Hierarchy is not decoration — a user presented with three equally-weighted buttons has effectively been asked to make a decision the interface should have made for them (relates to Hick's Law, §24 `#1`).

**Creating focal points without overwhelming the user.** Emphasis has a budget: one primary focal point per screen. A screen with two "equally loud" CTAs re-introduces Hick's Law at the worst possible moment — the point of commitment.

**Checklist → `CLR-E` checks:**

- [ ] `CLR-E1` Exactly one element per screen carries the "primary action" treatment (highest contrast + largest interactive size in its region); flag screens with zero or with more than one.
- [ ] `CLR-E2` The primary CTA is reachable above the fold at the crawl's default viewport — this _is_ `DC-04`, filed here as Emphasis's contribution.
- [ ] `CLR-E3` Heading level and visual size move together (a smaller `<h3>` should never be styled larger than the page's `<h1>`) — extends `DC-03`.

---

## A — Accessibility

**Thesis:** an interface that only works for some users is an interface with a defect, not a design choice.

**Why accessibility is a competitive advantage, not a compliance tax.** The population that benefits from clear focus states, sufficient contrast, and unambiguous labels is larger than the population that self-identifies as needing them — situational and temporary impairment (bright sunlight, one-handed use, a noisy environment) affects everyone. This reframes accessibility checks as _general_ usability checks with the widest population, not a niche category.

**Building interfaces that adapt to users' needs.** Respecting `prefers-reduced-motion`, `prefers-color-scheme`, and zoom/text-resize without breaking layout are the mechanical expressions of this.

**Testing interface accessibility.** Automated checks (contrast ratio, landmark structure, label association, focus order) catch a real and large fraction of issues cheaply; they do not replace a screen-reader pass, but they are exactly the kind of structural/semantic evidence this whole project already trusts most.

**Checklist → `CLR-A` checks (this letter absorbs the deferred spec's accessibility-adjacent checks wholesale):**

- [ ] `CLR-A1` = `DC-06` WCAG AA contrast on all text/glyph pairs, not only the primary CTA.
- [ ] `CLR-A2` = `DC-01`/`DC-02` every interactive element has a role and an accessible name; the name matches its visible label.
- [ ] `CLR-A3` Every text input has a programmatically associated label (`<label for>`, `aria-label`, or `aria-labelledby`) — a placeholder alone is Recognition-over-Recall failure (§24 `#101`), not a label.
- [ ] `CLR-A4` Focus order (DOM/tab order) matches visual reading order.
- [ ] `CLR-A5` = `DC-09` no clipped/truncated required content with no expansion affordance.

---

## R — Reward

**Thesis:** every interaction the user completes should tell them, unambiguously, what just happened.

**Designing an interface that feels rewarding.** This is the Feedback Loop principle (§24 `#27`) as a design law: no committing action (submit, save, delete, purchase) should leave the user uncertain whether it worked.

**Microinteractions that provide feedback and delight.** Small, functional confirmations (a checkmark, a state change, a brief success message) do the feedback job; delight is the polish on top of that job, not a substitute for it. `18-ui-spec.md` §2.4's own motion rules ("the stagger reads as thinking... purely presentational, never gates real progress") already draw exactly this line.

**Balancing UI delight with professional polish.** Reward mechanisms should never be so loud they read as gimmicky in a professional tool — this is the same restraint `18-ui-spec.md` already commits to ("restraint is the aesthetic"), extended here to a second product surface.

**Checklist → `CLR-R` checks:**

- [ ] `CLR-R1` Every committing action produces a detectable state change (new state, confirmation message, or DOM mutation) within a short window — no silent submits.
- [ ] `CLR-R2` = Peak-End (§24 `#91`) — a completed flow's terminal state contains an explicit closure/confirmation, not a bare redirect.
- [ ] `CLR-R3` A destructive/irreversible action confirms before committing (Feedforward, §24 `#52`) rather than rewarding-in-reverse (i.e., punishing an accidental click with no undo).

---

## How the five letters compose into one score

[28 · the catalogue](28-design-psychology-critic.md)'s Delight Score weights the five categories rather than averaging raw finding counts, because the categories are not independent severities — a single missing accessible name (`CLR-A`) usually matters more to more users than one off-grid spacing gap (`CLR-L`). The weighting is specified there, not here; this document only fixes what belongs in each bucket.
