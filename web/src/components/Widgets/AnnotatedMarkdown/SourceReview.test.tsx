import React from 'react';
import {act, fireEvent, render, screen, waitFor, within} from '@testing-library/react';
import {beforeAll, beforeEach, describe, expect, it, vi} from 'vitest';
import {AnnotatedMarkdown} from './index';
import {HighlightedTranscript, SourceEvidencePane, type ReviewEvidence} from './SourceEvidencePane';

vi.mock('../../Apps/Chat/SciMarkdown', () => ({SciMarkdown: ({children}: {children: string}) =>
  <ul>{children.split('\n').filter(line => line.startsWith('* ')).map((line, i) => <li key={i}>{line.slice(2)}</li>)}</ul>}));
const nearby = new Map<Element, (visible: boolean) => void>();
beforeEach(() => {
  nearby.clear();
  vi.stubGlobal('fetch', vi.fn(async () => ({ok:true, headers:new Headers(),
    blob:async () => new Blob(['synthetic'], {type:'image/png'})})));
  URL.createObjectURL = vi.fn(() => 'blob:synthetic-page');
  URL.revokeObjectURL = vi.fn();
});
beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () {this.setAttribute('open', '');};
  HTMLDialogElement.prototype.close = function () {this.removeAttribute('open');};
  HTMLElement.prototype.scrollIntoView = vi.fn();
  Range.prototype.getClientRects = () => [] as unknown as DOMRectList;
  vi.stubGlobal('ResizeObserver', class {observe() {} disconnect() {}});
  vi.stubGlobal('IntersectionObserver', class {
    callback: IntersectionObserverCallback;
    isNearby: boolean;
    elements = new Set<Element>();
    constructor(callback: IntersectionObserverCallback, options?: IntersectionObserverInit) {this.callback = callback;this.isNearby = options?.rootMargin === '200px';}
    observe(element: HTMLElement) {
      const notify = (visible: boolean) => this.callback([{isIntersecting: visible, target: element}] as unknown as IntersectionObserverEntry[], this as unknown as IntersectionObserver);
      if (this.isNearby) {nearby.set(element, notify);this.elements.add(element);}
      notify(element.dataset.sourcePage === '1');
    }
    disconnect() {this.elements.forEach(element => nearby.delete(element));}
  });
});
const refs = [1, 2].map(n => ({id:`r${n}`,document_id:'proposal',document_name:'Proposal.pdf',page_number:n,quote:`Source passage ${n}`,evidence_type:'transcript',locator:'Terms table, final row'}));
const evidence: ReviewEvidence = {available:true,revision:'r1',documents:{summary:{document_version:'v1',points:[
  {id:'point',index:0,section:'Terms',text:'Service is optional.',references:refs}]}},
  sources:[{document_id:'proposal',name:'Proposal.pdf'}],pages:Array.from({length:80},(_,i)=>({document_id:'proposal',page_number:i+1}))};
const props = () => ({children:'* Service is optional.',documentId:'summary',documentVersion:'v1',annotations:[],
  onChange:vi.fn().mockResolvedValue(undefined),onSubmit:vi.fn().mockResolvedValue(undefined),expandedOnly:true,expandLabel:'Analysis Mode',
  loadEvidence:vi.fn().mockResolvedValue(evidence),loadSourcePage:vi.fn().mockImplementation(async (document_id,page_number)=>({document_id,page_number,text:'Source passage 1',image_url:'/storage/tenant/blob/page.png?cap=ticket'})),
  toolbarActions:<button>Regenerate from sources</button>});

