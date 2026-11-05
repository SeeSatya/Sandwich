/** Export the completed drawings and their final pagination, including errors. */
export const waitForDiagramLayout = async (timeoutMs = 30_000): Promise<void> => {
  const source = document.getElementById('markdown-source');
  const pages = document.querySelector('.markdown-pages');
  if (!source) return;
  await new Promise<void>((resolve, reject) => {
    const observer = new MutationObserver(check);
    const timer = setTimeout(() => {
      observer.disconnect();
      reject(new Error('Diagrams are still rendering. Please try exporting again in a moment.'));
    }, timeoutMs);
    function check() {
      if (source!.querySelector('[data-diagram-state="rendering"]') ||
        pages?.getAttribute('data-pagination-state') === 'rendering') return;
      observer.disconnect();
      clearTimeout(timer);
      resolve();
    }
    observer.observe(source, { subtree: true, childList: true, attributes: true });
    if (pages) observer.observe(pages, { attributes: true, childList: true });
    check();
  });
  // Let the final SVG and page replacements paint before capturing them.
  await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
};
