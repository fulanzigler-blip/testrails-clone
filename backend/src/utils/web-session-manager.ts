import { chromium, Browser, BrowserContext, Page } from 'playwright';
import { randomUUID } from 'crypto';
import logger from './logger';
import { WebAuthConfig, WebPageElement, extractElementsFromPage, performLogin } from './web-element-scraper';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface SessionInfo {
  id: string;
  createdAt: number;
  lastUsed: number;
  currentUrl: string;
  busy: boolean;
}

export interface PageSnapshot {
  url: string;
  title: string;
  screenshot: string;   // base64 PNG
  elements: WebPageElement;
}

// ─── Session store ──────────────────────────────────────────────────────────

const SESSION_TTL_MS = 30 * 60 * 1000;  // 30 minutes idle
const MAX_SESSIONS   = 5;

interface Session {
  id: string;
  browser: Browser;
  context: BrowserContext;
  page: Page;
  createdAt: number;
  lastUsed: number;
  currentUrl: string;
  busy: boolean;
}

const sessions = new Map<string, Session>();

// Periodically close idle sessions
setInterval(async () => {
  const now = Date.now();
  for (const [id, s] of sessions.entries()) {
    if (now - s.lastUsed > SESSION_TTL_MS) {
      logger.info(`[SessionManager] Closing idle session ${id}`);
      await s.browser.close().catch(() => {});
      sessions.delete(id);
    }
  }
}, 5 * 60 * 1000);

// ─── Public API ─────────────────────────────────────────────────────────────

export async function createSession(
  auth?: WebAuthConfig,
  viewport: { width: number; height: number } = { width: 1280, height: 720 },
): Promise<string> {
  // Evict oldest session if at capacity
  if (sessions.size >= MAX_SESSIONS) {
    let oldestId = '';
    let oldestTime = Infinity;
    for (const [id, s] of sessions.entries()) {
      if (s.lastUsed < oldestTime) { oldestTime = s.lastUsed; oldestId = id; }
    }
    if (oldestId) await destroySession(oldestId);
  }

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport });
  const page    = await context.newPage();

  const id = randomUUID();
  const now = Date.now();

  sessions.set(id, {
    id, browser, context, page,
    createdAt: now, lastUsed: now,
    currentUrl: '',
    busy: false,
  });

  if (auth) {
    logger.info(`[SessionManager] Session ${id}: performing pre-login`);
    try {
      await performLogin(page, auth.loginUrl || '', auth);
      sessions.get(id)!.currentUrl = page.url();
    } catch (err: any) {
      await destroySession(id);
      throw new Error(`Login failed: ${err.message}`);
    }
  }

  logger.info(`[SessionManager] Created session ${id}${auth ? ' (authenticated)' : ''}`);
  return id;
}

export async function loadPage(sessionId: string, url: string): Promise<PageSnapshot> {
  const s = sessions.get(sessionId);
  if (!s) throw new Error('Session not found or expired. Please start a new session.');
  if (s.busy) throw new Error('Session is busy — please wait for the current load to finish.');

  s.busy = true;
  s.lastUsed = Date.now();

  try {
    await s.page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await s.page.waitForTimeout(1500);

    const actualUrl = s.page.url();
    const title     = await s.page.title().catch(() => 'Page');
    s.currentUrl    = actualUrl;

    const elements = await extractElementsFromPage(s.page, title || 'Page', actualUrl);

    const screenshotBuf = await s.page.screenshot({ type: 'png', fullPage: true });
    const screenshot    = screenshotBuf.toString('base64');

    logger.info(`[SessionManager] ${sessionId}: loaded "${title}" (${actualUrl}) — ${elements.inputs.length} inputs, ${elements.buttons.length} buttons`);

    return { url: actualUrl, title, screenshot, elements };
  } finally {
    s.busy = false;
  }
}

export async function exportStorageState(sessionId: string): Promise<object | null> {
  const s = sessions.get(sessionId);
  if (!s) return null;
  try {
    const state = await s.context.storageState();
    logger.info(`[SessionManager] Exported storage state from session ${sessionId} (${state.cookies.length} cookies)`);
    return state;
  } catch (err: any) {
    logger.warn(`[SessionManager] Failed to export storage state: ${err.message}`);
    return null;
  }
}

export async function clickAndNavigate(sessionId: string, selector: string): Promise<PageSnapshot> {
  const s = sessions.get(sessionId);
  if (!s) throw new Error('Session not found or expired. Please start a new session.');
  if (s.busy) throw new Error('Session is busy — please wait for the current load to finish.');

  s.busy = true;
  s.lastUsed = Date.now();

  try {
    // Click the element — ignore if not found (may have navigated already)
    await s.page.locator(selector).first().click({ timeout: 5000 }).catch(() => {});

    // Wait for the page to settle after click (SPA navigation or DOM update)
    await s.page.waitForTimeout(1500);
    await s.page.waitForLoadState('domcontentloaded', { timeout: 10000 }).catch(() => {});

    const actualUrl = s.page.url();
    const title     = await s.page.title().catch(() => 'Page');
    s.currentUrl    = actualUrl;

    const elements = await extractElementsFromPage(s.page, title || 'Page', actualUrl);

    const screenshotBuf = await s.page.screenshot({ type: 'png', fullPage: true });
    const screenshot    = screenshotBuf.toString('base64');

    logger.info(`[SessionManager] ${sessionId}: click-navigated to "${title}" (${actualUrl})`);

    return { url: actualUrl, title, screenshot, elements };
  } finally {
    s.busy = false;
  }
}

export async function destroySession(sessionId: string): Promise<void> {
  const s = sessions.get(sessionId);
  if (!s) return;
  await s.browser.close().catch(() => {});
  sessions.delete(sessionId);
  logger.info(`[SessionManager] Destroyed session ${sessionId}`);
}

export function getSessionInfo(sessionId: string): SessionInfo | null {
  const s = sessions.get(sessionId);
  if (!s) return null;
  return {
    id: s.id,
    createdAt: s.createdAt,
    lastUsed: s.lastUsed,
    currentUrl: s.currentUrl,
    busy: s.busy,
  };
}

export function listSessions(): SessionInfo[] {
  return Array.from(sessions.values()).map(s => ({
    id: s.id,
    createdAt: s.createdAt,
    lastUsed: s.lastUsed,
    currentUrl: s.currentUrl,
    busy: s.busy,
  }));
}
