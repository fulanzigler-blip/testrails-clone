import { chromium, devices, Browser, BrowserContext, Page } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';
import logger from '../utils/logger';
import { smartLocate, LocatorContext } from './smart-locator';

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface WebTestStep {
  id: string;
  type: 'tap' | 'enter_text' | 'navigate' | 'assert_visible' | 'assert_not_visible' | 'assert_text' | 'wait' | 'screenshot' | 'set_viewport' | 'hover' | 'select' | 'check' | 'uncheck' | 'press_key';
  elementId?: string;
  selector?: string;
  value?: string;
  value2?: string;
  text?: string;
  // Extended locator data from scraper
  role?: string;
  label?: string;
  placeholder?: string;
  tag?: string;
}

export interface WebTestResult {
  success: boolean;
  output: string;
  duration: number;
  screenshots: string[];
}

// ─── Test Runner ───────────────────────────────────────────────────────────────

const OUTPUT_DIR = path.join(__dirname, '../../uploads/web-test-results');

function ensureOutputDir(): string {
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }
  const runDir = path.join(OUTPUT_DIR, `run_${Date.now()}`);
  fs.mkdirSync(runDir, { recursive: true });
  return runDir;
}

/**
 * Build LocatorContext from a test step + element metadata.
 */
function buildLocatorCtx(step: WebTestStep): LocatorContext {
  return {
    selector: step.selector,
    role: step.role,
    text: step.text || step.value,
    label: step.label,
    placeholder: step.placeholder,
    tag: step.tag,
  };
}

