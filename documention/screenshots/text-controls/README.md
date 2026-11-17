# Page breaks and text formatting: browser evidence

Captured on 17 November 2026 from `feat/page-breaks-text-formatting` using real Chromium 141 at a 1660 × 1200 viewport.

- [Browser preview](browser-preview.png) shows the Markdown prefixes beside a centered heading, a right-aligned bold/highlighted/underlined paragraph, and the next manual page boundary.
- [PDF page 2](pdf-page-2.png) is rendered from the actual three-page A4 PDF, rather than a screenshot of the HTML preview.
- [Chatbot example](chatbot-example-preview.png) shows the complete example from the chatbot instructions rendering its JSON flowchart, math, and highlighted text.

## Reproduce

1. Run `npm run dev` and open the app in Chromium.
2. Paste `tests/fixtures/text-controls.md` into the editor. Confirm exactly three sheets, with “Document layout controls”, “Aligned and formatted text”, and “Structured content” starting their respective pages.
3. Switch between Modern Light, Midnight, Academic Report, and Pixelize. The explicit heading/paragraph/list/quote alignment and highlight/underline should remain effective.
4. Use the PDF button and save the print output. It should have three A4 pages. With Poppler installed, `pdfinfo showcase.pdf` checks the count and paper size, and `pdftotext -layout showcase.pdf -` exposes the section boundaries.
5. Use the Word button. The downloaded DOCX contains two native page-break-before properties, native alignment and text formats, hyperlinks, and a table.
6. Paste the complete example at the end of `documention/chatbot-instructions.md`, omitting the outer fence. Its preview and Word download should include both the labeled flowchart and math. The DOCX ZIP includes a diagram SVG, its PNG fallback, and the math image; it preserves the manual break, alignment, table, links, and highlighted text.

The meaningful browser regressions are in `tests/text-controls.spec.ts` and `tests/text-controls-docx.spec.ts`:

```bash
npm test -- tests/text-controls.spec.ts tests/text-controls-docx.spec.ts
```

Final independent browser verification also checked immediate export after an editor change; combined link/code/math formatting in Midnight; empty HTML around page breaks producing one actual PDF page and no extra Word break; quoted HTML attributes preserving nested literal prefixes; and a break-only document producing no visible page. No browser exceptions were recorded.

The shared browser could not launch because the T3 server runs as root, so verification used installed Playwright Chromium with `--no-sandbox`. Google Fonts requests were stubbed and the existing Tailwind script was served from cache to avoid network variability. Word files were verified as actual downloads by inspecting their ZIP/XML/media; they were not visually rendered in Word or LibreOffice.
