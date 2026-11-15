import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';

test.beforeEach(async ({ page }) => {
  await page.route('https://fonts.googleapis.com/**', route => route.fulfill({ contentType: 'text/css', body: '' }));
  if (process.env.PLAYWRIGHT_TAILWIND_CACHE) {
    const tailwind = readFileSync(process.env.PLAYWRIGHT_TAILWIND_CACHE);
    await page.route('https://cdn.tailwindcss.com**', route => route.fulfill({ contentType: 'application/javascript', body: tailwind }));
  }
  await page.goto('/', { waitUntil: 'commit' });
  await page.locator('textarea').fill('# Named document\n\nThe latest document content.');
  await expect(page.locator('.markdown-pages')).toContainText('Named document');
  await expect(page.locator('.markdown-pages')).toHaveAttribute('data-pagination-state', 'ready');
});

test('document name updates the tab title with a safe blank fallback', async ({ page }) => {
  const name = page.getByRole('textbox', { name: 'Document name', exact: true });
  await expect(page).toHaveTitle('DocIT');
  await name.fill('  Quarterly report — résumé  ');
  await expect(page).toHaveTitle('Quarterly report — résumé');
  await name.fill('   ');
  await expect(page).toHaveTitle('DocIT');
  await name.fill('A revised report');
  await expect(page).toHaveTitle('A revised report');
  await name.clear();
  await expect(page).toHaveTitle('DocIT');
});

test('print sees the current title after waiting for diagram layout', async ({ page }) => {
  const name = page.getByRole('textbox', { name: 'Document name', exact: true });
  await name.fill('Original title');
  await page.evaluate(() => {
    const pending = document.createElement('span');
    pending.id = 'pending-test-diagram';
    pending.dataset.diagramState = 'rendering';
    document.getElementById('markdown-source')!.append(pending);
    (window as any).printCalls = [];
    window.print = () => {
      (window as any).printCalls.push({
        title: document.title,
        text: document.querySelector('.markdown-pages')?.textContent,
      });
    };
  });
  await page.locator('button[title="Export as PDF (print)"]').click();
  await expect.poll(() => page.evaluate(() => (window as any).printCalls.length)).toBe(0);
  await name.fill('  Final title  ');
  await expect(page).toHaveTitle('Final title');
  await page.evaluate(() => {
    // A third-party title change must not override the selected print name.
    document.title = 'Unexpected title';
    document.getElementById('pending-test-diagram')!.remove();
  });
  await expect.poll(() => page.evaluate(() => (window as any).printCalls)).toEqual([
    { title: 'Final title', text: expect.stringContaining('The latest document content.') },
  ]);
});

test('mobile document settings share the name used by desktop and printing', async ({ page }) => {
  await page.getByRole('textbox', { name: 'Document name', exact: true }).fill('Desktop draft');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  const name = page.getByRole('textbox', { name: 'Document name', exact: true });
  await expect(name).toHaveValue('Desktop draft');
  await name.fill('Mobile report');
  await expect(page).toHaveTitle('Mobile report');
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await page.evaluate(() => {
    window.print = () => { (window as any).printedTitle = document.title; };
  });
  await page.locator('button[title="Export as PDF (print)"]').click();
  await expect.poll(() => page.evaluate(() => (window as any).printedTitle)).toBe('Mobile report');
  await page.setViewportSize({ width: 1440, height: 1100 });
  await expect(page.getByRole('textbox', { name: 'Document name', exact: true })).toHaveValue('Mobile report');
});
