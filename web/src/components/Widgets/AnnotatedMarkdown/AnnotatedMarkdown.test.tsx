import React from 'react';
import {fireEvent, render, screen, waitFor} from '@testing-library/react';
import {beforeAll, describe, expect, it, vi} from 'vitest';
import {AnnotatedMarkdown} from './index';
import type {TextAnnotation} from './anchors';

vi.mock('../../Apps/Chat/SciMarkdown', () => ({SciMarkdown: ({children}: {children: string}) => <p>{children}</p>}));
beforeAll(() => {
  Range.prototype.getClientRects = () => [] as unknown as DOMRectList;
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
});
const note: TextAnnotation = {id:'first',document:'summary',document_version:'v1',quote:'five-year term',start:2,end:16,prefix:'A ',suffix:'.',comment:'Check the term.'};
function selectPassage() {
  const root = screen.getByLabelText('summary document');
  const range = document.createRange(); range.setStart(root.querySelector('p')!.firstChild!,2);range.setEnd(root.querySelector('p')!.firstChild!,16);
  window.getSelection()!.removeAllRanges();window.getSelection()!.addRange(range);
  fireEvent.pointerUp(root);
}
function props() {return {documentId:'summary',documentVersion:'v1',annotations:[] as TextAnnotation[],onChange:vi.fn().mockResolvedValue(undefined),onSubmit:vi.fn().mockResolvedValue(undefined),children:'A five-year term.'};}

describe('margin comments', () => {
  it('saves a text-anchored comment and preserves other document comments', async () => {
    const p=props();p.annotations=[{...note,id:'analysis-note',document:'analysis'}];
    render(<AnnotatedMarkdown {...p}/>);selectPassage();fireEvent.click(screen.getByRole('button',{name:'Add comment'}));
    fireEvent.change(screen.getByLabelText('Your comment'),{target:{value:'Please shorten this.'}});
    expect(screen.getByRole('button',{name:'Submit comments (1)'})).toBeDisabled();
    fireEvent.click(screen.getByRole('button',{name:'Save comment'}));
    await waitFor(()=>expect(p.onChange).toHaveBeenCalledOnce());
    expect(p.onChange.mock.calls[0][0]).toEqual([p.annotations[0],expect.objectContaining({quote:'five-year term',comment:'Please shorten this.',document:'summary',document_version:'v1',start:2,end:16})]);
  });
  it('keeps editor text when saving fails', async () => {
    const p=props();p.onChange.mockRejectedValue(new Error('Another tab changed these comments.'));
    render(<AnnotatedMarkdown {...p}/>);selectPassage();fireEvent.click(screen.getByRole('button',{name:'Add comment'}));
    fireEvent.change(screen.getByLabelText('Your comment'),{target:{value:'Keep this draft.'}});fireEvent.click(screen.getByRole('button',{name:'Save comment'}));
    expect(await screen.findByRole('alert')).toHaveTextContent('Another tab');
    expect(screen.getByLabelText('Your comment')).toHaveValue('Keep this draft.');
  });
  it('edits, deletes and submits a saved batch', async () => {
    const p=props();p.annotations=[note];const {rerender}=render(<AnnotatedMarkdown {...p}/>);
    fireEvent.click(screen.getByRole('button',{name:'Edit comment 1'}));
    fireEvent.change(screen.getByLabelText('Your comment'),{target:{value:'Check the renewal date.'}});fireEvent.click(screen.getByRole('button',{name:'Save comment'}));
    await waitFor(()=>expect(p.onChange).toHaveBeenCalledWith([expect.objectContaining({id:'first',comment:'Check the renewal date.'})]));
    rerender(<AnnotatedMarkdown {...p} annotations={p.onChange.mock.calls[0][0]}/>);
    await waitFor(()=>expect(screen.queryByLabelText('Your comment')).not.toBeInTheDocument());
    fireEvent.click(screen.getByRole('button',{name:'Submit comments (1)'}));await waitFor(()=>expect(p.onSubmit).toHaveBeenCalledOnce());
    await waitFor(()=>expect(screen.getByRole('button',{name:'Delete comment 1'})).toBeEnabled());
    fireEvent.click(screen.getByRole('button',{name:'Delete comment 1'}));await waitFor(()=>expect(p.onChange).toHaveBeenLastCalledWith([]));
  });
  it('retains quotes but blocks stale submission and editing during a task', () => {
    const p=props();p.annotations=[note];const {rerender}=render(<AnnotatedMarkdown {...p} stale/>);
    expect(screen.getByText('Earlier revision')).toBeInTheDocument();
    expect(screen.getByRole('button',{name:'Submit comments (1)'})).toBeDisabled();
    expect(screen.getByRole('button',{name:'Edit comment 1'})).toBeDisabled();
    rerender(<AnnotatedMarkdown {...p} disabled/>);
    expect(screen.getByRole('button',{name:'Submit comments (1)'})).toBeDisabled();
    expect(screen.getByText('Check the term.')).toBeInTheDocument();
  });
});
