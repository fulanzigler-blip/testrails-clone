import { chromium, Browser, Page } from 'playwright';
import logger from '../utils/logger';

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
}

export interface WebButtonElement {
  id: string;
  text: string;
  type: string;
  selector: string;
  xpath: string;
  page?: string;
  action?: string;
}

export interface WebTextElement {
  id: string;
  text: string;
  selector: string;
  xpath: string;
  page?: string;
  isStatic: boolean;
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

// ─── Scraper Configuration ─────────────────────────────────────────────────────

export interface ScraperConfig {
  maxPages?: number;
  maxDepth?: number;
  timeout?: number;
  headless?: boolean;
  viewport?: { width: number; height: number };
}

const DEFAULT_CONFIG: Required<ScraperConfig> = {
  maxPages: 20,
  maxDepth: 3,
  timeout: 30000,
  headless: true,
  viewport: { width: 1280, height: 720 },
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

async function extractElementsFromPage(page: Page, pageName: string): Promise<WebPageElement> {
  const elements = await page.evaluate(() => {
    const inputs: Array<{ tag: string; type: string; id: string; name: string; placeholder: string; label: string; ariaLabel: string; selector: string }> = [];
    const buttons: Array<{ tag: string; text: string; type: string; selector: string }> = [];
    const texts: Array<{ text: string; tag: string; selector: string }> = [];
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

      inputs.push({
        tag: input.tagName.toLowerCase(),
        type: input.getAttribute('type') || 'text',
        id: input.id || '',
        name: input.getAttribute('name') || '',
        placeholder: input.getAttribute('placeholder') || '',
        label: label || '',
        ariaLabel: input.getAttribute('aria-label') || '',
        selector: input.id ? `#${input.id}` : `${input.tagName.toLowerCase()}[name="${input.getAttribute('name')}"]`,
      });
    });

    // Extract buttons
    const allButtons = globalThis.document.querySelectorAll('button, [role="button"], input[type="submit"], input[type="button"]');
    allButtons.forEach((el: any) => {
      const btn = el as any;
      const text = btn.textContent?.trim() ||
                   btn.getAttribute('aria-label') ||
                   btn.getAttribute('value') ||
                   'Button';

      // Generate Playwright-friendly selector
      let selector = '';
      if (btn.getAttribute('data-testid')) {
        selector = `[data-testid="${btn.getAttribute('data-testid')}"]`;
      } else if (btn.getAttribute('id')) {
        selector = `#${btn.getAttribute('id')}`;
      } else if (btn.getAttribute('name')) {
        selector = `[name="${btn.getAttribute('name')}"]`;
      } else if (btn.tagName === 'INPUT') {
        selector = `input[type="${btn.getAttribute('type') || 'submit'}"][value="${text.slice(0, 50)}"]`;
      } else {
        // Use role-based selector: button has role="button" by default
        selector = `button:has-text("${text.slice(0, 50)}")`;
      }

      buttons.push({
        tag: btn.tagName.toLowerCase(),
        text: text.slice(0, 100),
        type: btn.getAttribute('type') || 'button',
        selector,
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

      texts.push({
        text: text.slice(0, 200),
        tag: el.tagName.toLowerCase(),
        selector: el.id ? `#${el.id}` : `${el.tagName.toLowerCase()}:has-text("${text.slice(0, 50)}")`,
      });
    });

    // Extract links
    const allLinks = globalThis.document.querySelectorAll('a[href]');
    allLinks.forEach((el: any) => {
      const link = el as any;
      if (!link.href || link.href.startsWith('javascript:') || link.href.startsWith('#')) return;
      const text = link.textContent?.trim() || link.getAttribute('aria-label') || link.href;

      links.push({
        text: text.slice(0, 100),
        href: link.href,
        tag: 'a',
        selector: link.id ? `#${link.id}` : `a:has-text("${text.slice(0, 50)}")`,
      });
    });

    return { inputs, buttons, texts, links };
  });

  const inputs: WebInputElement[] = elements.inputs.map((el, i) => ({
    id: `input_${pageName.toLowerCase().replace(/\s+/g, '_')}_${i}`,
    label: el.label,
    type: el.type,
    selector: el.selector,
    xpath: '', // Will be filled by Playwright
    name: el.name,
    placeholder: el.placeholder,
    page: pageName,
  }));

  const buttons: WebButtonElement[] = elements.buttons.map((el, i) => ({
    id: `btn_${pageName.toLowerCase().replace(/\s+/g, '_')}_${i}`,
    text: el.text,
    type: el.type,
    selector: el.selector,
    xpath: '',
    page: pageName,
    action: el.text.toLowerCase().includes('submit') || el.text.toLowerCase().includes('login') || el.text.toLowerCase().includes('sign')
      ? 'form_submit'
      : undefined,
  }));

  const texts: WebTextElement[] = elements.texts.slice(0, 50).map((el, i) => ({
    id: `text_${pageName.toLowerCase().replace(/\s+/g, '_')}_${i}`,
    text: el.text,
    selector: el.selector,
    xpath: '',
    page: pageName,
    isStatic: true,
  }));

  const links: WebLinkElement[] = elements.links.slice(0, 30).map((el, i) => ({
    id: `link_${pageName.toLowerCase().replace(/\s+/g, '_')}_${i}`,
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
): Promise<WebPageElement[]> {
  const visited = new Set<string>();
  const toVisit: Array<{ url: string; depth: number }> = [{ url: baseUrl, depth: 0 }];
  const pages: WebPageElement[] = [];
  let pageCount = 0;

  while (toVisit.length > 0 && pageCount < config.maxPages) {
    const { url, depth } = toVisit.shift()!;

    // Normalize URL
    const normalizedUrl = url.split('#')[0].split('?')[0];
    if (visited.has(normalizedUrl)) continue;
    if (depth > config.maxDepth) continue;
    if (!normalizedUrl.startsWith(baseUrl.split('#')[0].split('?')[0])) continue;

    visited.add(normalizedUrl);
    pageCount++;

    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: config.timeout });
      await page.waitForTimeout(1000); // Let JS render

      const pageName = await page.title().then(t => t || `Page ${pageCount}`);
      const elements = await extractElementsFromPage(page, pageName);
      pages.push(elements);

      // Find links to crawl
      if (depth < config.maxDepth) {
        const links = await page.evaluate(() => {
          return Array.from(globalThis.document.querySelectorAll('a[href]'))
            .map((a: any) => a.href)
            .filter((href: string) => href && !href.startsWith('javascript:') && !href.startsWith('#') && !href.startsWith('mailto:'));
        });

        for (const link of links) {
          if (!visited.has(link.split('#')[0].split('?')[0]) && link.startsWith(baseUrl)) {
            toVisit.push({ url: link, depth: depth + 1 });
          }
        }
      }
    } catch (err: any) {
      logger.warn(`[WebScraper] Failed to crawl ${url}: ${err.message}`);
    }
  }

  return pages;
}

// ─── Main Export ───────────────────────────────────────────────────────────────

export async function scanWebProject(
  url: string,
  config?: ScraperConfig,
): Promise<WebElementCatalog> {
  const cfg: Required<ScraperConfig> = { ...DEFAULT_CONFIG, ...config };

  logger.info(`[WebScraper] Scanning ${url} with config: ${JSON.stringify(cfg)}`);

  const browser: Browser = await chromium.launch({ headless: cfg.headless });
  const context = await browser.newContext({ viewport: cfg.viewport });
  const page = await context.newPage();

  try {
    const pages = await crawlSite(page, url, cfg);

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
