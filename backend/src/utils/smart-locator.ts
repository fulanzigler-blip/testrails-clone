import { Page, Locator } from 'playwright';

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface LocatorContext {
  selector?: string;
  role?: string;
  text?: string;
  label?: string;
  placeholder?: string;
  tag?: string;
  fallbackSelectors?: string[];
}

export interface SmartLocateResult {
  locator: Locator | null;
  strategy: string;
  selector: string;
}

// ─── Smart Locator Chain ──────────────────────────────────────────────────────

/**
 * Tries multiple selector strategies in order of reliability.
 * Falls back gracefully if primary selector fails.
 */
export async function smartLocate(
  page: Page,
  ctx: LocatorContext,
  timeout: number = 10000,
): Promise<SmartLocateResult> {
  const attempts: Array<{ strategy: string; selector: string }> = [];

  // Strategy 1: Exact selector (if provided and specific)
  if (ctx.selector && !ctx.selector.includes(':has-text')) {
    attempts.push({ strategy: 'exact-selector', selector: ctx.selector });
    try {
      const loc = page.locator(ctx.selector).first();
      await loc.waitFor({ state: 'visible', timeout });
      return { locator: loc, strategy: 'exact-selector', selector: ctx.selector };
    } catch {
      // Continue to next strategy
    }
  }

  // Strategy 2: data-testid (most stable custom selector)
  const testIdMatch = ctx.selector?.match(/\[data-testid="([^"]+)"]/);
  if (testIdMatch) {
    attempts.push({ strategy: 'data-testid', selector: testIdMatch[1] });
    try {
      const loc = page.getByTestId(testIdMatch[1]);
      await loc.waitFor({ state: 'visible', timeout });
      return { locator: loc, strategy: 'data-testid', selector: testIdMatch[1] };
    } catch {}
  }

  // Strategy 3: getByRole (Playwright's most reliable built-in)
  if (ctx.role && ctx.text) {
    attempts.push({ strategy: 'getByRole+name', selector: `role=${ctx.role} name="${ctx.text}"` });
    try {
      const loc = page.getByRole(ctx.role as any, { name: new RegExp(ctx.text, 'i') }).first();
      await loc.waitFor({ state: 'visible', timeout });
      return { locator: loc, strategy: 'getByRole+name', selector: ctx.text };
    } catch {}
  }

  // Strategy 4: getByLabel (for input fields)
  if (ctx.label) {
    attempts.push({ strategy: 'getByLabel', selector: `label="${ctx.label}"` });
    try {
      const loc = page.getByLabel(ctx.label, { exact: false }).first();
      await loc.waitFor({ state: 'visible', timeout });
      return { locator: loc, strategy: 'getByLabel', selector: ctx.label };
    } catch {}
  }

  // Strategy 5: getByPlaceholder
  if (ctx.placeholder) {
    attempts.push({ strategy: 'getByPlaceholder', selector: `placeholder="${ctx.placeholder}"` });
    try {
      const loc = page.getByPlaceholder(ctx.placeholder, { exact: false }).first();
      await loc.waitFor({ state: 'visible', timeout });
      return { locator: loc, strategy: 'getByPlaceholder', selector: ctx.placeholder };
    } catch {}
  }

  // Strategy 6: has-text selector (for buttons/links with known text)
  if (ctx.text && ctx.tag) {
    attempts.push({ strategy: `${ctx.tag}:has-text`, selector: `${ctx.tag}:has-text("${ctx.text}")` });
    try {
      const loc = page.locator(`${ctx.tag}:has-text("${ctx.text}")`).first();
      await loc.waitFor({ state: 'visible', timeout });
      return { locator: loc, strategy: `${ctx.tag}:has-text`, selector: ctx.text };
    } catch {}
  }

  // Strategy 7: Fallback selectors from scraper
  if (ctx.fallbackSelectors) {
    for (const fb of ctx.fallbackSelectors) {
      attempts.push({ strategy: 'fallback-selector', selector: fb });
      try {
        const loc = page.locator(fb).first();
        await loc.waitFor({ state: 'visible', timeout });
        return { locator: loc, strategy: 'fallback-selector', selector: fb };
      } catch {}
    }
  }

  // Strategy 8: :has-text (text anywhere in page)
  if (ctx.text) {
    attempts.push({ strategy: 'text-anywhere', selector: `text="${ctx.text}"` });
    try {
      const loc = page.locator(`:has-text("${ctx.text}")`).first();
      await loc.waitFor({ state: 'visible', timeout });
      return { locator: loc, strategy: 'text-anywhere', selector: ctx.text };
    } catch {}
  }

  // All strategies failed
  return {
    locator: null,
    strategy: 'failed',
    selector: ctx.selector || ctx.text || 'unknown',
  };
}

