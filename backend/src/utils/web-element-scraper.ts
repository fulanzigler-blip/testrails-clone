import { chromium, Browser, Page } from 'playwright';
import logger from '../utils/logger';
import { validateScraperConfig, ScraperConfig } from '../config/schemas';

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface WebInputElement {
  id: string;
  label: string;
  type: string;
  selector: string;
  xpath: string;
  name?: string;
  placeholder?: string;
  page?: string;
  testId?: string;
  ariaLabel?: string;
  tag?: string;
  role?: string;
  fallbackSelectors?: string[];
}

export interface WebButtonElement {
  id: string;
  text: string;
  type: string;
  selector: string;
  xpath: string;
  page?: string;
  action?: string;
  testId?: string;
  ariaLabel?: string;
  tag?: string;
  role?: string;
  fallbackSelectors?: string[];
}

export interface WebTextElement {
  id: string;
  text: string;
  selector: string;
  xpath: string;
  page?: string;
  isStatic: boolean;
  testId?: string;
  tag?: string;
  fallbackSelectors?: string[];
}

export interface WebLinkElement {
  id: string;
  text: string;
  href: string;
  selector: string;
  xpath: string;
  page?: string;
}

export interface WebPageElement {
  name: string;
  url: string;
  inputs: WebInputElement[];
  buttons: WebButtonElement[];
  texts: WebTextElement[];
  links: WebLinkElement[];
}

export interface WebElementCatalog {
  baseUrl: string;
  scannedAt: string;
  pages: WebPageElement[];
  inputs: WebInputElement[];
  buttons: WebButtonElement[];
  texts: WebTextElement[];
  links: WebLinkElement[];
  routes: string[];
}

export type ScanProgressCallback = (event: {
  type: 'login' | 'page' | 'complete' | 'error';
  pageCount: number;
  maxPages: number;
  pageName?: string;
  pageUrl?: string;
  queueSize: number;
}) => void;

export interface WebAuthConfig {
  loginUrl?: string;         // URL of login page; defaults to baseUrl if omitted
  usernameSelector: string;  // CSS selector for username/email field
  usernameValue: string;     // Credential to type
  passwordSelector: string;  // CSS selector for password field
  passwordValue: string;     // Credential to type
  submitSelector?: string;   // CSS selector for submit button; auto-detected if omitted
  waitAfterLogin?: number;   // ms to wait after login redirect (default 2000)
}

// ─── Scraper Configuration ─────────────────────────────────────────────────────

// Use ScraperConfig from schemas
// Import it: import type { ScraperConfig } from '../config/schemas';

const DEFAULT_CONFIG: Required<ScraperConfig> = {
  maxPages: 20,
  maxDepth: 3,
  timeout: 30000,
  headless: true,
  viewport: { width: 1280, height: 720 },
  requestDelay: 0,     // No extra delay — 1500ms SPA wait per page is already polite enough
  concurrentRequests: 1,  // Sequential requests by default
  respectRobotsTxt: true,  // Respect robots.txt by default
};

// ─── Element Extraction Helpers ────────────────────────────────────────────────

function generateCSSSelector(element: any, page: Page): string {
  // Try to build a unique CSS selector
  const selectors: string[] = [];

  // Try by ID
  if (element.getAttribute('id')) {
    return `#${element.getAttribute('id')}`;
  }

  // Try by name
  if (element.getAttribute('name')) {
    return `[name="${element.getAttribute('name')}"]`;
  }

  // Try by placeholder
  if (element.getAttribute('placeholder')) {
    return `[placeholder="${element.getAttribute('placeholder')}"]`;
  }

  // Try by data-testid
  if (element.getAttribute('data-testid')) {
    return `[data-testid="${element.getAttribute('data-testid')}"]`;
  }

  // Build path-based selector
  let current: any = element;
  while (current && current.tagName) {
    const tag = current.tagName.toLowerCase();
    let selector = tag;

    if (current.getAttribute('class')) {
      const classes = current.getAttribute('class').split(/\s+/).filter((c: string) => c).slice(0, 3).join('.');
      if (classes) selector += `.${classes}`;
    }

    selectors.unshift(selector);
    current = current.parentElement;

    if (selectors.length > 5) break;
  }

  return selectors.join(' > ') || element.tagName.toLowerCase();
}

function generateXPath(element: any): string {
  const parts: string[] = [];
  let current: any = element;

  while (current && current.nodeType === 1) {
    let index = 1;
    let sibling = current.previousSibling;
    while (sibling) {
      if (sibling.nodeName === current.nodeName) index++;
      sibling = sibling.previousSibling;
    }

    const tag = current.nodeName.toLowerCase();
    parts.unshift(index > 1 ? `${tag}[${index}]` : tag);
    current = current.parentNode;
  }

  return `//${parts.join('/')}`;
}

function getAccessibleLabel(element: any): string {
  // Try multiple strategies to get a readable label
  return (
    element.getAttribute('aria-label') ||
    element.getAttribute('aria-labelledby') ||
    element.getAttribute('title') ||
    element.getAttribute('alt') ||
    element.getAttribute('placeholder') ||
    element.getAttribute('name') ||
    element.getAttribute('id') ||
    element.textContent?.trim().slice(0, 50) ||
    element.tagName.toLowerCase()
  );
}

// ─── Page Crawling ─────────────────────────────────────────────────────────────