async function executeStep(
  page: Page,
  step: WebTestStep,
  outputDir: string,
  stepIndex: number,
): Promise<string> {
  const logs: string[] = [];

  switch (step.type) {
    case 'navigate': {
      const url = step.value || step.text || '';
      logs.push(`Navigating to: ${url}`);
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(500);
      logs.push(`  → Loaded: ${page.url()}`);
      break;
    }

    case 'tap': {
      const ctx = buildLocatorCtx(step);
      logs.push(`Clicking: ${ctx.selector || ctx.text || 'unknown'}`);
      const result = await smartLocate(page, ctx);
      if (!result.locator) throw new Error(`Element not found. Tried: ${ctx.selector || ctx.text}`);
      logs.push(`  → Found via: ${result.strategy} ("${result.selector}")`);
      await result.locator.click({ timeout: 5000 });
      await page.waitForTimeout(300);
      logs.push(`  → Clicked`);
      break;
    }

    case 'enter_text': {
      const ctx = buildLocatorCtx(step);
      logs.push(`Entering "${step.value || ''}" into: ${ctx.selector || ctx.label || ctx.placeholder || 'unknown'}`);
      const result = await smartLocate(page, ctx);
      if (!result.locator) throw new Error(`Input not found. Tried: ${ctx.selector || ctx.label || ctx.placeholder}`);
      logs.push(`  → Found via: ${result.strategy} ("${result.selector}")`);
      await result.locator.click();
      await result.locator.fill(step.value || '', { timeout: 5000 });
      logs.push(`  → Filled`);
      break;
    }

    case 'hover': {
      const ctx = buildLocatorCtx(step);
      logs.push(`Hovering: ${ctx.selector || ctx.text || 'unknown'}`);
      const result = await smartLocate(page, ctx);
      if (!result.locator) throw new Error(`Element not found. Tried: ${ctx.selector || ctx.text}`);
      await result.locator.hover({ timeout: 5000 });
      logs.push(`  → Hovered`);
      break;
    }

    case 'select': {
      const ctx = buildLocatorCtx(step);
      logs.push(`Selecting "${step.value || ''}" from: ${ctx.selector || 'unknown'}`);
      const result = await smartLocate(page, ctx);
      if (!result.locator) throw new Error(`Dropdown not found. Tried: ${ctx.selector}`);
      await result.locator.selectOption(step.value || '', { timeout: 5000 });
      logs.push(`  → Selected`);
      break;
    }

    case 'check': {
      const ctx = buildLocatorCtx(step);
      logs.push(`Checking: ${ctx.selector || ctx.label || 'unknown'}`);
      const result = await smartLocate(page, ctx);
      if (!result.locator) throw new Error(`Checkbox not found. Tried: ${ctx.selector || ctx.label}`);
      await result.locator.check({ timeout: 5000 });
      logs.push(`  → Checked`);
      break;
    }

    case 'uncheck': {
      const ctx = buildLocatorCtx(step);
      logs.push(`Unchecking: ${ctx.selector || ctx.label || 'unknown'}`);
      const result = await smartLocate(page, ctx);
      if (!result.locator) throw new Error(`Checkbox not found. Tried: ${ctx.selector || ctx.label}`);
      await result.locator.uncheck({ timeout: 5000 });
      logs.push(`  → Unchecked`);
      break;
    }

    case 'press_key': {
      const key = step.value || step.text || '';
      logs.push(`Pressing key: ${key}`);
      await page.keyboard.press(key);
      await page.waitForTimeout(300);
      logs.push(`  → Key pressed`);
      break;
    }

    case 'assert_visible': {
      const ctx = buildLocatorCtx(step);
      logs.push(`Asserting visible: ${ctx.selector || ctx.text || 'unknown'}`);
      const result = await smartLocate(page, ctx);
      if (!result.locator) throw new Error(`Element not found for assertion. Tried: ${ctx.selector || ctx.text}`);
      await result.locator.first().waitFor({ state: 'visible', timeout: 10000 });
      logs.push(`  → Visible ✓ (via ${result.strategy})`);
      break;
    }

    case 'assert_not_visible': {
      const ctx = buildLocatorCtx(step);
      logs.push(`Asserting not visible: ${ctx.selector || ctx.text || 'unknown'}`);
      const result = await smartLocate(page, { ...ctx }, 3000);
      if (!result.locator) {
        logs.push(`  → Not visible ✓ (not found)`);
      } else {
        const isVisible = await result.locator.first().isVisible().catch(() => false);
        if (isVisible) throw new Error(`Element "${ctx.selector || ctx.text}" is visible but should be hidden`);
        logs.push(`  → Not visible ✓ (found but hidden)`);
      }
      break;
    }

    case 'assert_text': {
      const ctx = buildLocatorCtx(step);
      const expectedText = step.text || step.value || '';
      logs.push(`Asserting text contains: "${expectedText}"`);
      // If selector provided, assert on that element; otherwise assert on body
      let result: any;
      if (ctx.selector) {
        result = await smartLocate(page, ctx);
        if (!result.locator) throw new Error(`Element not found for text assertion. Tried: ${ctx.selector}`);
      } else {
        result = { locator: page.locator('body'), strategy: 'body', selector: 'body' };
      }
      const text = await result.locator.first().textContent({ timeout: 10000 });
      if (!text?.includes(expectedText)) {
        throw new Error(`Text "${text?.slice(0, 100)}" does not contain "${expectedText}"`);
      }
      logs.push(`  → Text found ✓ (via ${result.strategy})`);
      break;
    }

    case 'wait': {
      const ms = parseInt(step.value || '1000');
      logs.push(`Waiting ${ms}ms`);
      await page.waitForTimeout(ms);
      break;
    }

    case 'screenshot': {
      const name = step.value || `step_${stepIndex}`;
      const screenshotPath = path.join(outputDir, `${name}.png`);
      logs.push(`Taking screenshot: ${screenshotPath}`);
      await page.screenshot({ path: screenshotPath, fullPage: true });
      logs.push(`  → Saved`);
      break;
    }

    case 'set_viewport': {
      const width = parseInt(step.value || '1280');
      const height = parseInt(step.value2 || '720');
      logs.push(`Setting viewport: ${width}x${height}`);
      await page.setViewportSize({ width, height });
      break;
    }

    default:
      logs.push(`Unknown step type: ${step.type}`);
  }

  return logs.join('\n');
}

