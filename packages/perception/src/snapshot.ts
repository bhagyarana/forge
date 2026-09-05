// packages/perception/src/snapshot.ts — 08 §2, §7: the one non-pure function in this
// package. Captures a lightweight accessibility-shaped tree directly from the live DOM
// (role + accessible name + the form-control facts login detection needs), assigns
// refs by traversal order, and enforces both hard budgets before anything downstream
// sees the result. Everything else in `packages/perception` is a pure function over
// whatever this returns, which is what lets `EC-02` assert exploration deterministically
// against a *fixture* snapshot with no browser at all — this module exists only for
// `forge explore <url>` against a real target.
import type { Page } from "playwright";
import { SystemClock, type Clock, type ToolResult } from "@forge/core";
import type { AccessibilitySnapshot, SnapshotNode } from "./types.js";
import { SNAPSHOT_BYTE_BUDGET, INTERACTIVE_NODE_CAP } from "./constants.js";
import { snapshotByteSize } from "./render.js";

type BrowserNode = {
  role: string;
  name: string | null;
  ref: string | null;
  level?: number;
  enabled?: boolean;
  inputType?: string;
  autocomplete?: string;
  attrName?: string;
  attrId?: string;
  placeholder?: string;
  href?: string;
  children: BrowserNode[];
};

/**
 * Runs inside the page (via `page.evaluate`) — must be self-contained, no references
 * to anything in this module's outer scope.
 */
function captureInBrowser(cap: number): {
  root: BrowserNode;
  interactiveCount: number;
  domBytes: number;
} {
  const SKIP_TAGS = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "TEMPLATE", "SVG", "LINK", "META"]);
  const LANDMARK_TAGS: Record<string, string> = {
    HEADER: "banner",
    NAV: "navigation",
    MAIN: "main",
    FOOTER: "contentinfo",
    ASIDE: "complementary",
    FORM: "form",
  };
  const INTERACTIVE_INPUT_TYPES: Record<string, string> = {
    checkbox: "checkbox",
    radio: "radio",
    submit: "button",
    button: "button",
    file: "textbox",
  };

  let interactiveCount = 0;

  function roleOf(el: Element): string {
    const explicit = el.getAttribute("role");
    if (explicit) return explicit;
    const tag = el.tagName;
    if (LANDMARK_TAGS[tag]) return LANDMARK_TAGS[tag] as string;
    if (tag === "A" && el.hasAttribute("href")) return "link";
    if (tag === "BUTTON") return "button";
    if (tag === "SELECT") return "combobox";
    if (tag === "TEXTAREA") return "textbox";
    if (/^H[1-6]$/.test(tag)) return "heading";
    if (tag === "INPUT") {
      const type = (el as HTMLInputElement).type;
      return INTERACTIVE_INPUT_TYPES[type] ?? "textbox";
    }
    return "generic";
  }

  function isInteractive(el: Element, role: string): boolean {
    return [
      "button",
      "link",
      "textbox",
      "checkbox",
      "radio",
      "combobox",
      "tab",
      "menuitem",
    ].includes(role);
  }

  function accessibleName(el: Element): string | null {
    const ariaLabel = el.getAttribute("aria-label");
    if (ariaLabel) return ariaLabel.trim();
    const labelledBy = el.getAttribute("aria-labelledby");
    if (labelledBy) {
      const text = labelledBy
        .split(/\s+/)
        .map((id) => document.getElementById(id)?.textContent?.trim() ?? "")
        .filter(Boolean)
        .join(" ");
      if (text) return text;
    }
    if (el.tagName === "INPUT" || el.tagName === "SELECT" || el.tagName === "TEXTAREA") {
      const id = el.getAttribute("id");
      if (id) {
        const label = document.querySelector(`label[for="${CSS.escape(id)}"]`);
        if (label?.textContent?.trim()) return label.textContent.trim();
      }
      const closestLabel = el.closest("label");
      if (closestLabel?.textContent?.trim()) return closestLabel.textContent.trim();
      const placeholder = el.getAttribute("placeholder");
      if (placeholder) return placeholder.trim();
    }
    const title = el.getAttribute("title");
    if (title) return title.trim();
    if (el.tagName === "IMG") return el.getAttribute("alt")?.trim() || null;
    const text = (el.textContent ?? "").trim().replace(/\s+/g, " ");
    return text.length > 0 && text.length < 200 ? text : null;
  }

  function visit(el: Element): BrowserNode | null {
    if (SKIP_TAGS.has(el.tagName)) return null;
    const style = window.getComputedStyle(el);
    if (style.display === "none" || style.visibility === "hidden") return null;

    const role = roleOf(el);
    const interactive = isInteractive(el, role);
    const ref = interactive ? `e${++interactiveCount}` : null;

    const node: BrowserNode = { role, name: accessibleName(el), ref, children: [] };
    if (role === "heading") {
      const m = /^H([1-6])$/.exec(el.tagName);
      if (m) node.level = Number(m[1]);
    }
    if (el.tagName === "INPUT") {
      const input = el as HTMLInputElement;
      node.inputType = input.type;
      node.enabled = !input.disabled;
      if (input.autocomplete) node.autocomplete = input.autocomplete;
      if (input.name) node.attrName = input.name;
      if (input.id) node.attrId = input.id;
      if (input.placeholder) node.placeholder = input.placeholder;
    } else if (el.tagName === "BUTTON" || el.tagName === "SELECT" || el.tagName === "TEXTAREA") {
      node.enabled = !(el as HTMLButtonElement | HTMLSelectElement | HTMLTextAreaElement).disabled;
    } else if (el.tagName === "A" && el.hasAttribute("href")) {
      // `.href` (not `getAttribute`) is the browser-resolved absolute URL, even for
      // a relative attribute value — exactly what the off-origin check needs (09 §3.3).
      node.href = (el as HTMLAnchorElement).href;
    }

    for (const child of Array.from(el.children)) {
      const childNode = visit(child);
      if (childNode) node.children.push(childNode);
    }
    return node;
  }

  const root = visit(document.body) ?? { role: "document", name: null, ref: null, children: [] };
  const domBytes = document.documentElement.outerHTML.length;

  // Cap interactive nodes, dropping from the end of traversal order — 08 §2.
  let seen = 0;
  function truncate(node: BrowserNode): void {
    if (node.ref !== null) {
      seen += 1;
      if (seen > cap) {
        node.ref = null;
      }
    }
    for (const child of node.children) truncate(child);
  }
  truncate(root);

  return { root, interactiveCount, domBytes };
}