describe('expanded source review', () => {
  it('keeps compact reading free of annotation controls and only loads evidence on expansion', async () => {
    const p=props();render(<AnnotatedMarkdown {...p}/>);
    expect(screen.queryByRole('button',{name:'Add comment'})).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Margin comments')).not.toBeInTheDocument();
    expect(screen.getByRole('button',{name:'Regenerate from sources'})).toBeVisible();
    expect(p.loadEvidence).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button',{name:'Analysis Mode'}));
    await waitFor(()=>expect(p.loadEvidence).toHaveBeenCalledOnce());
    expect(screen.getByRole('button',{name:'Add comment'})).toBeVisible();
    const sources=screen.getByRole('complementary',{name:'Source evidence'});
    const preview=screen.getByRole('complementary',{name:'Source preview'});
    expect(sources).toBeVisible();
    expect(preview).toBeVisible();
    expect(screen.getAllByRole('separator')).toHaveLength(2);
    const point=await screen.findByRole('button',{name:'Show evidence: Service is optional.'});
    fireEvent.keyDown(point,{key:'Enter'});
    expect(await screen.findByRole('button',{name:/1\. Proposal.pdf/})).toHaveAttribute('aria-current','true');
    expect(within(sources).getAllByText('Terms table, final row')).toHaveLength(2);
    expect(sources.querySelector('details')).toBeNull();
    expect(within(preview).queryByText('Terms table, final row')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button',{name:/2\. Proposal.pdf/}));
    expect(screen.getByRole('button',{name:/2\. Proposal.pdf/})).toHaveAttribute('aria-current','true');
    fireEvent.click(screen.getByRole('button',{name:'Close review'}));
    expect(screen.queryByRole('button',{name:'Add comment'})).not.toBeInTheDocument();
  });
  it('preserves an unsaved margin comment and blocks regeneration after closing', async () => {
    const p=props();render(<AnnotatedMarkdown {...p}/>);
    fireEvent.click(screen.getByRole('button',{name:'Analysis Mode'}));
    const root=screen.getByLabelText('summary document');
    const range=document.createRange();range.selectNodeContents(root.querySelector('li')!);
    window.getSelection()!.removeAllRanges();window.getSelection()!.addRange(range);
    fireEvent.pointerUp(root);fireEvent.click(screen.getByRole('button',{name:'Add comment'}));
    fireEvent.change(screen.getByLabelText('Your comment'),{target:{value:'Check the optional term.'}});
    fireEvent.click(screen.getByRole('button',{name:'Close review'}));
    expect(screen.getByRole('button',{name:'Regenerate from sources'})).toBeDisabled();
    expect(screen.queryByLabelText('Your comment')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button',{name:'Analysis Mode'}));
    expect(screen.getByLabelText('Your comment')).toHaveValue('Check the optional term.');
    fireEvent.click(screen.getByRole('button',{name:'Save comment'}));
    await waitFor(()=>expect(p.onChange).toHaveBeenCalledWith([expect.objectContaining({comment:'Check the optional term.',document:'summary'})]));
    expect(p.onSubmit).not.toHaveBeenCalled();
  });
  it('loads only nearby pages from a long source', async () => {
    const p=props();render(<SourceEvidencePane evidence={evidence} point={null} loadPage={p.loadSourcePage} error="" loading={false}/>);
    await waitFor(()=>expect(p.loadSourcePage).toHaveBeenCalled());
    expect(p.loadSourcePage.mock.calls.every(([, page])=>page===1)).toBe(true);
    expect(await screen.findAllByRole('img')).toHaveLength(1);
  });
  it('reuses image bytes on scroll-back, resets on revision changes and releases object URLs', async () => {
    const p=props();const {rerender,unmount}=render(<SourceEvidencePane evidence={evidence} point={null} loadPage={p.loadSourcePage} error="" loading={false}/>);
    const img=await screen.findByRole('img',{name:'Original source, page 1'});
    const article=img.closest('[data-source-page]')!;
    act(()=>nearby.get(article)!(false));
    expect(screen.queryByRole('img',{name:'Original source, page 1'})).not.toBeInTheDocument();
    expect(URL.revokeObjectURL).toHaveBeenCalledOnce();
    act(()=>nearby.get(article)!(true));
    await screen.findByRole('img',{name:'Original source, page 1'});
    expect(p.loadSourcePage).toHaveBeenCalledOnce();expect(fetch).toHaveBeenCalledOnce();
    rerender(<SourceEvidencePane evidence={{...evidence,revision:'r2'}} point={null} loadPage={p.loadSourcePage} error="" loading={false}/>);
    await waitFor(()=>expect(p.loadSourcePage).toHaveBeenCalledTimes(2));
    await screen.findByRole('img',{name:'Original source, page 1'});
    expect(fetch).toHaveBeenCalledTimes(2);
    unmount();expect(URL.revokeObjectURL).toHaveBeenCalledTimes(3);
  });
  it('does not show evidence from a different rendered revision', async () => {
    const p=props();render(<AnnotatedMarkdown {...p} documentVersion="new-version"/>);
    fireEvent.click(screen.getByRole('button',{name:'Analysis Mode'}));
    await waitFor(()=>expect(p.loadEvidence).toHaveBeenCalledOnce());
    expect(screen.queryByRole('button',{name:/Show evidence:/})).not.toBeInTheDocument();
  });
  it('ignores an old evidence response after switching document revision', async () => {
    const p=props();let resolve!: (v:ReviewEvidence)=>void;
    p.loadEvidence.mockImplementationOnce(()=>new Promise(r=>{resolve=r;}));
    const {rerender}=render(<AnnotatedMarkdown {...p}/>);
    fireEvent.click(screen.getByRole('button',{name:'Analysis Mode'}));
    rerender(<AnnotatedMarkdown {...p} documentVersion="new"/>);
    await waitFor(()=>expect(p.loadEvidence).toHaveBeenCalledTimes(2));
    resolve({...evidence,available:false,message:'Stale response'});
    await waitFor(()=>expect(screen.queryByText('Stale response')).not.toBeInTheDocument());
  });
  it('draws only regions for the selected evidence and matching page image', async () => {
    const hash = 'a'.repeat(64);
    const point = {...evidence.documents!.summary.points[0], references: [
      {...refs[0], regions: [{region_id:'box',image_sha256:hash,bbox:[.1,.2,.8,.4],origin:'ocr' as const}]}, refs[1]]};
    const loadPage = vi.fn(async (document_id: string,page_number: number) => ({document_id,page_number,
      text:'Source passage 1',image_url:'/storage/tenant/blob/page.png?cap=ticket',image_sha256:hash}));
    const {rerender} = render(<SourceEvidencePane evidence={evidence} point={point} loadPage={loadPage} error="" loading={false}/>);
    const box = await screen.findByRole('img',{name:'Supporting OCR block'});
    expect(box).toHaveStyle({left:'10%',top:'20%',height:'20%'});
    expect(parseFloat(box.style.width)).toBeCloseTo(70);
    fireEvent.change(screen.getByRole('combobox',{name:'Source zoom'}),{target:{value:'150'}});
    expect(box.closest('[data-source-page]')).toHaveStyle({width:'150%'});
    expect(box).toHaveStyle({left:'10%',top:'20%'});
    fireEvent.click(screen.getByRole('button',{name:/2\. Proposal.pdf/}));
    expect(screen.queryByRole('img',{name:'Supporting OCR block'})).not.toBeInTheDocument();
    for (const region of [
      {region_id:'box',image_sha256:'b'.repeat(64),bbox:[.1,.2,.8,.4],origin:'ocr' as const},
      {region_id:'box',image_sha256:hash,bbox:[0,0,2,1],origin:'ocr' as const},
    ]) {
      rerender(<SourceEvidencePane evidence={evidence} point={{...point,references:[{...refs[0],regions:[region]}]}} loadPage={loadPage} error="" loading={false}/>);
      await waitFor(()=>expect(screen.queryByRole('img',{name:'Supporting OCR block'})).not.toBeInTheDocument());
    }
  });
  it('uses recovered page regions only for the selected published reference', async () => {
    const hash = 'a'.repeat(64);
    const point = evidence.documents!.summary.points[0];
    const loadPage = vi.fn(async (document_id: string, page_number: number) => ({document_id, page_number,
      text: 'Source passage 1', image_url: '/storage/tenant/blob/page.png?cap=ticket', image_sha256: hash,
      reference_regions: {r1: [{region_id:'recovered',image_sha256:hash,bbox:[.1,.2,.8,.4],origin:'ocr' as const}]}}));
    render(<SourceEvidencePane evidence={evidence} point={point} loadPage={loadPage} error="" loading={false}/>);
    expect(await screen.findByRole('img',{name:'Supporting OCR block'})).toHaveStyle({left:'10%',top:'20%'});
    fireEvent.click(screen.getByRole('button',{name:/2\. Proposal.pdf/}));
    expect(screen.queryByRole('img',{name:'Supporting OCR block'})).not.toBeInTheDocument();
    expect(loadPage).toHaveBeenCalledOnce();
  });
  it('handles Ctrl+wheel only on page images, anchors zoom and clamps its range', async () => {
    const p=props();render(<SourceEvidencePane evidence={evidence} point={null} loadPage={p.loadSourcePage} error="" loading={false}/>);
    const img=await screen.findByRole('img',{name:'Original source, page 1'});
    const image=img.parentElement!, article=image.closest<HTMLElement>('[data-source-page]')!;
    const scroll=image.closest<HTMLElement>('.source-pages-scroll')!;
    image.getBoundingClientRect=()=>({left:10-scroll.scrollLeft,top:20-scroll.scrollTop,
      width:500*parseFloat(article.style.width)/100,height:700*parseFloat(article.style.width)/100} as DOMRect);
    const wheel=(target:Element, deltaY:number, ctrlKey=true, deltaMode=0)=>{
      const event=new WheelEvent('wheel',{bubbles:true,cancelable:true,ctrlKey,deltaY,deltaMode,clientX:210,clientY:300});
      fireEvent(target,event);return event;
    };
    expect(wheel(img,-120,false).defaultPrevented).toBe(false);
    expect(screen.getByRole('combobox',{name:'Source zoom'})).toHaveValue('100');
    expect(wheel(img,-120).defaultPrevented).toBe(true);
    expect(Number((screen.getByRole('combobox',{name:'Source zoom'}) as HTMLSelectElement).value)).toBeGreaterThan(100);
    const box=image.getBoundingClientRect();
    expect(box.left+box.width*.4).toBeCloseTo(210);
    expect(box.top+box.height*.4).toBeCloseTo(300);
    for(let i=0;i<10;i++) wheel(img,-50,true,1);
    expect(screen.getByRole('combobox',{name:'Source zoom'})).toHaveValue('400');
    expect(wheel(img,-120).defaultPrevented).toBe(true);
    for(let i=0;i<10;i++) wheel(img,200);
    expect(screen.getByRole('combobox',{name:'Source zoom'})).toHaveValue('100');
    expect(scroll.scrollLeft).toBe(0);
    expect(wheel(img,120).defaultPrevented).toBe(true);
    fireEvent.click(within(article).getByRole('button',{name:'Show transcript'}));
    expect(wheel(article.querySelector('.source-transcript')!,-120).defaultPrevented).toBe(false);
    expect(wheel(screen.getByRole('combobox',{name:'Source zoom'}),-120).defaultPrevented).toBe(false);
    expect(screen.getByRole('combobox',{name:'Source zoom'})).toHaveValue('100');
  });
  it('pans zoomed images with the primary mouse and releases capture on cancellation or unmount', async () => {
    const p=props();const {unmount}=render(<SourceEvidencePane evidence={evidence} point={null} loadPage={p.loadSourcePage} error="" loading={false}/>);
    const img=await screen.findByRole('img',{name:'Original source, page 1'});
    const scroll=img.closest<HTMLElement>('.source-pages-scroll')!;
    const held=new Set<number>();
    scroll.setPointerCapture=vi.fn(id=>held.add(id));
    scroll.hasPointerCapture=id=>held.has(id);
    scroll.releasePointerCapture=vi.fn(id=>held.delete(id));
    const pointer=(type:string,target:Element=img, init:MouseEventInit={},pointerType='mouse')=>{
      const event=new MouseEvent(type,{bubbles:true,cancelable:true,clientX:200,clientY:200,buttons:1,...init});
      Object.defineProperties(event,{pointerId:{value:7},pointerType:{value:pointerType}});
      fireEvent(target,event);return event;
    };
    pointer('pointerdown');expect(held.size).toBe(0);
    fireEvent.change(screen.getByRole('combobox',{name:'Source zoom'}),{target:{value:'150'}});
    pointer('pointerdown',img,{},'touch');expect(held.size).toBe(0);
    pointer('pointerdown',img,{button:2});expect(held.size).toBe(0);
    scroll.scrollTop=300;scroll.scrollLeft=100;
    expect(pointer('pointerdown').defaultPrevented).toBe(true);
    expect(held.has(7)).toBe(true);expect(scroll).toHaveClass('source-pages-panning');
    pointer('pointermove',scroll,{clientX:150,clientY:170});
    expect(scroll.scrollLeft).toBe(150);expect(scroll.scrollTop).toBe(330);
    pointer('pointercancel',scroll);expect(held.size).toBe(0);expect(scroll).not.toHaveClass('source-pages-panning');
    pointer('pointerdown');fireEvent(window,new Event('blur'));expect(held.size).toBe(0);
    pointer('pointerdown');pointer('lostpointercapture',scroll);expect(held.size).toBe(0);
    pointer('pointerdown');fireEvent.change(screen.getByRole('combobox',{name:'Source zoom'}),{target:{value:'100'}});
    expect(held.size).toBe(0);expect(scroll.scrollLeft).toBe(0);
    fireEvent.change(screen.getByRole('combobox',{name:'Source zoom'}),{target:{value:'150'}});
    pointer('pointerdown');unmount();expect(held.size).toBe(0);
  });
  it('highlights a unique exact normalized quote without interpreting markup', () => {
    const {container,rerender}=render(<HighlightedTranscript text={'A  source\npassage <script>.'} quote="source passage"/>);
    expect(container.querySelector('mark')).toHaveTextContent('source passage');
    expect(container.querySelector('script')).toBeNull();
    expect(container.textContent).toBe('A  source\npassage <script>.');
    rerender(<HighlightedTranscript text="Same. Same." quote="Same."/>);
    expect(container.querySelector('mark')).toBeNull();
  });
});