export async function runWebTest(
  steps: WebTestStep[],
  baseUrl?: string,
  device?: string,
): Promise<WebTestResult> {
  const startTime = Date.now();
  const outputDir = ensureOutputDir();
  const logs: string[] = ['=== Web Test Run ===', ''];

  if (device) {
    logs.push(`Device: ${device}`);
  }
  logs.push('');

  let browser: Browser | null = null;
  let context: BrowserContext | null = null;
  let page: Page | null = null;

  try {
    browser = await chromium.launch({ headless: true });

    // Apply device emulation if specified
    if (device && devices[device]) {
      const deviceConfig = devices[device];
      logs.push(`→ Using Playwright device preset: ${device}`);
      logs.push(`  Viewport: ${deviceConfig.viewport?.width}x${deviceConfig.viewport?.height}`);
      logs.push(`  User Agent: ${deviceConfig.userAgent?.slice(0, 80)}...`);
      logs.push('');
      context = await browser.newContext({
        ...deviceConfig,
        recordVideo: { dir: outputDir },
      });
    } else if (device) {
      // Custom viewport format: "widthxheight"
      const match = device.match(/^(\d+)x(\d+)$/);
      if (match) {
        const w = parseInt(match[1]);
        const h = parseInt(match[2]);
        logs.push(`→ Using custom viewport: ${w}x${h}`);
        logs.push('');
        context = await browser.newContext({
          viewport: { width: w, height: h },
          recordVideo: { dir: outputDir },
        });
      } else {
        logs.push(`→ Unknown device: ${device} (using default desktop)`);
        logs.push('');
        context = await browser.newContext({
          viewport: { width: 1280, height: 720 },
          recordVideo: { dir: outputDir },
        });
      }
    } else {
      // Default desktop
      context = await browser.newContext({
        viewport: { width: 1280, height: 720 },
        recordVideo: { dir: outputDir },
      });
    }
    page = await context.newPage();

    // Capture console logs (filter out analytics/tracking noise)
    const ignorePatterns = [
      'analytics.google.com', 'stats.g.doubleclick.net', 'connect.facebook.net',
      'google-analytics.com', 'region1.analytics', 'ga-audiences',
      'Failed to load resource',
    ];
    page.on('console', msg => {
      const text = msg.text();
      if (ignorePatterns.some(p => text.includes(p))) return;
      logs.push(`  [Console] ${msg.type()}: ${text.slice(0, 200)}`);
    });

    // Auto-navigate to baseUrl if first step isn't navigate
    if (steps.length === 0 || steps[0].type !== 'navigate') {
      if (baseUrl) {
        logs.push(`── Auto-navigate to: ${baseUrl} ──`);
        await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
        await page.waitForTimeout(1000);
        logs.push(`  → Loaded: ${page.url()}`);
        logs.push('');
      }
    }

    logs.push(`Steps: ${steps.length}`);
    logs.push(`Output: ${outputDir}`);
    logs.push('');

    const screenshots: string[] = [];

    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      logs.push(`── Step ${i + 1}: ${step.type} ──`);

      try {
        const stepLog = await executeStep(page!, step, outputDir, i);
        logs.push(stepLog);
      } catch (err: any) {
        logs.push(`  ❌ ERROR: ${err.message}`);

        // Try to capture available elements for debugging
        try {
          const availableElements = await page!.evaluate(() => {
            const buttons = Array.from(globalThis.document.querySelectorAll('button, [role="button"]'))
              .map((el: any) => ({
                tag: el.tagName,
                text: el.textContent?.trim().slice(0, 60),
                id: el.id || '',
                selector: el.id ? `#${el.id}` : `${el.tagName.toLowerCase()}`,
              }))
              .slice(0, 20);

            const inputs = Array.from(globalThis.document.querySelectorAll('input, textarea, select'))
              .map((el: any) => ({
                tag: el.tagName,
                type: el.type,
                id: el.id || '',
                name: el.name || '',
                placeholder: el.placeholder || '',
              }))
              .slice(0, 15);

            return { buttons, inputs };
          });

          if (availableElements.buttons.length > 0) {
            logs.push('  → Available buttons on page:');
            availableElements.buttons.forEach((b: any) => {
              logs.push(`    - ${b.tag} "${b.text}" ${b.id ? `(id=${b.id})` : ''} ${b.selector ? `→ ${b.selector}` : ''}`);
            });
          }
          if (availableElements.inputs.length > 0) {
            logs.push('  → Available inputs on page:');
            availableElements.inputs.forEach((inp: any) => {
              logs.push(`    - ${inp.tag}[${inp.type}] ${inp.id ? `(id=${inp.id})` : ''} ${inp.name ? `(name=${inp.name})` : ''} "${inp.placeholder}"`);
            });
          }
        } catch {
          // Page might be in bad state, skip element listing
        }

        // Take error screenshot
        const errorScreenshot = path.join(outputDir, `error_step_${i + 1}.png`);
        try {
          await page!.screenshot({ path: errorScreenshot, fullPage: true });
          logs.push(`  → Error screenshot saved`);
          screenshots.push(errorScreenshot);
        } catch {}

        logs.push('');
        logs.push(`=== Test FAILED at step ${i + 1} ===`);

        return {
          success: false,
          output: logs.join('\n'),
          duration: Date.now() - startTime,
          screenshots,
        };
      }

      logs.push('');
    }

    // Final screenshot
    const finalScreenshot = path.join(outputDir, 'final.png');
    await page!.screenshot({ path: finalScreenshot, fullPage: true });
    screenshots.push(finalScreenshot);

    logs.push('=== Test PASSED ===');

    return {
      success: true,
      output: logs.join('\n'),
      duration: Date.now() - startTime,
      screenshots,
    };
  } catch (err: any) {
    logs.push(`FATAL ERROR: ${err.message}`);
    logs.push(`=== Test FAILED ===`);

    return {
      success: false,
      output: logs.join('\n'),
      duration: Date.now() - startTime,
      screenshots: [],
    };
  } finally {
    if (context) await context.close();
    if (browser) await browser.close();
  }
}

