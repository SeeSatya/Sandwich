import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';

const showcase = readFileSync(new URL('./fixtures/text-controls.md', import.meta.url), 'utf8');

test.beforeEach(async ({ page }) => {
  await page.route('https://fonts.googleapis.com/**', route => route.fulfill({ contentType: 'text/css', body: '' }));
  if (process.env.PLAYWRIGHT_TAILWIND_CACHE) {
    const tailwind = readFileSync(process.env.PLAYWRIGHT_TAILWIND_CACHE);
    await page.route('https://cdn.tailwindcss.com**', route => route.fulfill({ contentType: 'application/javascript', body: tailwind }));
  }
  await page.goto('/', { waitUntil: 'commit' });
  await page.locator('textarea').waitFor({ timeout: 60_000 });
});

const fill = async (page: Page, content: string) => {
  const previous = await page.locator('#markdown-source').innerHTML();
  await page.locator('textarea').fill(content);
  await expect.poll(() => page.locator('#markdown-source').innerHTML()).not.toBe(previous);
  await expect(page.locator('.markdown-pages')).toHaveAttribute('data-pagination-state', 'ready');
};

test('manual page breaks create three real sheets and suppress empty edge/consecutive sheets', async ({ page }) => {
  await fill(page, showcase);
  const pages = page.locator('.markdown-pages > .page');
  await expect(pages).toHaveCount(3);
  await expect(pages.nth(0).locator('h1')).toHaveText('Document layout controls');
  await expect(pages.nth(1).locator('h1')).toHaveText('Aligned and formatted text');
  await expect(pages.nth(2).locator('h1')).toHaveText('Structured content');
  expect(await pages.evaluateAll(nodes => nodes.every(node => {
    const content = node.querySelector('.page-content')!;
    return Math.abs(content.firstElementChild!.getBoundingClientRect().top - content.getBoundingClientRect().top) < 1;
  }))).toBe(true);
  await expect(page.locator('.markdown-pages [data-md-pagebreak]')).toHaveCount(0);
  await page.locator('textarea').fill('[pagebreak]\n\n[pagebreak]');
  await expect(page.locator('#markdown-source [data-md-pagebreak]')).toHaveCount(2);
  await expect(pages).toHaveCount(0);
});

test('empty HTML around manual breaks cannot create blank preview or PDF sheets', async ({ page }) => {
  await fill(page, '<div></div>\n\n[pagebreak]\n\n<div><span></span></div>\n\n[pagebreak]\n\n# Real content\n\n[pagebreak]\n\n<div></div>\n\n[pagebreak]\n\n<section> </section>');
  const pages = page.locator('.markdown-pages > .page');
  await expect(pages).toHaveCount(1);
  await expect(pages.locator('.page-content > :first-child')).toHaveText('Real content');
  await page.emulateMedia({ media: 'print' });
  const pdf = await page.pdf({ preferCSSPageSize: true, printBackground: true });
  expect(pdf.toString('latin1').match(/\/Type\s*\/Page\b/g)).toHaveLength(1);
  await page.emulateMedia({ media: 'screen' });

  await fill(page, '<div></div>\n\n[pagebreak]\n\n<section><div></div></section>');
  await expect(pages).toHaveCount(0);

  // A graphic and a deliberately painted box are real content even when
  // their textContent is empty, so author-requested breaks must keep them.
  await fill(page, '<svg width="40" height="40"><rect width="40" height="40" fill="red"></rect></svg>\n\n[pagebreak]\n\n<div style="height:40px;background-color:blue"></div>\n\n[pagebreak]\n\n# After visuals');
  await expect(pages).toHaveCount(3);
  await expect(pages.nth(0).locator('svg')).toHaveCount(1);
  await expect(pages.nth(1).locator('.page-content > div')).toHaveCSS('background-color', 'rgb(0, 0, 255)');
  await expect(pages.nth(2).locator('h1')).toHaveText('After visuals');
});

