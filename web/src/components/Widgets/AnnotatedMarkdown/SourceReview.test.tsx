import React from 'react';
import {fireEvent, render, screen, waitFor} from '@testing-library/react';
import {beforeAll, describe, expect, it, vi} from 'vitest';
import {AnnotatedMarkdown} from './index';
import {HighlightedTranscript, SourceEvidencePane, type ReviewEvidence} from './SourceEvidencePane';

vi.mock('../../Apps/Chat/SciMarkdown', () => ({SciMarkdown: ({children}: {children: string}) =>
  <ul>{children.split('\n').filter(line => line.startsWith('* ')).map((line, i) => <li key={i}>{line.slice(2)}</li>)}</ul>}));
beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () {this.setAttribute('open', '');};
  HTMLDialogElement.prototype.close = function () {this.removeAttribute('open');};
  HTMLElement.prototype.scrollIntoView = vi.fn();
  Range.prototype.getClientRects = () => [] as unknown as DOMRectList;
  vi.stubGlobal('ResizeObserver', class {observe() {} disconnect() {}});
  vi.stubGlobal('IntersectionObserver', class {
    callback: IntersectionObserverCallback;
    constructor(callback: IntersectionObserverCallback) {this.callback = callback;}
    observe(element: HTMLElement) {this.callback([{isIntersecting: element.dataset.sourcePage === '1', target: element}] as unknown as IntersectionObserverEntry[], this as unknown as IntersectionObserver);}
    disconnect() {}
  });
});
const refs = [1, 2].map(n => ({id:`r${n}`,document_id:'proposal',document_name:'Proposal.pdf',page_number:n,quote:`Source passage ${n}`,evidence_type:'transcript'}));
const evidence: ReviewEvidence = {available:true,revision:'r1',documents:{summary:{document_version:'v1',points:[
  {id:'point',index:0,section:'Terms',text:'Service is optional.',references:refs}]}},
  sources:[{document_id:'proposal',name:'Proposal.pdf'}],pages:Array.from({length:80},(_,i)=>({document_id:'proposal',page_number:i+1}))};
const props = () => ({children:'* Service is optional.',documentId:'summary',documentVersion:'v1',annotations:[],
  onChange:vi.fn().mockResolvedValue(undefined),onSubmit:vi.fn().mockResolvedValue(undefined),expandedOnly:true,
  loadEvidence:vi.fn().mockResolvedValue(evidence),loadSourcePage:vi.fn().mockImplementation(async (document_id,page_number)=>({document_id,page_number,text:'Source passage 1',image_url:'/storage/tenant/blob/page.png?cap=ticket'})),
  toolbarActions:<button>Regenerate from sources</button>});

describe('expanded source review', () => {
  it('keeps compact reading free of annotation controls and only loads evidence on expansion', async () => {
    const p=props();render(<AnnotatedMarkdown {...p}/>);
    expect(screen.queryByRole('button',{name:'Add comment'})).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Margin comments')).not.toBeInTheDocument();
    expect(screen.getByRole('button',{name:'Regenerate from sources'})).toBeVisible();
    expect(p.loadEvidence).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button',{name:'Expand document'}));
    await waitFor(()=>expect(p.loadEvidence).toHaveBeenCalledOnce());
    expect(screen.getByRole('button',{name:'Add comment'})).toBeVisible();
    expect(screen.getByRole('complementary',{name:'Source evidence'})).toBeVisible();
    const point=await screen.findByRole('button',{name:'Show evidence: Service is optional.'});
    fireEvent.keyDown(point,{key:'Enter'});
    expect(await screen.findByRole('button',{name:/1\. Proposal.pdf/})).toHaveAttribute('aria-current','true');
    fireEvent.click(screen.getByRole('button',{name:/2\. Proposal.pdf/}));
    expect(screen.getByRole('button',{name:/2\. Proposal.pdf/})).toHaveAttribute('aria-current','true');
    fireEvent.click(screen.getByRole('button',{name:'Close review'}));
    expect(screen.queryByRole('button',{name:'Add comment'})).not.toBeInTheDocument();
  });
  it('preserves an unsaved margin comment and blocks regeneration after closing', async () => {
    const p=props();render(<AnnotatedMarkdown {...p}/>);
    fireEvent.click(screen.getByRole('button',{name:'Expand document'}));
    const root=screen.getByLabelText('summary document');
    const range=document.createRange();range.selectNodeContents(root.querySelector('li')!);
    window.getSelection()!.removeAllRanges();window.getSelection()!.addRange(range);
    fireEvent.pointerUp(root);fireEvent.click(screen.getByRole('button',{name:'Add comment'}));
    fireEvent.change(screen.getByLabelText('Your comment'),{target:{value:'Check the optional term.'}});
    fireEvent.click(screen.getByRole('button',{name:'Close review'}));
    expect(screen.getByRole('button',{name:'Regenerate from sources'})).toBeDisabled();
    expect(screen.queryByLabelText('Your comment')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button',{name:'Expand document'}));
    expect(screen.getByLabelText('Your comment')).toHaveValue('Check the optional term.');
    fireEvent.click(screen.getByRole('button',{name:'Save comment'}));
    await waitFor(()=>expect(p.onChange).toHaveBeenCalledWith([expect.objectContaining({comment:'Check the optional term.',document:'summary'})]));
    expect(p.onSubmit).not.toHaveBeenCalled();
  });
  it('loads only nearby pages from a long source', async () => {
    const p=props();render(<SourceEvidencePane evidence={evidence} point={null} loadPage={p.loadSourcePage} error="" loading={false}/>);
    await waitFor(()=>expect(p.loadSourcePage).toHaveBeenCalled());
    expect(p.loadSourcePage.mock.calls.every(([, page])=>page===1)).toBe(true);
    expect(screen.getAllByRole('img')).toHaveLength(1);
  });
  it('does not show evidence from a different rendered revision', async () => {
    const p=props();render(<AnnotatedMarkdown {...p} documentVersion="new-version"/>);
    fireEvent.click(screen.getByRole('button',{name:'Expand document'}));
    await waitFor(()=>expect(p.loadEvidence).toHaveBeenCalledOnce());
    expect(screen.queryByRole('button',{name:/Show evidence:/})).not.toBeInTheDocument();
  });
  it('ignores an old evidence response after switching document revision', async () => {
    const p=props();let resolve!: (v:ReviewEvidence)=>void;
    p.loadEvidence.mockImplementationOnce(()=>new Promise(r=>{resolve=r;}));
    const {rerender}=render(<AnnotatedMarkdown {...p}/>);
    fireEvent.click(screen.getByRole('button',{name:'Expand document'}));
    rerender(<AnnotatedMarkdown {...p} documentVersion="new"/>);
    await waitFor(()=>expect(p.loadEvidence).toHaveBeenCalledTimes(2));
    resolve({...evidence,available:false,message:'Stale response'});
    await waitFor(()=>expect(screen.queryByText('Stale response')).not.toBeInTheDocument());
  });
  it('highlights a unique exact normalized quote without interpreting markup', () => {
    const {container,rerender}=render(<HighlightedTranscript text={'A  source\npassage <script>.'} quote="source passage"/>);
    expect(container.querySelector('mark')).toHaveTextContent('source passage');
    expect(container.querySelector('script')).toBeNull();
    rerender(<HighlightedTranscript text="Same. Same." quote="Same."/>);
    expect(container.querySelector('mark')).toBeNull();
  });
});