function toSnapshotNode(n: BrowserNode): SnapshotNode {
  return { ...n, children: n.children.map(toSnapshotNode) };
}

/**
 * Live capture — the only place this package touches a browser. 08 §7 budgets.
 * Takes `Clock` from the caller's `RunContext` (15 §4.4) purely to time itself —
 * the snapshot content this returns never depends on the clock.
 */
export async function captureSnapshot(
  page: Page,
  clock: Clock = new SystemClock(),
): Promise<ToolResult<AccessibilitySnapshot>> {
  const startedAt = clock.now().getTime();
  try {
    const { root, interactiveCount, domBytes } = await Promise.race([
      page.evaluate(captureInBrowser, INTERACTIVE_NODE_CAP),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error("TIMEOUT")), 3000)),
    ]);
    const snapshot: AccessibilitySnapshot = {
      url: page.url(),
      title: await page.title(),
      root: toSnapshotNode(root),
      raw: { interactiveCount, domBytes },
    };
    const bytes = snapshotByteSize(snapshot);
    if (bytes > SNAPSHOT_BYTE_BUDGET) {
      return {
        ok: false,
        error: {
          code: "BUDGET_EXHAUSTED",
          message: `snapshot exceeds the ${SNAPSHOT_BYTE_BUDGET}-byte budget (${bytes} bytes)`,
          detail: { bytes, data: snapshot },
        },
        evidenceIds: [],
        durationMs: clock.now().getTime() - startedAt,
      };
    }
    return {
      ok: true,
      data: snapshot,
      evidenceIds: [],
      durationMs: clock.now().getTime() - startedAt,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      error: { code: message === "TIMEOUT" ? "TIMEOUT" : "SCRIPT_ERROR", message },
      evidenceIds: [],
      durationMs: clock.now().getTime() - startedAt,
    };
  }
}
