const REMOVED_PASTE_ELEMENTS =
  'script, style, noscript, template, iframe, object, embed, svg, canvas, [hidden], [aria-hidden="true"]';
const HIDDEN_STYLE = /\b(?:display\s*:\s*none|visibility\s*:\s*hidden)\b/iu;

export function pastedStyleIsHidden(cssText: string): boolean {
  return HIDDEN_STYLE.test(cssText);
}

export function sanitizePastedHtml(html: string): string {
  const parsed = new DOMParser().parseFromString(html, 'text/html');
  parsed.querySelectorAll(REMOVED_PASTE_ELEMENTS).forEach((element) => element.remove());
  parsed.querySelectorAll<HTMLElement>('[style]').forEach((element) => {
    if (pastedStyleIsHidden(element.style.cssText)) element.remove();
  });
  const clean = document.createElement('div');
  const appendTextBlock = (tag: 'p' | 'blockquote' | `h${number}`, value: string): void => {
    const element = document.createElement(tag);
    element.textContent = value;
    clean.append(element);
  };
  const visit = (root: ParentNode): void => {
    for (const child of root.childNodes) {
      if (child.nodeType === Node.TEXT_NODE) {
        const value = child.textContent?.trim() ?? '';
        if (value) appendTextBlock('p', value);
        continue;
      }
      if (!(child instanceof HTMLElement)) continue;
      const tag = child.tagName.toLowerCase();
      if (/^h[1-6]$/u.test(tag)) appendTextBlock(tag as `h${number}`, child.textContent ?? '');
      else if (tag === 'blockquote') appendTextBlock('blockquote', child.textContent ?? '');
      else if (tag === 'hr') clean.append(document.createElement('hr'));
      else if (tag === 'p' || tag === 'li' || tag === 'pre')
        appendTextBlock('p', child.textContent ?? '');
      else if (child.querySelector('p, li, blockquote, h1, h2, h3, h4, h5, h6, hr')) visit(child);
      else if ((child.textContent ?? '').trim()) appendTextBlock('p', child.textContent ?? '');
    }
  };
  visit(parsed.body);
  if (!clean.hasChildNodes()) clean.append(document.createElement('p'));
  const serializer = new XMLSerializer();
  return Array.from(clean.childNodes, (node) => serializer.serializeToString(node)).join('');
}
