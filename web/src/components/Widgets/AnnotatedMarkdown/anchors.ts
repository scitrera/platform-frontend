export interface TextAnnotation {
  id: string;
  document: string;
  document_version: string;
  quote: string;
  prefix: string;
  suffix: string;
  start: number;
  end: number;
  comment: string;
}

function textNodes(root: HTMLElement): Text[] {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];
  while (walker.nextNode()) nodes.push(walker.currentNode as Text);
  return nodes;
}

export function selectedAnchor(root: HTMLElement, selection: Selection | null) {
  if (!selection || selection.isCollapsed || !selection.rangeCount) return null;
  const range = selection.getRangeAt(0);
  if (!root.contains(range.startContainer) || !root.contains(range.endContainer)) return null;
  const before = range.cloneRange();
  before.selectNodeContents(root);
  before.setEnd(range.startContainer, range.startOffset);
  const raw = range.toString();
  const quote = raw.trim();
  if (!quote || quote.length > 2000) return null;
  const start = before.toString().length + raw.indexOf(quote);
  const end = start + quote.length;
  const text = root.textContent || '';
  return {quote, start, end, prefix: text.slice(Math.max(0, start - 120), start), suffix: text.slice(end, end + 120)};
}

export function locateAnchor(root: HTMLElement, annotation: TextAnnotation): Range | null {
  const text = root.textContent || '';
  let start = annotation.start;
  if (text.slice(start, annotation.end) !== annotation.quote) {
    // Never guess between repeated passages when rendering has changed.
    const matches: number[] = [];
    let index = text.indexOf(annotation.quote);
    while (index >= 0) {
      if ((!annotation.prefix || text.slice(Math.max(0, index - annotation.prefix.length), index) === annotation.prefix)
          && (!annotation.suffix || text.slice(index + annotation.quote.length, index + annotation.quote.length + annotation.suffix.length) === annotation.suffix)) matches.push(index);
      index = text.indexOf(annotation.quote, index + 1);
    }
    if (matches.length !== 1) return null;
    start = matches[0];
  }
  const end = start + annotation.quote.length;
  const range = document.createRange();
  let offset = 0, foundStart = false;
  for (const node of textNodes(root)) {
    const next = offset + node.length;
    if (!foundStart && start < next) { range.setStart(node, start - offset); foundStart = true; }
    if (foundStart && end <= next) { range.setEnd(node, end - offset); return range; }
    offset = next;
  }
  return null;
}
