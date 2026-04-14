import { chromium, Browser, BrowserContext, Page } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';
import logger from '../utils/logger';

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface WebTestStep {
  id: string;
  type: 'tap' | 'enter_text' | 'navigate' | 'assert_visible' | 'assert_not_visible' | 'assert_text' | 'wait' | 'screenshot' | 'set_viewport' | 'hover' | 'select' | 'check' | 'uncheck' | 'press_key';
  elementId?: string;
  selector?: string;
  value?: string;
  value2?: string;
  text?: string;
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
      const selector = step.selector || step.value || '';
      logs.push(`Clicking: ${selector}`);
      // Wait for element to be visible first
      try {
        await page.locator(selector).waitFor({ state: 'visible', timeout: 10000 });
      } catch {
        logs.push(`  → Element not found, trying alternative...`);
      }
      const locator = page.locator(selector).first();
      const count = await locator.count();
      if (count === 0) {
        throw new Error(`Element "${selector}" not found on page`);
      }
      await locator.click({ timeout: 5000 });
      await page.waitForTimeout(300);
      logs.push(`  → Clicked`);
      break;
    }

    case 'enter_text': {
      const selector = step.selector || '';
      const value = step.value || '';
      logs.push(`Entering "${value}" into: ${selector}`);
      await page.locator(selector).click({ timeout: 10000 });
      await page.locator(selector).fill(value, { timeout: 10000 });
      logs.push(`  → Filled`);
      break;
    }

    case 'hover': {
      const selector = step.selector || step.value || '';
      logs.push(`Hovering: ${selector}`);
      await page.locator(selector).hover({ timeout: 10000 });
      logs.push(`  → Hovered`);
      break;
    }

    case 'select': {
      const selector = step.selector || '';
      const value = step.value || '';
      logs.push(`Selecting "${value}" from: ${selector}`);
      await page.locator(selector).selectOption(value, { timeout: 10000 });
      logs.push(`  → Selected`);
      break;
    }

    case 'check': {
      const selector = step.selector || step.value || '';
      logs.push(`Checking: ${selector}`);
      await page.locator(selector).check({ timeout: 10000 });
      logs.push(`  → Checked`);
      break;
    }

    case 'uncheck': {
      const selector = step.selector || step.value || '';
      logs.push(`Unchecking: ${selector}`);
      await page.locator(selector).uncheck({ timeout: 10000 });
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
      const selector = step.selector || step.value || '';
      logs.push(`Asserting visible: ${selector}`);
      const locator = page.locator(selector);
      const isVisible = await locator.first().isVisible({ timeout: 10000 });
      if (!isVisible) throw new Error(`Assertion failed: "${selector}" is not visible`);
      logs.push(`  → Visible ✓`);
      break;
    }

    case 'assert_not_visible': {
      const selector = step.selector || step.value || '';
      logs.push(`Asserting not visible: ${selector}`);
      const locator = page.locator(selector);
      const count = await locator.count();
      if (count > 0) {
        const isVisible = await locator.first().isVisible();
        if (isVisible) throw new Error(`Assertion failed: "${selector}" is visible but should be hidden`);
      }
      logs.push(`  → Not visible ✓`);
      break;
    }

    case 'assert_text': {
      const selector = step.selector || '';
      const expectedText = step.text || step.value || '';
      logs.push(`Asserting text contains: "${expectedText}"`);
      const locator = page.locator(selector || 'body');
      const text = await locator.first().textContent({ timeout: 10000 });
      if (!text?.includes(expectedText)) {
        throw new Error(`Assertion failed: text "${text?.slice(0, 100)}" does not contain "${expectedText}"`);
      }
      logs.push(`  → Text found ✓`);
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
): Promise<WebTestResult> {
  const startTime = Date.now();
  const outputDir = ensureOutputDir();
  const logs: string[] = ['=== Web Test Run ===', ''];

  let browser: Browser | null = null;
  let context: BrowserContext | null = null;
  let page: Page | null = null;

  try {
    browser = await chromium.launch({ headless: true });
    context = await browser.newContext({
      viewport: { width: 1280, height: 720 },
      recordVideo: { dir: outputDir },
    });
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
): string {
  const lines: string[] = [
    `import { test, expect } from '@playwright/test';`,
    '',
    `test('Web Test', async ({ page }) => {`,
  ];

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
