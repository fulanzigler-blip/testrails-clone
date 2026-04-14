import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { chromium, Browser, Page } from 'playwright';
import { smartLocate, smartClick, smartFill, smartAssert, type LocatorContext } from './smart-locator';

describe('Smart Locator', () => {
  let browser: Browser;
  let page: Page;

  beforeAll(async () => {
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    page = await context.newPage();
  });

  afterAll(async () => {
    await browser.close();
  });

  describe('smartLocate fallback chain', () => {
    it('should find element by exact CSS selector', async () => {
      await page.setContent(`
        <html>
          <body>
            <button id="submit-btn" data-testid="submit">Submit</button>
          </body>
        </html>
      `);

      const result = await smartLocate(page, { selector: '#submit-btn' });
      expect(result.strategy).toBe('exact-selector');
      expect(result.selector).toBe('#submit-btn');
      expect(result.locator).not.toBeNull();
    });

    it('should fall back to data-testid when exact selector fails', async () => {
      await page.setContent(`
        <html>
          <body>
            <button data-testid="login-btn">Login</button>
          </body>
        </html>
      `);

      const result = await smartLocate(page, {
        selector: '#does-not-exist [data-testid="login-btn"]', // Invalid selector
      });

      // Should find via data-testid fallback
      expect(result.locator).not.toBeNull();
    });

    it('should find element by role and name', async () => {
      await page.setContent(`
        <html>
          <body>
            <button>Submit Form</button>
          </body>
        </html>
      `);

      const result = await smartLocate(page, { role: 'button', text: 'Submit Form' });
      expect(result.strategy).toBe('getByRole+name');
      expect(result.locator).not.toBeNull();
    });

    it('should find input by label', async () => {
      await page.setContent(`
        <html>
          <body>
            <label for="email">Email Address</label>
            <input id="email" type="email" />
          </body>
        </html>
      `);

      const result = await smartLocate(page, { label: 'Email Address' });
      expect(result.strategy).toBe('getByLabel');
      expect(result.locator).not.toBeNull();
    });

    it('should find input by placeholder', async () => {
      await page.setContent(`
        <html>
          <body>
            <input type="text" placeholder="Enter your name" />
          </body>
        </html>
      `);

      const result = await smartLocate(page, { placeholder: 'Enter your name' });
      expect(result.strategy).toBe('getByPlaceholder');
      expect(result.locator).not.toBeNull();
    });

    it('should find element by tag and has-text', async () => {
      await page.setContent(`
        <html>
          <body>
            <button>Click Me</button>
          </body>
        </html>
      `);

      const result = await smartLocate(page, { tag: 'button', text: 'Click Me' });
      expect(result.strategy).toBe('button:has-text');
      expect(result.locator).not.toBeNull();
    });

    it('should use fallback selectors when provided', async () => {
      await page.setContent(`
        <html>
          <body>
            <button class="primary-btn">Submit</button>
          </body>
        </html>
      `);

      const result = await smartLocate(page, {
        selector: '#invalid-id',
        fallbackSelectors: ['.primary-btn', 'button.primary'],
      });

      expect(result.strategy).toBe('fallback-selector');
      expect(result.selector).toBe('.primary-btn');
      expect(result.locator).not.toBeNull();
    });

    it('should find element by text anywhere as last resort', async () => {
      await page.setContent(`
        <html>
          <body>
            <div>Hello World</div>
          </body>
        </html>
      `);

      const result = await smartLocate(page, { text: 'Hello World' });
      expect(result.strategy).toBe('text-anywhere');
      expect(result.locator).not.toBeNull();
    });

    it('should return null when all strategies fail', async () => {
      await page.setContent('<html><body><div>Empty page</div></body></html>');

      const result = await smartLocate(page, {
        selector: '#does-not-exist',
        text: 'This text does not exist anywhere',
      });

      expect(result.strategy).toBe('failed');
      expect(result.locator).toBeNull();
    });
  });

  describe('smartClick', () => {
    it('should click element successfully', async () => {
      let clicked = false;
      await page.setContent(`
        <html>
          <body>
            <button id="test-btn">Click Me</button>
            <script>
              document.getElementById('test-btn').addEventListener('click', () => {
                window.clicked = true;
              });
            </script>
          </body>
        </html>
      `);

      const result = await smartClick(page, { selector: '#test-btn' });
      expect(result.success).toBe(true);
      expect(result.strategy).toBe('exact-selector');
    });

    it('should retry on failure and succeed with fallback', async () => {
      await page.setContent(`
        <html>
          <body>
            <button data-testid="submit">Submit</button>
          </body>
        </html>
      `);

      // First selector doesn't exist, but fallback does
      const result = await smartClick(page, {
        selector: '#invalid',
        fallbackSelectors: ['[data-testid="submit"]'],
      }, { retries: 2, timeout: 5000 });

      expect(result.success).toBe(true);
      expect(result.strategy).toBe('fallback-selector');
    });

    it('should fail after all retries exhausted', async () => {
      await page.setContent('<html><body><div>No buttons here</div></body></html>');

      const result = await smartClick(page, {
        text: 'Does not exist',
      }, { retries: 1, timeout: 2000 });

      expect(result.success).toBe(false);
      expect(result.strategy).toBe('all-failed');
      expect(result.error).toBeDefined();
    });
  });

  describe('smartFill', () => {
    it('should fill input field successfully', async () => {
      await page.setContent(`
        <html>
          <body>
            <input id="email" type="email" />
          </body>
        </html>
      `);

      const result = await smartFill(page, { selector: '#email' }, 'test@example.com');
      expect(result.success).toBe(true);

      const value = await page.locator('#email').inputValue();
      expect(value).toBe('test@example.com');
    });

    it('should retry and fill with fallback selector', async () => {
      await page.setContent(`
        <html>
          <body>
            <input name="username" type="text" />
          </body>
        </html>
      `);

      const result = await smartFill(page, {
        selector: '#invalid',
        fallbackSelectors: ['[name="username"]'],
      }, 'testuser', { retries: 1 });

      expect(result.success).toBe(true);

      const value = await page.locator('[name="username"]').inputValue();
      expect(value).toBe('testuser');
    });
  });

  describe('smartAssert', () => {
    it('should assert element is visible', async () => {
      await page.setContent(`
        <html>
          <body>
            <div id="visible">Visible content</div>
          </body>
        </html>
      `);

      const result = await smartAssert(page, { selector: '#visible' }, 'visible');
      expect(result.success).toBe(true);
    });

    it('should assert element is hidden', async () => {
      await page.setContent(`
        <html>
          <body>
            <div id="hidden" style="display: none;">Hidden content</div>
          </body>
        </html>
      `);

      const result = await smartAssert(page, { selector: '#hidden' }, 'hidden');
      expect(result.success).toBe(true);
    });

    it('should pass "hidden" assertion when element not found', async () => {
      await page.setContent('<html><body><div>No such element</div></body></html>');

      const result = await smartAssert(page, { selector: '#does-not-exist' }, 'hidden');
      expect(result.success).toBe(true);
      expect(result.strategy).toBe('not-found-is-hidden');
    });

    it('should assert element contains text', async () => {
      await page.setContent(`
        <html>
          <body>
            <div id="content">This is a long text with important information</div>
          </body>
        </html>
      `);

      const result = await smartAssert(
        page,
        { selector: '#content' },
        'has-text',
        'important information'
      );

      expect(result.success).toBe(true);
    });

    it('should fail when text assertion does not match', async () => {
      await page.setContent(`
        <html>
          <body>
            <div id="content">This is different text</div>
          </body>
        </html>
      `);

      const result = await smartAssert(
        page,
        { selector: '#content' },
        'has-text',
        'expected text'
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('does not contain');
    });
  });

  describe('edge cases and error handling', () => {
    it('should handle timeout gracefully', async () => {
      // Page with delayed rendering
      await page.setContent(`
        <html>
          <body>
            <script>
              setTimeout(() => {
                document.body.innerHTML = '<button id="delayed">Delayed Button</button>';
              }, 5000);
            </script>
          </body>
        </html>
      `);

      const result = await smartLocate(page, { selector: '#delayed' }, 1000);
      expect(result.locator).toBeNull();
      expect(result.strategy).toBe('failed');
    });

    it('should handle empty context gracefully', async () => {
      await page.setContent('<html><body><div>Content</div></body></html>');

      const result = await smartLocate(page, {});
      expect(result.strategy).toBe('failed');
      expect(result.locator).toBeNull();
    });

    it('should handle special characters in text selectors', async () => {
      await page.setContent(`
        <html>
          <body>
            <button>Click & Submit "Now"</button>
          </body>
        </html>
      `);

      const result = await smartLocate(page, { tag: 'button', text: 'Click & Submit "Now"' });
      expect(result.locator).not.toBeNull();
    });
  });
});
