import { Page } from 'playwright';

// ─── Native <select> option selectors ──────────────────────────────────────────
//
// The scraper emits dropdown options as "<select selector> option[value=\"x\"]".
// Native options can't be clicked — they must go through selectOption on the
// parent <select>. This is the single source of truth for that pattern; it is
// used by the live session manager, the test runner and the code generator.

export const OPTION_SELECTOR_RE = /^(.*\S)\s+option\[value="([^"]*)"\]/;

export interface ParsedOptionSelector {
  selectSelector: string;
  optionValue: string;
}

/** Parse "<select selector> option[value=\"x\"]" → its parts, or null when the
 *  selector is not a native option (e.g. a custom dropdown menu item). */
export function parseOptionSelector(selector?: string): ParsedOptionSelector | null {
  const m = (selector || '').match(OPTION_SELECTOR_RE);
  if (!m) return null;
  return { selectSelector: m[1], optionValue: m[2] };
}

// ─── DOM settle wait ───────────────────────────────────────────────────────────
//
// Replaces fixed waitForTimeout chains. Resolves once the DOM has had no
// mutations for `quietMs`, or after `maxMs` regardless — so fast apps continue
// in well under a second while slow AJAX content still gets time to land.

export interface DomSettleOptions {
  /** How long the DOM must stay unchanged to be considered settled (default 500ms). */
  quietMs?: number;
  /** Upper bound on the total wait (default 5000ms). */
  maxMs?: number;
}

export async function waitForDomSettle(page: Page, opts: DomSettleOptions = {}): Promise<void> {
  const quietMs = opts.quietMs ?? 500;
  const maxMs = opts.maxMs ?? 5000;
  try {
    await page.evaluate(({ quietMs, maxMs }) => new Promise<void>((resolve) => {
      const g: any = globalThis;
      let quietTimer: any;
      let maxTimer: any;
      let observer: any;
      function done() {
        if (observer) observer.disconnect();
        clearTimeout(quietTimer);
        clearTimeout(maxTimer);
        resolve();
      }
      observer = new g.MutationObserver(() => {
        clearTimeout(quietTimer);
        quietTimer = setTimeout(done, quietMs);
      });
      observer.observe(g.document.body ?? g.document.documentElement, {
        childList: true, subtree: true, attributes: true, characterData: true,
      });
      quietTimer = setTimeout(done, quietMs);
      maxTimer = setTimeout(done, maxMs);
    }), { quietMs, maxMs });
  } catch {
    // Page navigated away mid-evaluate (context destroyed) or CSP blocked the
    // script — fall back to a short fixed wait.
    await page.waitForTimeout(quietMs).catch(() => {});
  }
}

/** Standard wait after a click / select / navigation triggered in the page:
 *  let any started navigation reach domcontentloaded, then wait for the DOM
 *  (SPA re-render, AJAX content) to settle. */
export async function settleAfterInteraction(page: Page, opts: DomSettleOptions = {}): Promise<void> {
  await page.waitForLoadState('domcontentloaded', { timeout: 10000 }).catch(() => {});
  await waitForDomSettle(page, { quietMs: opts.quietMs ?? 600, maxMs: opts.maxMs ?? 5000 });
}

// ─── Stable element ids ────────────────────────────────────────────────────────
//
// Element ids used to be array indexes, which shift whenever a page is
// re-scanned — saved test steps then no longer match their element. A content
// hash of selector+text is stable across scans of the same page.

export function hashString(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

/** Returns a factory producing ids stable across scans: `${prefix}_${hash}`,
 *  with a numeric suffix only when two elements share selector+text. */
export function stableIdFactory(): (prefix: string, selector: string, text: string) => string {
  const seen = new Map<string, number>();
  return (prefix, selector, text) => {
    const base = `${prefix}_${hashString(`${selector}|${text}`)}`;
    const n = (seen.get(base) || 0) + 1;
    seen.set(base, n);
    return n > 1 ? `${base}_${n}` : base;
  };
}