// ─── Code Generator ────────────────────────────────────────────────────────────

export function generatePlaywrightCode(
  steps: WebTestStep[],
  baseUrl?: string,
  device?: string,
): string {
  const lines: string[] = [
    `import { test, expect, devices } from '@playwright/test';`,
    '',
  ];

  // Device config
  if (device) {
    lines.push(`// Device: ${device}`);
    lines.push(`export const test = test.extend({`);
    lines.push(`  context: async ({ browser }, use) => {`);
    if (devices[device as any]) {
      lines.push(`    const context = await browser.newContext({ ...devices['${device}'] });`);
    } else {
      const match = device?.match(/^(\d+)x(\d+)$/);
      if (match) {
        lines.push(`    const context = await browser.newContext({ viewport: { width: ${match[1]}, height: ${match[2]} } });`);
      } else {
        lines.push(`    const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });`);
      }
    }
    lines.push(`    await use(context);`);
    lines.push(`    await context.close();`);
    lines.push(`  },`);
    lines.push(`});`);
    lines.push('');
  }

  lines.push(`test('Web Test', async ({ page }) => {`);

  // Add base URL if provided
  if (baseUrl) {
    lines.push(`  // Base URL: ${baseUrl}`);
  }
  lines.push('');

  for (const step of steps) {
    switch (step.type) {
      case 'navigate':
        lines.push(`  // Navigate to URL`);
        lines.push(`  await page.goto('${step.value || step.text || baseUrl || ''}');`);
        break;

      case 'tap':
        lines.push(`  // Click element`);
        lines.push(`  await page.locator('${step.selector || step.value || ''}').click();`);
        break;

      case 'enter_text':
        lines.push(`  // Enter text`);
        lines.push(`  await page.locator('${step.selector || ''}').fill('${step.value || ''}');`);
        break;

      case 'hover':
        lines.push(`  // Hover element`);
        lines.push(`  await page.locator('${step.selector || step.value || ''}').hover();`);
        break;

      case 'select':
        lines.push(`  // Select option`);
        lines.push(`  await page.locator('${step.selector || ''}').selectOption('${step.value || ''}');`);
        break;

      case 'check':
        lines.push(`  // Check checkbox`);
        lines.push(`  await page.locator('${step.selector || step.value || ''}').check();`);
        break;

      case 'uncheck':
        lines.push(`  // Uncheck checkbox`);
        lines.push(`  await page.locator('${step.selector || step.value || ''}').uncheck();`);
        break;

      case 'press_key':
        lines.push(`  // Press key`);
        lines.push(`  await page.keyboard.press('${step.value || step.text || ''}');`);
        break;

      case 'assert_visible':
        lines.push(`  // Assert visible`);
        lines.push(`  await expect(page.locator('${step.selector || step.value || ''}')).toBeVisible();`);
        break;

      case 'assert_not_visible':
        lines.push(`  // Assert not visible`);
        lines.push(`  await expect(page.locator('${step.selector || step.value || ''}')).toBeHidden();`);
        break;

      case 'assert_text':
        lines.push(`  // Assert text contains`);
        if (step.selector) {
          lines.push(`  await expect(page.locator('${step.selector}')).toContainText('${step.text || step.value || ''}');`);
        } else {
          lines.push(`  await expect(page.locator('body')).toContainText('${step.text || step.value || ''}');`);
        }
        break;

      case 'wait':
        lines.push(`  // Wait`);
        lines.push(`  await page.waitForTimeout(${parseInt(step.value || '1000')});`);
        break;

      case 'screenshot':
        lines.push(`  // Take screenshot`);
        lines.push(`  await page.screenshot({ path: '${step.value || 'screenshot'}.png', fullPage: true });`);
        break;

      case 'set_viewport':
        lines.push(`  // Set viewport`);
        lines.push(`  await page.setViewportSize({ width: ${parseInt(step.value || '1280')}, height: ${parseInt(step.value2 || '720')} });`);
        break;
    }
    lines.push('');
  }

  lines.push('});');
  lines.push('');

  return lines.join('\n');
}