test('one-block text controls preserve Markdown and override all representative themes in print', async ({ page }) => {
  await fill(page, showcase);
  for (const theme of ['Modern Light', 'Midnight', 'Academic Report', 'Pixelize']) {
    await page.locator('[title="Document theme"] select').selectOption({ label: theme });
    await expect(page.locator('.markdown-pages')).toHaveAttribute('data-pagination-state', 'ready');
    const preview = page.locator('.markdown-pages');
    await expect(preview.locator('h1').first()).toHaveCSS('text-align', 'center');
    const announcement = preview.locator('p').filter({ hasText: /^Important highlighted announcement\.$/ });
    await expect(announcement).toHaveCSS('text-align', 'right');
    await expect(announcement.locator('mark')).toHaveCSS('background-color', 'rgb(255, 241, 118)');
    await expect(announcement.locator('mark strong')).toHaveCSS('font-weight', '700');
    await expect(announcement.locator('u')).toHaveCSS('text-decoration-line', 'underline');
    await expect(preview.locator('blockquote p')).toHaveCSS('text-align', 'center');
    await expect(preview.locator('li').first()).toHaveCSS('text-align', 'right');
    await expect(preview.locator('td').first()).toHaveCSS('text-align', 'center');
    await expect(preview.locator('a')).toHaveAttribute('href', 'https://example.com');
    await expect(preview.locator('p').filter({ hasText: /^Normal body text/ })).not.toHaveAttribute('data-md-align');
    await page.emulateMedia({ media: 'print' });
    await expect(announcement).toHaveCSS('text-align', 'right');
    await expect(announcement.locator('mark')).toHaveCSS('background-color', 'rgb(255, 241, 118)');
    await page.emulateMedia({ media: 'screen' });
  }
});

test('unsupported, escaped, nested and code controls remain literal without consuming content', async ({ page }) => {
  const source = '# First\n\n\\[pagebreak]\n\n\\[text - bold] Escaped prefix.\n\n[text - unknown] Unknown prefix.\n\n[align - nowhere]\n\nFollowing paragraph.\n\nBefore [pagebreak] after.\n\n> [pagebreak]\n\n- [text - bold] A literal list prefix.\n\n::: columns\n[pagebreak]\n\n[align - center] A literal column prefix.\n|||\nOther column.\n:::\n\n    [pagebreak]\n    [text - bold] indented code\n\n```text\n[pagebreak]\n[text - bold] fenced code\n```\n\nInline `[pagebreak]` code.\n\n[text - bold]\n';
  await fill(page, source);
  const preview = page.locator('.markdown-pages');
  await expect(preview.locator('[data-md-pagebreak]')).toHaveCount(0);
  await expect(page.locator('#markdown-source [data-md-pagebreak]')).toHaveCount(0);
  await expect(preview.locator('[data-md-align]')).toHaveCount(0);
  for (const literal of ['[text - bold] Escaped prefix.', '[text - unknown] Unknown prefix.', '[align - nowhere]', 'Following paragraph.', 'Before [pagebreak] after.', '[text - bold] A literal list prefix.', '[align - center] A literal column prefix.', '[text - bold] fenced code']) {
    await expect(preview).toContainText(literal);
  }
  await expect(preview.locator('strong')).toHaveCount(0);
});

test('quoted angle brackets in HTML attributes do not execute nested prefixes', async ({ page }) => {
  await fill(page, `<div data-x="/>" data-other='quoted > <section>'>

[text - bold] inside

<section data-x='/> <div>'>

[pagebreak]

[align - right] also inside

</section>

</div>

<!-- <div data-x="/>" > -->

[align - center] outside

[text - bold] outside bold`);
  const preview = page.locator('.markdown-pages');
  await expect(preview.locator('.page')).toHaveCount(1);
  await expect(page.locator('#markdown-source [data-md-pagebreak]')).toHaveCount(0);
  for (const literal of ['[text - bold] inside', '[pagebreak]', '[align - right] also inside']) {
    await expect(preview).toContainText(literal);
  }
  await expect(preview.locator('[data-x] strong')).toHaveCount(0);
  await expect(preview.locator('p').filter({ hasText: /^outside$/ })).toHaveCSS('text-align', 'center');
  await expect(preview.locator('strong')).toHaveText('outside bold');
});

test('aligned highlighted long text retains every character and format across natural pagination', async ({ page }) => {
  const paragraph = 'Aligned highlighted text with a long paragraph keeps its complete content. '.repeat(300).trim();
  await fill(page, `[text - left - right - highlight - underline] ${paragraph}`);
  const preview = page.locator('.markdown-pages');
  await expect(preview.locator('.page')).not.toHaveCount(1);
  const fragments = preview.locator('.pagination-text-fragment');
  expect(await fragments.count()).toBeGreaterThan(1);
  expect((await fragments.allTextContents()).join('')).toBe(paragraph);
  expect(await fragments.evaluateAll(nodes => nodes.every(node =>
    getComputedStyle(node).textAlign === 'right' && node.querySelector('mark')?.textContent === node.textContent && node.querySelector('u')?.textContent === node.textContent
  ))).toBe(true);
});

test('explicit GFM cell alignment wins over a table prefix', async ({ page }) => {
  await fill(page, '[align - center]\n\n| Default | Right | Left |\n| --- | ---: | :--- |\n| A | B | C |');
  const cells = page.locator('.markdown-pages td');
  await expect(cells.nth(0)).toHaveCSS('text-align', 'center');
  await expect(cells.nth(1)).toHaveCSS('text-align', 'right');
  await expect(cells.nth(2)).toHaveCSS('text-align', 'left');
});