/**
 * Execute an action with smart locator + retry.
 * If primary locator fails, tries fallback strategies.
 */
export async function smartClick(
  page: Page,
  ctx: LocatorContext,
  options?: { timeout?: number; retries?: number },
): Promise<{ success: boolean; strategy: string; selector: string; error?: string }> {
  const maxRetries = options?.retries ?? 2;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      if (attempt > 0) {
        // Wait before retry (page might be loading)
        await page.waitForTimeout(500 * attempt);
      }

      const result = await smartLocate(page, ctx, options?.timeout ?? 10000);
      if (!result.locator) {
        return { success: false, strategy: 'all-failed', selector: ctx.selector || '', error: `Element not found after trying ${attempt + 1} strategy chain(s)` };
      }

      await result.locator.click({ timeout: 5000 });
      return { success: true, strategy: result.strategy, selector: result.selector };
    } catch (err: any) {
      if (attempt === maxRetries) {
        return { success: false, strategy: 'all-failed', selector: ctx.selector || '', error: err.message };
      }
      // Retry
    }
  }

  return { success: false, strategy: 'all-failed', selector: ctx.selector || '', error: 'Max retries exceeded' };
}

/**
 * Execute fill with smart locator + retry.
 */
export async function smartFill(
  page: Page,
  ctx: LocatorContext,
  value: string,
  options?: { timeout?: number; retries?: number },
): Promise<{ success: boolean; strategy: string; selector: string; error?: string }> {
  const maxRetries = options?.retries ?? 2;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      if (attempt > 0) {
        await page.waitForTimeout(500 * attempt);
      }

      const result = await smartLocate(page, ctx, options?.timeout ?? 10000);
      if (!result.locator) {
        return { success: false, strategy: 'all-failed', selector: ctx.selector || '', error: `Input not found after trying ${attempt + 1} strategy chain(s)` };
      }

      await result.locator.click();
      await result.locator.fill(value, { timeout: 5000 });
      return { success: true, strategy: result.strategy, selector: result.selector };
    } catch (err: any) {
      if (attempt === maxRetries) {
        return { success: false, strategy: 'all-failed', selector: ctx.selector || '', error: err.message };
      }
    }
  }

  return { success: false, strategy: 'all-failed', selector: ctx.selector || '', error: 'Max retries exceeded' };
}

/**
 * Execute assertion with smart locator + retry.
 */
export async function smartAssert(
  page: Page,
  ctx: LocatorContext,
  assertion: 'visible' | 'hidden' | 'has-text',
  expectedText?: string,
  options?: { timeout?: number; retries?: number },
): Promise<{ success: boolean; strategy: string; selector: string; error?: string }> {
  const maxRetries = options?.retries ?? 2;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      if (attempt > 0) {
        await page.waitForTimeout(500 * attempt);
      }

      const result = await smartLocate(page, ctx, options?.timeout ?? 10000);
      if (!result.locator) {
        if (assertion === 'hidden') {
          // If we can't find it and we expect it to be hidden, that's a pass
          return { success: true, strategy: 'not-found-is-hidden', selector: ctx.selector || '' };
        }
        return { success: false, strategy: 'all-failed', selector: ctx.selector || '', error: `Element not found for assertion: ${assertion}` };
      }

      switch (assertion) {
        case 'visible':
          await result.locator.first().waitFor({ state: 'visible', timeout: options?.timeout ?? 5000 });
          break;
        case 'hidden':
          await result.locator.first().waitFor({ state: 'hidden', timeout: options?.timeout ?? 5000 });
          break;
        case 'has-text':
          if (expectedText) {
            const text = await result.locator.first().textContent({ timeout: 5000 });
            if (!text?.includes(expectedText)) {
              throw new Error(`Text "${text?.slice(0, 100)}" does not contain "${expectedText}"`);
            }
          }
          break;
      }

      return { success: true, strategy: result.strategy, selector: result.selector };
    } catch (err: any) {
      if (attempt === maxRetries) {
        return { success: false, strategy: 'all-failed', selector: ctx.selector || '', error: err.message };
      }
    }
  }

  return { success: false, strategy: 'all-failed', selector: ctx.selector || '', error: 'Max retries exceeded' };
}