export async function extractElementsFromPage(page: Page, pageName: string, pageUrl?: string): Promise<WebPageElement> {
  // Use URL path as ID slug — more unique than page title (many pages share the same title)
  const urlSlug = (() => {
    try {
      const u = new URL(pageUrl || page.url());
      const path = (u.pathname + u.search).replace(/[^a-z0-9]+/gi, '_').replace(/^_|_$/g, '').toLowerCase();
      return path || 'index';
    } catch {
      return pageName.toLowerCase().replace(/\s+/g, '_');
    }
  })();
  const elements = await page.evaluate(() => {
    const inputs: Array<{ tag: string; type: string; id: string; name: string; placeholder: string; label: string; ariaLabel: string; selector: string; testId?: string; role?: string; fallbackSelectors?: string[] }> = [];
    const buttons: Array<{ tag: string; text: string; type: string; selector: string; testId?: string; ariaLabel?: string; role?: string; fallbackSelectors?: string[] }> = [];
    const texts: Array<{ text: string; tag: string; selector: string; testId?: string; fallbackSelectors?: string[] }> = [];
    const links: Array<{ text: string; href: string; tag: string; selector: string }> = [];

    // Extract input fields
    const allInputs = globalThis.document.querySelectorAll('input, textarea, select');
    allInputs.forEach((el: any) => {
      const input = el as any;
      if (input.tagName === 'INPUT' && (input.type === 'hidden' || input.type === 'submit')) return;

      const labelEl = input.id ? globalThis.document.querySelector(`label[for="${input.id}"]`) : null;
      const label = labelEl?.textContent?.trim() ||
                    input.getAttribute('aria-label') ||
                    input.getAttribute('placeholder') ||
                    input.getAttribute('name') ||
                    input.id ||
                    input.getAttribute('type') ||
                    '';

      // Generate multiple fallback selectors
      const fallbackSelectors: string[] = [];
      if (input.getAttribute('data-testid')) fallbackSelectors.push(`[data-testid="${input.getAttribute('data-testid')}"]`);
      if (input.id) fallbackSelectors.push(`#${input.id}`);
      if (input.getAttribute('name')) fallbackSelectors.push(`[name="${input.getAttribute('name')}"]`);
      if (input.getAttribute('placeholder')) fallbackSelectors.push(`[placeholder="${input.getAttribute('placeholder')}"]`);
      if (input.getAttribute('aria-label')) fallbackSelectors.push(`[aria-label="${input.getAttribute('aria-label')}"]`);
      fallbackSelectors.push(`${input.tagName.toLowerCase()}[type="${input.getAttribute('type') || 'text'}"]`);

      inputs.push({
        tag: input.tagName.toLowerCase(),
        type: input.getAttribute('type') || 'text',
        id: input.id || '',
        name: input.getAttribute('name') || '',
        placeholder: input.getAttribute('placeholder') || '',
        label: label || '',
        ariaLabel: input.getAttribute('aria-label') || '',
        testId: input.getAttribute('data-testid') || undefined,
        role: input.getAttribute('role') || input.tagName.toLowerCase(),
        selector: fallbackSelectors[0] || `${input.tagName.toLowerCase()}`,
        fallbackSelectors,
      });
    });

    // Extract buttons (includes tab-like interactive divs/spans with data-tab, data-toggle, etc.)
    const allButtonEls = globalThis.document.querySelectorAll(
      'button, [role="button"], input[type="submit"], input[type="button"], ' +
      '[data-tab], [data-tabs], [data-toggle="tab"], [data-bs-toggle="tab"], ' +
      '[data-toggle="dropdown"], [data-bs-toggle="dropdown"], ' +
      '[data-bs-toggle="pill"], .tab:not(.tabs):not(.tab-content):not(.tab-pane)'
    );
    allButtonEls.forEach((el: any, idx: number) => {
      const btn = el as any;

      // Skip buttons inside modal/dialog overlays — they are global UI (confirmation dialogs,
      // "Leave page?" prompts, etc.) and would appear in every page's catalog
      if (btn.closest('[role="dialog"]') || btn.closest('[aria-modal="true"]') ||
          btn.closest('[class*="modal"]') || btn.closest('[class*="dialog"]') ||
          btn.closest('[class*="popup"]') || btn.closest('[class*="overlay"]')) return;

      const rawText = btn.textContent?.trim();
      const ariaLabel = btn.getAttribute('aria-label') || btn.getAttribute('title');
      const value = btn.getAttribute('value');
      const hasUsableText = !!(rawText || ariaLabel || value);

      // Display label — prefer real text, fallback to aria/title, then context-based name
      const parentTag = btn.parentElement?.tagName?.toLowerCase() || '';
      const contextHint = parentTag === 'header' || btn.closest('header') ? 'Header' :
                          parentTag === 'nav' || btn.closest('nav') ? 'Nav' :
                          btn.closest('footer') ? 'Footer' : '';
      const displayText = rawText || ariaLabel || value ||
                          `${contextHint ? contextHint + ' ' : ''}Icon Button ${idx + 1}`;

      // Build CSS selectors ordered by stability
      const fallbackSelectors: string[] = [];
      if (btn.getAttribute('data-testid')) fallbackSelectors.push(`[data-testid="${btn.getAttribute('data-testid')}"]`);
      if (btn.id) fallbackSelectors.push(`#${btn.id}`);
      // data-tab / data-toggle are very stable for tab elements
      if (btn.getAttribute('data-tab')) fallbackSelectors.push(`[data-tab="${btn.getAttribute('data-tab')}"]`);
      if (btn.getAttribute('data-bs-toggle') && btn.getAttribute('data-bs-target')) fallbackSelectors.push(`[data-bs-target="${btn.getAttribute('data-bs-target')}"]`);
      if (btn.getAttribute('name')) fallbackSelectors.push(`[name="${btn.getAttribute('name')}"]`);
      if (btn.tagName === 'INPUT' && value) {
        fallbackSelectors.push(`input[type="${btn.getAttribute('type') || 'submit'}"][value="${value.slice(0, 50)}"]`);
      } else if (hasUsableText) {
        const tag = btn.tagName.toLowerCase();
        // Use tag-specific has-text for non-button interactive elements
        const hasTextTag = tag === 'button' ? 'button' : tag;
        fallbackSelectors.push(`${hasTextTag}:has-text("${(rawText || ariaLabel || value || '').slice(0, 50)}")`);
      }
      // Class-based selector as CSS fallback for icon-only buttons
      if (!hasUsableText) {
        const classes = Array.from(btn.classList || []).slice(0, 3).join('.');
        if (classes) fallbackSelectors.push(`${btn.tagName.toLowerCase()}.${classes}`);
      }
      if (btn.getAttribute('role')) fallbackSelectors.push(`[role="${btn.getAttribute('role')}"]`);

      // Always include as nth-of-type last resort
      const nthIdx = Array.from(globalThis.document.querySelectorAll(btn.tagName.toLowerCase())).indexOf(btn) + 1;
      fallbackSelectors.push(`${btn.tagName.toLowerCase()}:nth-of-type(${nthIdx})`);

      buttons.push({
        tag: btn.tagName.toLowerCase(),
        text: displayText.slice(0, 100),
        type: btn.getAttribute('type') || 'button',
        testId: btn.getAttribute('data-testid') || undefined,
        ariaLabel: ariaLabel || undefined,
        role: btn.getAttribute('role') || 'button',
        selector: fallbackSelectors[0] || `${btn.tagName.toLowerCase()}`,
        fallbackSelectors,
      });
    });

    // ── Sidebar / nav container items (SPA-friendly) ───────────────────────────
    // SPA frameworks (Svelte, React) often render sidebar nav as <li>, <span>, or <div>
    // elements with click handlers — not <button> or <a href>. Query nav containers
    // directly and capture any visible child with meaningful text as a nav element.
    const navContainerEls = globalThis.document.querySelectorAll(
      'nav a, nav li, nav span, nav div, ' +
      'aside a, aside li, aside span, ' +
      '[role="navigation"] a, [role="navigation"] li, [role="menuitem"], ' +
      '[class*="sidebar"] a, [class*="sidebar"] li, [class*="sidebar"] span, [class*="sidebar"] div, ' +
      '[class*="sidenav"] a, [class*="sidenav"] li, [class*="sidenav"] span, ' +
      '[class*="nav-item"], [class*="menu-item"], [class*="navitem"], [class*="menuitem"]'
    );
    navContainerEls.forEach((el: any) => {
      const text = el.textContent?.trim();
      if (!text || text.length < 1 || text.length > 60) return;
      if (/^\d+$/.test(text)) return;                   // skip pagination numbers
      if (/\s+\d+$/.test(text)) return;                 // skip count-badge items
      if (el.closest('[role="dialog"]') || el.closest('[aria-modal="true"]')) return;
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;  // skip invisible elements

      const tag = el.tagName.toLowerCase();
      const href = el.getAttribute('href') || '';
      const fallbackSelectors: string[] = [];
      if (el.getAttribute('data-testid')) fallbackSelectors.push(`[data-testid="${el.getAttribute('data-testid')}"]`);
      if (el.id) fallbackSelectors.push(`#${el.id}`);
      if (href && href !== '#' && (href.startsWith('/') || href.startsWith('http'))) {
        fallbackSelectors.push(`${tag}[href="${href}"]`);
      }
      fallbackSelectors.push(`${tag}:has-text("${text.slice(0, 50).replace(/"/g, '\\"')}")`);

      buttons.push({
        tag,
        text: text.slice(0, 100),
        type: href && href !== '#' ? 'link' : 'nav',
        testId: el.getAttribute('data-testid') || undefined,
        ariaLabel: el.getAttribute('aria-label') || undefined,
        role: el.getAttribute('role') || 'menuitem',
        selector: fallbackSelectors[0] || fallbackSelectors[fallbackSelectors.length - 1],
        fallbackSelectors,
      });
    });

    // Extract ALL <a> links with meaningful text as navigational buttons
    // No isNavLike filter — SPA frameworks (Svelte/React/Vue) generate hashed class names
    // that never match nav/btn patterns, so we include all same-page links with text.
    const allLinks = globalThis.document.querySelectorAll('a[href]');
    allLinks.forEach((el: any) => {
      const link = el as any;
      const text = link.textContent?.trim();
      const href = link.getAttribute('href') || '';

      // Skip: empty text, too long, external JS, bare anchors
      if (!text || text.length < 1 || text.length > 80) return;
      const isDropdownTrigger = link.getAttribute('data-toggle') === 'dropdown' ||
                                link.getAttribute('data-bs-toggle') === 'dropdown' ||
                                (link.className || '').toString().includes('dropdown-toggle');
      if (!href || href === 'javascript:void(0)') return;
      if (href === '#' && !isDropdownTrigger) return;

      const fallbackSelectors: string[] = [];
      if (link.getAttribute('data-testid')) fallbackSelectors.push(`[data-testid="${link.getAttribute('data-testid')}"]`);
      if (link.id) fallbackSelectors.push(`#${link.id}`);
      if (isDropdownTrigger) {
        const toggle = link.getAttribute('data-toggle') || link.getAttribute('data-bs-toggle');
        if (toggle) fallbackSelectors.push(`a[data-toggle="${toggle}"]:has-text("${text.slice(0, 50)}")`);
      } else if (href.startsWith('http') || href.startsWith('/')) {
        fallbackSelectors.push(`a[href="${href}"]`);
      }
      fallbackSelectors.push(`a:has-text("${text.slice(0, 50)}")`);

      buttons.push({
        tag: 'a',
        text: text.slice(0, 100),
        type: isDropdownTrigger ? 'dropdown' : 'link',
        testId: link.getAttribute('data-testid') || undefined,
        ariaLabel: link.getAttribute('aria-label') || undefined,
        role: link.getAttribute('role') || 'link',
        selector: fallbackSelectors[0] || `a:has-text("${text.slice(0, 50)}")`,
        fallbackSelectors,
      });
    });

    // Extract visible text elements
    const textSelector = 'h1, h2, h3, h4, h5, h6, p, span, div';
    const allTexts = globalThis.document.querySelectorAll(textSelector);
    allTexts.forEach((el: any) => {
      const text = el.textContent?.trim();
      if (!text || text.length < 3 || text.length > 200) return;
      const parent = el.parentElement;
      if (parent && parent.textContent?.trim() === text) return;

      const fallbackSelectors: string[] = [];
      if (el.getAttribute('data-testid')) fallbackSelectors.push(`[data-testid="${el.getAttribute('data-testid')}"]`);
      if (el.id) fallbackSelectors.push(`#${el.id}`);
      fallbackSelectors.push(`${el.tagName.toLowerCase()}:has-text("${text.slice(0, 50)}")`);

      texts.push({
        text: text.slice(0, 200),
        tag: el.tagName.toLowerCase(),
        testId: el.getAttribute('data-testid') || undefined,
        selector: fallbackSelectors[0] || `${el.tagName.toLowerCase()}`,
        fallbackSelectors,
      });
    });

    // Extract links
    const allPageLinks = globalThis.document.querySelectorAll('a[href]');
    allPageLinks.forEach((el: any) => {
      const link = el as any;
      if (!link.href || link.href.startsWith('javascript:') || link.href.startsWith('javascript:')) return;
      if (link.href === '#') return;
      const text = link.textContent?.trim() || link.getAttribute('aria-label') || link.href;

      links.push({
        text: text.slice(0, 100),
        href: link.href,
        tag: 'a',
        selector: link.id ? `#${link.id}` : `a:has-text("${text.slice(0, 50)}")`,
      });
    });

    // ── Deduplicate buttons ──────────────────────────────────────────────────────
    // 1. Skip carousel / slider noise
    const carouselNoise = /^(go to slide \d+|next slide|previous slide|prev slide)$/i;
    const filteredButtons = buttons.filter(b => !carouselNoise.test((b.text || '').trim()));

    // 2. Deduplicate: by href-path for links, by text for others, also skip same selector
    const seenKeys = new Set<string>();
    const seenSelectors = new Set<string>();
    const dedupedButtons = filteredButtons.filter(b => {
      const normText = (b.text || '').toLowerCase().trim();
      // For <a> links use full href path (without query) as unique key
      const hrefPath = b.selector?.match(/a\[href="([^"]+)"\]/)?.[1]?.split('?')[0] || '';
      const key = hrefPath || normText;
      if (!key) return false;
      if (seenKeys.has(key)) return false;
      // Also dedup icon-only buttons that share the same CSS selector (e.g. multiple dropdown toggles)
      const sel = b.selector || '';
      const isGenericIconBtn = !hrefPath && normText.match(/^(nav |header |footer |icon )?icon button \d+$|^button \d+$/i);
      if (isGenericIconBtn && sel && seenSelectors.has(sel)) return false;
      seenKeys.add(key);
      if (sel) seenSelectors.add(sel);
      return true;
    });

    return { inputs, buttons: dedupedButtons, texts, links };
  });

  const inputs: WebInputElement[] = elements.inputs.map((el, i) => ({
    id: `input_${urlSlug}_${i}`,
    label: el.label,
    type: el.type,
    selector: el.selector,
    xpath: '',
    name: el.name,
    placeholder: el.placeholder,
    page: pageName,
    testId: el.testId,
    ariaLabel: el.ariaLabel,
    tag: el.tag,
    role: el.role,
    fallbackSelectors: el.fallbackSelectors,
  }));

  const buttons: WebButtonElement[] = elements.buttons.map((el, i) => ({
    id: `btn_${urlSlug}_${i}`,
    text: el.text,
    type: el.type,
    selector: el.selector,
    xpath: '',
    page: pageName,
    action: el.text.toLowerCase().includes('submit') || el.text.toLowerCase().includes('login') || el.text.toLowerCase().includes('sign')
      ? 'form_submit'
      : undefined,
    testId: el.testId,
    ariaLabel: el.ariaLabel,
    tag: el.tag,
    role: el.role,
    fallbackSelectors: el.fallbackSelectors,
  }));

  const texts: WebTextElement[] = elements.texts.slice(0, 50).map((el, i) => ({
    id: `text_${urlSlug}_${i}`,
    text: el.text,
    selector: el.selector,
    xpath: '',
    page: pageName,
    isStatic: true,
    testId: el.testId,
    tag: el.tag,
    fallbackSelectors: el.fallbackSelectors,
  }));

  const links: WebLinkElement[] = elements.links.slice(0, 30).map((el, i) => ({
    id: `link_${urlSlug}_${i}`,
    text: el.text,
    href: el.href,
    selector: el.selector,
    xpath: '',
    page: pageName,
  }));

  return { name: pageName, url: page.url(), inputs, buttons, texts, links };
}

