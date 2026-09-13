import {describe, expect, it} from 'vitest';
import {locateAnchor, selectedAnchor, type TextAnnotation} from './anchors';

function select(root: HTMLElement, start: Node, from: number, end: Node, to: number) {
  document.body.replaceChildren(root);
  const range = document.createRange(); range.setStart(start, from); range.setEnd(end, to);
  const selection = window.getSelection()!; selection.removeAllRanges(); selection.addRange(range);
  return selection;
}
const wrap = (anchor: NonNullable<ReturnType<typeof selectedAnchor>>): TextAnnotation => ({...anchor, id:'note', document:'summary', document_version:'rev', comment:'Check this'});

describe('rendered text anchors', () => {
  it('captures formatted text across nodes and resolves the same passage', () => {
    const root = document.createElement('div'); root.innerHTML = '<p>A <strong>five-year</strong> term.</p>';
    const nodes = root.querySelector('p')!.childNodes;
    const anchor = selectedAnchor(root, select(root, nodes[1].firstChild!, 0, nodes[2], 5))!;
    expect(anchor.quote).toBe('five-year term');
    expect(locateAnchor(root, wrap(anchor))?.toString()).toBe(anchor.quote);
  });
  it('keeps repeated passages distinct and handles UTF-16 offsets', () => {
    const root = document.createElement('div'); root.textContent = '😀 term. Second term.';
    const text = root.firstChild!;
    const anchor = selectedAnchor(root, select(root, text, 16, text, 20))!;
    expect(anchor.quote).toBe('term'); expect(anchor.start).toBe(16);
    expect(locateAnchor(root, wrap(anchor))?.startOffset).toBe(16);
  });
  it('checks context even when an old offset now points to another equal quote', () => {
    const root = document.createElement('div'); root.textContent = 'New term. Old term.';
    const annotation = {id:'n', document:'s',document_version:'v',start:4,end:8,quote:'term',prefix:'Old ',suffix:'.',comment:'x'};
    expect(locateAnchor(root, annotation)?.startOffset).toBe(14);
  });
  it('refuses an ambiguous fallback and selections outside the document', () => {
    const root = document.createElement('div'); root.textContent = 'term and term';
    expect(locateAnchor(root, {id:'n', document:'s',document_version:'v',start:99,end:103,quote:'term',prefix:'',suffix:'',comment:'x'})).toBeNull();
    const outside = document.createElement('div'); outside.textContent = 'outside'; document.body.append(outside);
    const selection = select(outside, outside.firstChild!,0,outside.firstChild!,7);
    expect(selectedAnchor(root,selection)).toBeNull();
  });
});