async function crawlSite(
  page: Page,
  baseUrl: string,
  config: Required<ScraperConfig>,
  startUrl?: string,  // actual URL to start crawling from (e.g. post-login redirect URL)
  onProgress?: ScanProgressCallback,
): Promise<WebPageElement[]> {
  // Use origin as crawl boundary so all pages on the same domain are reachable
  const origin = (() => { try { return new URL(baseUrl).origin; } catch { return baseUrl; } })();
  const seedUrl = startUrl || baseUrl;

  const visited = new Set<string>();  // URLs actually processed
  const queued = new Set<string>();   // URLs added to queue (to avoid duplicates)
  // Track parent menu items we've already tried sub-menu expansion for across all pages.
  // Without this, "Monitoring", "Debitur Diproses" etc. get re-clicked on every page.
  const triedSubMenuExpansion = new Set<string>();
  queued.add(seedUrl.split('#')[0].split('?')[0]);
  const toVisit: Array<{ url: string; depth: number }> = [{ url: seedUrl, depth: 0 }];
  const pages: WebPageElement[] = [];
  let pageCount = 0;

  while (toVisit.length > 0 && pageCount < config.maxPages) {
    const { url, depth } = toVisit.shift()!;

    // Normalize URL
    const normalizedUrl = url.split('#')[0].split('?')[0];
    if (visited.has(normalizedUrl)) continue;
    if (depth > config.maxDepth) continue;
    // Only crawl pages within the same origin
    if (!normalizedUrl.startsWith(origin)) continue;

    visited.add(normalizedUrl);
    pageCount++;

    try {
      // Add polite delay between requests (except for first request)
      if (pageCount > 1 && config.requestDelay > 0) {
        await page.waitForTimeout(config.requestDelay);
      }

      // Use domcontentloaded — apps with SSE/WebSocket keep network perpetually busy
      // so networkidle never fires. We wait for DOM + extra time for SPA to render.
      const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: config.timeout });

      // Check for rate limit headers
      if (response && response.headers()) {
        const rateLimitRemaining = response.headers()['x-ratelimit-remaining'];
        const rateLimitReset = response.headers()['x-ratelimit-reset'];
        if (rateLimitRemaining === '0' && rateLimitReset) {
          const resetTime = parseInt(rateLimitReset) * 1000;
          const now = Date.now();
          if (resetTime > now) {
            const waitTime = resetTime - now;
            logger.info(`[WebScraper] Rate limit hit, waiting ${waitTime}ms until reset`);
            await page.waitForTimeout(waitTime);
          }
        }
      }

      // Wait for SPA to finish rendering (Svelte/React/Vue need time after domcontentloaded)
      await page.waitForTimeout(1500);

      const pageName = await page.title().then(t => t || `Page ${pageCount}`);
      const actualUrl = page.url(); // may differ from requested url (e.g. SPA redirect)
      const elements = await extractElementsFromPage(page, pageName, actualUrl);
      logger.info(`[WebScraper] Page ${pageCount}: "${pageName}" (${actualUrl}) — ${elements.inputs.length} inputs, ${elements.buttons.length} buttons, ${elements.texts.length} texts`);
      pages.push(elements);
      onProgress?.({ type: 'page', pageCount, maxPages: config.maxPages, pageName, pageUrl: actualUrl, queueSize: toVisit.length });

      // Find links to crawl
      if (depth < config.maxDepth) {
        // Strategy 1: follow <a href> links (standard crawling)
        const hrefLinks = await page.evaluate((orig: string) => {
          return Array.from(globalThis.document.querySelectorAll('a[href]'))
            .map((a: any) => a.href as string)
            .filter((h: string) => h && !h.startsWith('javascript:') && !h.startsWith('mailto:') && h.startsWith(orig));
        }, origin);

        let added = 0;
        for (const link of hrefLinks) {
          const norm = link.split('#')[0].split('?')[0];
          if (!queued.has(norm) && !visited.has(norm)) {
            toVisit.push({ url: link, depth: depth + 1 });
            queued.add(norm);
            added++;
          }
        }

        // Strategy 2: if no href links found (SPA with JS-only navigation like Svelte goto()),
        // click each visible nav button, detect URL change, queue the new URL
        if (hrefLinks.length === 0 && pageCount <= config.maxPages) {
          logger.info(`[WebScraper] No href links found — trying click-to-discover for SPA navigation`);
          const currentUrl = page.url();

          // Collect clickable nav elements (sidebar items, menu items)
          const navCandidates = await page.evaluate(() => {
            const selectors = [
              'nav a', 'nav button', 'nav li', 'nav [role="menuitem"]',
              'aside a', 'aside button', 'aside li',
              '[role="navigation"] a', '[role="navigation"] button',
              '[class*="sidebar"] a', '[class*="sidebar"] button', '[class*="sidebar"] li',
              '[class*="menu"] a', '[class*="menu"] button', '[class*="menu"] li',
              '[class*="nav"] a', '[class*="nav"] button',
            ];
            const seen = new Set<string>();
            const result: Array<{ text: string; index: number; selector: string }> = [];
            for (const sel of selectors) {
              globalThis.document.querySelectorAll(sel).forEach((el: any, i: number) => {
                const text = el.textContent?.trim();
                if (!text || text.length < 1 || text.length > 60) return;
                // Skip pure numbers (pagination: "1","2","248")
                if (/^\d+$/.test(text)) return;
                // Skip count-badge items: text ending with whitespace+number ("Telat Bayar  36", "Aktif  0")
                if (/\s+\d+$/.test(text)) return;
                if (seen.has(text)) return;
                seen.add(text);
                result.push({ text, index: i, selector: sel });
              });
            }
            return result.slice(0, 20);
          });

          logger.info(`[WebScraper] SPA nav candidates: ${JSON.stringify(navCandidates.map(n => n.text))}`);

          for (const candidate of navCandidates) {
            if (pageCount >= config.maxPages) break;
            // Skip candidates we've already tried sub-menu expansion for on a previous page
            if (triedSubMenuExpansion.has(candidate.text)) continue;
            try {
              const beforeUrl = page.url();
              // Click the element by text
              const el = page.locator(`${candidate.selector}:has-text("${candidate.text.replace(/"/g, '\\"')}")`).first();
              if (!await el.isVisible({ timeout: 1000 })) continue;
              await el.click();
              // Wait for SPA router to update URL
              await page.waitForTimeout(1500);
              const afterUrl = page.url().split('#')[0].split('?')[0];
              if (afterUrl !== beforeUrl.split('#')[0].split('?')[0] && afterUrl.startsWith(origin) && !queued.has(afterUrl) && !visited.has(afterUrl)) {
                logger.info(`[WebScraper] SPA nav discovered: "${candidate.text}" → ${afterUrl}`);
                toVisit.push({ url: afterUrl, depth: depth + 1 });
                queued.add(afterUrl);
                added++;
                triedSubMenuExpansion.add(candidate.text); // direct nav — no sub-menu needed
                // Navigate back to the original page for next candidate
                await page.goto(currentUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
                await page.waitForTimeout(800);
              } else if (afterUrl === beforeUrl.split('#')[0].split('?')[0]) {
                // URL didn't change — parent menu may have expanded a sub-menu.
                // Detect newly-visible nav items that weren't in the original candidates list.
                const knownTexts = navCandidates.map(n => n.text);
                const subItems = await page.evaluate((knownTextsArr: string[]) => {
                  const knownSet = new Set(knownTextsArr);
                  const navSelectors = [
                    'nav a', 'nav button', 'nav li', 'nav [role="menuitem"]',
                    'aside a', 'aside button', 'aside li',
                    '[role="navigation"] a', '[role="navigation"] button',
                    '[class*="sidebar"] a', '[class*="sidebar"] button', '[class*="sidebar"] li',
                    '[class*="menu"] a', '[class*="menu"] button', '[class*="menu"] li',
                    '[class*="nav"] a', '[class*="nav"] button',
                  ];
                  const seen = new Set<string>();
                  const result: Array<{ text: string; selector: string }> = [];
                  for (const sel of navSelectors) {
                    (globalThis.document.querySelectorAll(sel) as any).forEach((el: any) => {
                      const text = el.textContent?.trim();
                      if (!text || text.length < 1 || text.length > 60) return;
                      // Skip pure numbers (pagination) and count-badge items
                      if (/^\d+$/.test(text)) return;
                      if (/\s+\d+$/.test(text)) return;
                      if (knownSet.has(text) || seen.has(text)) return;
                      // Only include elements that are actually visible on screen
                      const rect = el.getBoundingClientRect();
                      if (rect.width === 0 || rect.height === 0) return;
                      seen.add(text);
                      result.push({ text, selector: sel });
                    });
                  }
                  return result.slice(0, 15);
                }, knownTexts);

                if (subItems.length > 0) {
                  logger.info(`[WebScraper] Sub-menu under "${candidate.text}": ${JSON.stringify(subItems.map(s => s.text))}`);
                  const parentLocatorStr = `${candidate.selector}:has-text("${candidate.text.replace(/"/g, '\\"')}")`;

                  for (const subItem of subItems) {
                    if (pageCount >= config.maxPages) break;
                    try {
                      const subLocatorStr = `${subItem.selector}:has-text("${subItem.text.replace(/"/g, '\\"')}")`;
                      let subEl = page.locator(subLocatorStr).first();

                      // If sub-menu collapsed (e.g. after navigating back), re-expand parent
                      if (!await subEl.isVisible({ timeout: 1000 })) {
                        const parentEl = page.locator(parentLocatorStr).first();
                        if (await parentEl.isVisible({ timeout: 1000 })) {
                          await parentEl.click();
                          await page.waitForTimeout(800);
                        }
                        subEl = page.locator(subLocatorStr).first();
                      }
                      if (!await subEl.isVisible({ timeout: 1000 })) continue;

                      const beforeSubUrl = page.url().split('#')[0].split('?')[0];
                      await subEl.click();
                      await page.waitForTimeout(1500);
                      const afterSubUrl = page.url().split('#')[0].split('?')[0];

                      if (afterSubUrl !== beforeSubUrl && afterSubUrl.startsWith(origin) && !queued.has(afterSubUrl) && !visited.has(afterSubUrl)) {
                        logger.info(`[WebScraper] Sub-menu URL: "${candidate.text}" > "${subItem.text}" → ${afterSubUrl}`);
                        toVisit.push({ url: afterSubUrl, depth: depth + 1 });
                        queued.add(afterSubUrl);
                        added++;
                      }

                      // Navigate back to currentUrl and re-expand parent for next sub-item
                      await page.goto(currentUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
                      await page.waitForTimeout(800);
                      const parentReopen = page.locator(parentLocatorStr).first();
                      if (await parentReopen.isVisible({ timeout: 1000 })) {
                        await parentReopen.click();
                        await page.waitForTimeout(600);
                      }
                    } catch { /* skip unclickable sub-item */ }
                  }

                  // Return to clean state at currentUrl for next main candidate
                  await page.goto(currentUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
                  await page.waitForTimeout(800);
                }
                // Mark this parent as done regardless of whether sub-items were found,
                // so we never re-expand it on subsequent pages
                triedSubMenuExpansion.add(candidate.text);
              }
            } catch { /* skip unclickable */ }
          }
        }

        logger.info(`[WebScraper] Added ${added} new URLs to queue, total queue: ${toVisit.length}`);
      }
    } catch (err: any) {
      logger.warn(`[WebScraper] Failed to crawl ${url}: ${err.message}`);
    }
  }

  return pages;
}

// ─── Pre-login Helper ──────────────────────────────────────────────────────────

export async function performLogin(page: Page, baseUrl: string, auth: WebAuthConfig): Promise<void> {
  const loginUrl = auth.loginUrl || baseUrl;
  logger.info(`[WebScraper] Performing pre-login at ${loginUrl}`);

  await page.goto(loginUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
  // Wait for JS-rendered login form to appear
  await page.waitForTimeout(2000);

  // Resolve a loose field name / label to a real CSS selector.
  // If the user typed a plain word (no CSS special chars) we try common patterns.
  async function resolveSelector(raw: string, label: string): Promise<string> {
    // Detect real CSS selectors: starts with #/./ or contains [, >, +, ~, :, or CSS-style spaces (e.g. "div span")
    // Plain words with spaces (e.g. "Masukkan Personal Number") are treated as labels, not CSS
    const isCss = /^[#\.\[]/.test(raw) || /[>\+~]/.test(raw) || /\[/.test(raw) ||
                  (/\s/.test(raw) && /^[a-z]+\s/.test(raw) && !/[A-Z]/.test(raw[0]));
    if (isCss) return raw; // already a proper CSS selector

    const candidates = [
      `[name="${raw}"]`,
      `#${raw}`,
      `[id="${raw}"]`,
      // button text match (for submit selectors like "MASUK", "Login", etc.)
      `button:has-text("${raw}")`,
      `input[value="${raw}"]`,
      // placeholder / aria for input fields
      `[placeholder="${raw}"]`,
      `[placeholder*="${raw}" i]`,
      `[aria-label="${raw}"]`,
      `[aria-label*="${raw}" i]`,
      `input[type="${raw}"]`,
    ];
    for (const sel of candidates) {
      try {
        const el = await page.$(sel);
        if (el) {
          logger.info(`[WebScraper] Resolved "${raw}" → "${sel}" for ${label}`);
          return sel;
        }
      } catch { /* try next */ }
    }
    // Nothing matched — return original and let waitForSelector give a clear error
    return raw;
  }

  const usernameSelector = await resolveSelector(auth.usernameSelector, 'username');
  const passwordSelector = await resolveSelector(auth.passwordSelector, 'password');

  // Wait for username field to be visible before interacting
  try {
    await page.waitForSelector(usernameSelector, { state: 'visible', timeout: 15000 });
  } catch {
    throw new Error(
      `Login failed: username field not found with selector "${auth.usernameSelector}" (resolved: "${usernameSelector}"). ` +
      `Check the selector and make sure it matches a visible element on ${loginUrl}`
    );
  }

  // Fill username
  await page.fill(usernameSelector, auth.usernameValue);

  // Wait for password field
  try {
    await page.waitForSelector(passwordSelector, { state: 'visible', timeout: 10000 });
  } catch {
    throw new Error(
      `Login failed: password field not found with selector "${auth.passwordSelector}" (resolved: "${passwordSelector}"). ` +
      `Check the selector on ${loginUrl}`
    );
  }

  // Fill password
  await page.fill(passwordSelector, auth.passwordValue);

  // Click submit
  if (auth.submitSelector) {
    const submitSelector = await resolveSelector(auth.submitSelector, 'submit');
    await page.waitForSelector(submitSelector, { state: 'visible', timeout: 5000 });
    await page.click(submitSelector);
  } else {
    // Auto-detect: try common submit patterns
    // Small wait so JS-driven forms finish enabling the button
    await page.waitForTimeout(500);

    const submitPatterns = [
      'button[type="submit"]',
      'input[type="submit"]',
      'button:has-text("Login")',
      'button:has-text("Sign in")',
      'button:has-text("Log in")',
      'button:has-text("Submit")',
      'button:has-text("Masuk")',
      'button:has-text("MASUK")',
      'button:has-text("Signin")',
      'button:has-text("Daftar")',
      'button:has-text("Lanjut")',
      'form button',
    ];
    let clicked = false;
    for (const sel of submitPatterns) {
      try {
        const el = page.locator(sel).first();
        if (await el.isVisible({ timeout: 1000 })) {
          await el.click();
          clicked = true;
          break;
        }
      } catch { /* try next */ }
    }
    if (!clicked) {
      // Last resort: press Enter in the password field
      await page.press(passwordSelector, 'Enter');
    }
  }

  // Wait for URL to change away from the login page (works for both full nav and SPA routing)
  const loginPageNorm = loginUrl.split('?')[0].split('#')[0];
  const waitMs = auth.waitAfterLogin ?? 3000;
  try {
    await page.waitForURL(
      url => url.toString().split('?')[0].split('#')[0] !== loginPageNorm,
      { timeout: waitMs + 5000 }
    );
  } catch {
    // URL didn't change — either login failed or very slow — wait a bit more
    await page.waitForTimeout(waitMs);
  }
  logger.info(`[WebScraper] Login complete, current URL: ${page.url()}`);
}

// ─── Main Export ───────────────────────────────────────────────────────────────

export async function scanWebProject(
  url: string,
  config?: unknown,
  auth?: WebAuthConfig,
  onProgress?: ScanProgressCallback,
): Promise<WebElementCatalog> {
  // Validate config
  const validatedConfig = config ? validateScraperConfig(config) : undefined;
  const cfg: Required<ScraperConfig> = { ...DEFAULT_CONFIG, ...validatedConfig };

  logger.info(`[WebScraper] Scanning ${url} with config: ${JSON.stringify(cfg)}${auth ? ' (with auth)' : ''}`);

  const browser: Browser = await chromium.launch({ headless: cfg.headless });
  const viewportSize = { width: cfg.viewport?.width || 1280, height: cfg.viewport?.height || 720 };
  const context = await browser.newContext({ viewport: viewportSize });
  const page = await context.newPage();

  try {
    // Perform login before crawling if auth config is provided
    let postLoginUrl: string | undefined;
    if (auth) {
      onProgress?.({ type: 'login', pageCount: 0, maxPages: cfg.maxPages, pageName: 'Logging in...', pageUrl: auth.loginUrl || url, queueSize: 0 });
      await performLogin(page, url, auth);
      postLoginUrl = page.url();
      // Detect login failure: if still on a /login path, warn
      const isStillOnLoginPage = /\/(login|signin|sign-in|auth)(\/|$|\?)/i.test(postLoginUrl);
      if (isStillOnLoginPage) {
        logger.warn(`[WebScraper] Login may have failed — still at ${postLoginUrl}. Check credentials or submit selector.`);
        postLoginUrl = undefined; // fall back to crawling from baseUrl
      } else {
        logger.info(`[WebScraper] Login succeeded, starting crawl from: ${postLoginUrl}`);
      }
    }

    const pages = await crawlSite(page, url, cfg, postLoginUrl, onProgress);

    // Remove elements that appear on more than 60% of pages — these are global UI elements
    // (persistent modals, layout overlays, "Leave page?" dialogs) that pollute every page.
    if (pages.length >= 3) {
      const threshold = Math.floor(pages.length * 0.6);

      // Count how many pages each button text appears on
      const btnCount = new Map<string, number>();
      for (const p of pages) {
        const seen = new Set(p.buttons.map(b => b.text.toLowerCase().trim()));
        seen.forEach(t => btnCount.set(t, (btnCount.get(t) || 0) + 1));
      }

      // Count how many pages each text element content appears on
      const txtCount = new Map<string, number>();
      for (const p of pages) {
        const seen = new Set(p.texts.map(t => t.text.toLowerCase().trim()));
        seen.forEach(t => txtCount.set(t, (txtCount.get(t) || 0) + 1));
      }

      for (const p of pages) {
        p.buttons = p.buttons.filter(b => (btnCount.get(b.text.toLowerCase().trim()) || 0) <= threshold);
        p.texts = p.texts.filter(t => (txtCount.get(t.text.toLowerCase().trim()) || 0) <= threshold);
      }
      logger.info(`[WebScraper] Cross-page dedup: removed global elements appearing on >${threshold} pages`);
    }

    const catalog: WebElementCatalog = {
      baseUrl: url,
      scannedAt: new Date().toISOString(),
      pages,
      inputs: pages.flatMap(p => p.inputs),
      buttons: pages.flatMap(p => p.buttons),
      texts: pages.flatMap(p => p.texts),
      links: pages.flatMap(p => p.links),
      routes: pages.map(p => p.url),
    };

    logger.info(`[WebScraper] Found ${pages.length} pages, ${catalog.inputs.length} inputs, ${catalog.buttons.length} buttons, ${catalog.texts.length} texts`);
    return catalog;
  } finally {
    await context.close();
    await browser.close();
  }
}
