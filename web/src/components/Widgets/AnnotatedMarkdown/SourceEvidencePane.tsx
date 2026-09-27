import {useAuthStore} from '../../../stores/authStore';
import React, {useEffect, useLayoutEffect, useMemo, useRef, useState} from 'react';
import {useSourcePageNavigation} from './useSourcePageNavigation';
import {SourcePageCache, IMAGE_LOAD_ERROR, type SourcePage, type SourcePageLoader, type SourceRegion} from './sourcePageCache';
export type {SourcePage, SourcePageLoader, SourceRegion} from './sourcePageCache';

export interface SourceReference {
  id: string; document_id: string; document_name: string; page_number: number;
  quote: string; locator?: string; evidence_type: string; regions?: SourceRegion[];
  via?: {point_id: string; section: string; quote: string}[];
}
export interface EvidencePoint {id: string; index: number; text: string; section: string; references: SourceReference[]}
export interface ReviewEvidence {
  available: boolean; message?: string; revision?: string;
  documents?: Record<string, {document_version: string; points: EvidencePoint[]}>;
  sources?: {document_id: string; name: string}[];
  pages?: {document_id: string; page_number: number}[];
}

/** Whitespace-normalized, unambiguous transcript highlighting; never inject HTML. */
export function HighlightedTranscript({text, quote}: {text: string; quote: string}) {
  const words = quote.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return <>{text}</>;
  const pattern = new RegExp(words.map(word => word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('\\s+'), 'g');
  const match = pattern.exec(text);
  if (!match) return <>{text}</>;
  pattern.lastIndex = match.index + 1;
  if (pattern.exec(text)) return <>{text}</>;
  return <>{text.slice(0, match.index)}<mark>{match[0]}</mark>{text.slice(match.index + match[0].length)}</>;
}

function LazyPage({document, page, loader, cache, scrollRoot, quote, regions, referenceId, onVisible, zoom}: {
  document: string; page: number; loader: SourcePageLoader; cache: SourcePageCache; scrollRoot: React.RefObject<HTMLDivElement | null>;
  quote: string; regions: SourceRegion[]; referenceId?: string; onVisible: (page: number) => void; zoom: number;
}) {
  const element = useRef<HTMLElement>(null);
  const callback = useRef(onVisible); callback.current = onVisible;
  const load = useRef(loader); load.current = loader;
  const [near, setNear] = useState(false);
  const [value, setValue] = useState<SourcePage | null>(null);
  const [imageURL, setImageURL] = useState('');
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const [transcript, setTranscript] = useState(false);
  useEffect(() => {
    const node = element.current;
    if (!node) return;
    const nearby = new IntersectionObserver(entries => setNear(entries[0].isIntersecting),
      {root: scrollRoot.current, rootMargin: '200px'});
    const visible = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting) callback.current(page);
    }, {root: scrollRoot.current, rootMargin: '0px 0px -65% 0px'});
    nearby.observe(node); visible.observe(node);
    return () => {nearby.disconnect();visible.disconnect();};
  }, [document, page, scrollRoot]);
  useEffect(() => {
    let active = true;
    let objectURL = '';
    setValue(null);setImageURL('');setError('');
    if (near) cache.get(document, page, load.current).then(data => {
      if (!active) return;
      setValue({...data.page, image_error: data.imageError || data.page.image_error});
      if (data.image) {
        objectURL = URL.createObjectURL(data.image);
        setImageURL(objectURL);
      }
      setError(data.imageError || '');
    }).catch(e => {if (active) setError(e instanceof Error ? e.message : 'Unable to load this source page.');});
    return () => {active = false;if (objectURL) URL.revokeObjectURL(objectURL);};
  }, [document, page, near, retry, cache]);
  const pageRegions = regions.length ? regions : (referenceId && value?.reference_regions?.[referenceId]) || [];
  const highlights = pageRegions.filter(region => region.image_sha256 === value?.image_sha256 &&
    /^[a-f0-9]{64}$/.test(region.image_sha256) && ['ocr', 'review_crop'].includes(region.origin) &&
    Array.isArray(region.bbox) && region.bbox.length === 4 && region.bbox.every(Number.isFinite) &&
    region.bbox[0] >= 0 && region.bbox[1] >= 0 && region.bbox[2] <= 1 && region.bbox[3] <= 1 &&
    region.bbox[2] > region.bbox[0] && region.bbox[3] > region.bbox[1]);
  return <article ref={element} className="source-page" data-source-page={page} style={{width: `${zoom}%`}} aria-label={`Source page ${page}`}>
    <header><strong>Page {page}</strong><button className="annotation-button" onClick={() => {
      if (transcript && !imageURL && value?.image_error) {cache.invalidate(document, page);setRetry(r => r + 1);}
      setTranscript(!transcript);
    }}>
      {transcript ? 'Show page image' : 'Show transcript'}</button></header>
    <div className="source-page-content">
      {!near ? null : error ? <div role="alert" className="source-page-message">{error}<button className="annotation-button" onClick={() => {cache.invalidate(document, page);setRetry(r => r + 1);}}>Retry page</button></div>
        : !value ? <p className="source-page-message" role="status">Loading page {page}…</p>
        : transcript || !imageURL ? <div className="source-transcript"><p>{value.image_error}</p><HighlightedTranscript text={value.text} quote={quote}/></div>
        : <div className="source-page-image"><img draggable={false} src={imageURL} alt={`Original source, page ${page}`} referrerPolicy="no-referrer"
          onError={() => {cache.invalidate(document, page);setError(IMAGE_LOAD_ERROR);}} />
          {highlights.map(region => <div key={region.region_id} className="source-image-region" role="img"
            aria-label={region.origin === 'ocr' ? 'Supporting OCR block' : 'Reviewed source crop'}
            style={{left: `${region.bbox[0] * 100}%`, top: `${region.bbox[1] * 100}%`,
              width: `${(region.bbox[2] - region.bbox[0]) * 100}%`, height: `${(region.bbox[3] - region.bbox[1]) * 100}%`}}/>)}
          </div>}
      {near && value && !error && !transcript && imageURL && quote && !highlights.length &&
        <p className="source-region-unavailable">No recorded image region for this passage. Use the transcript to locate the quote.</p>}
      {error && value && <button className="annotation-button" onClick={() => {setError('');setTranscript(true);}}>Read transcript</button>}
    </div>
  </article>;
}

export function SourceEvidencePane({evidence, point, loadPage, error, loading, divider, onPreview}: {
  evidence: ReviewEvidence | null; point: EvidencePoint | null; loadPage: SourcePageLoader;
  error: string; loading: boolean; divider?: React.ReactNode; onPreview?: () => void;
}) {
  const storageOrigin = useAuthStore(state => state.uiConfig.storageOrigin);
  const tenantId = useAuthStore(state => state.tenantId);
  const cache = useMemo(() => new SourcePageCache(undefined, storageOrigin),
    [evidence?.revision, evidence?.available, error, storageOrigin, tenantId]);
  useEffect(() => () => cache.clear(), [cache]);
  const [document, setDocument] = useState('');
  const [active, setActive] = useState('');
  const [page, setPage] = useState(1);
  const [zoom, setZoom] = useState(100);
  const scroll = useRef<HTMLDivElement>(null);
  const jumpTarget = useRef<number | null>(null);
  useSourcePageNavigation(scroll, zoom, setZoom, !!evidence?.available && !error && !loading, document);
  const zoomOptions = [...new Set([100, 125, 150, 200, 300, 400, zoom])].sort((a, b) => a - b);
  const refs = point?.references || [];
  const activeRef = refs.find(ref => ref.id === active);
  const pages = (evidence?.pages || []).filter(p => p.document_id === document);
  function jump(documentId: string, number: number) {
    jumpTarget.current = number;setDocument(documentId);setPage(number);
    requestAnimationFrame(() => {
      scroll.current?.querySelector(`[data-source-page="${number}"]`)?.scrollIntoView({block: 'start'});
    });
  }
  useEffect(() => {
    if (!point?.references.length) {setActive('');return;}
    const first = point.references[0];setActive(first.id);jump(first.document_id, first.page_number);
  }, [point]);
  useEffect(() => {
    if (evidence?.sources?.length && !evidence.sources.some(s => s.document_id === document)) jump(evidence.sources[0].document_id,
      evidence.pages?.find(p => p.document_id === evidence.sources![0].document_id)?.page_number || 1);
  }, [evidence, document]);
  useLayoutEffect(() => {
    if (jumpTarget.current != null) {
      scroll.current?.querySelector(`[data-source-page="${jumpTarget.current}"]`)?.scrollIntoView({block: 'start'});
      jumpTarget.current = null;
    }
  }, [document, page, zoom]);
  function visible(number: number) {
    setPage(number);
    setActive(current => {
      const selected = refs.find(ref => ref.id === current);
      if (selected?.document_id === document && selected.page_number === number) return current;
      return refs.find(ref => ref.document_id === document && ref.page_number === number)?.id || '';
    });
  }
  return <>
    <aside className="source-evidence-pane" aria-label="Source evidence">
      <header className="source-heading"><strong>Sources</strong><span>Supporting passages</span></header>
      {loading ? <p role="status" className="source-empty">Loading supporting evidence…</p>
        : error ? <p role="alert" className="source-empty">{error}</p>
        : !evidence?.available ? <p className="source-empty">{evidence?.message || 'Detailed evidence is unavailable for this revision.'}</p>
        : <div className="source-evidence-list" aria-label="Supporting passages">
          <p className="source-selection-label">{point ? `${refs.length} supporting passage${refs.length === 1 ? '' : 's'} · ${point.section}` : 'Click a point in the document to see its evidence.'}</p>
          {refs.map((ref, i) => <button key={ref.id} className={`source-evidence-item ${ref.id === active ? 'active' : ''}`}
            aria-current={ref.id === active ? 'true' : undefined}
            onClick={() => {setActive(ref.id);jump(ref.document_id, ref.page_number);onPreview?.();}}>
            <strong>{i + 1}. {ref.document_name} · p. {ref.page_number}</strong>
            <span className="source-card-quote">{ref.quote}</span>
            {ref.locator && <span className="source-card-location"><b>Location</b>{ref.locator}</span>}
            {!!ref.via?.length && <span className="source-card-analysis"><b>Via verified analysis</b>
              {ref.via.map((via, index) => <span key={index}><em>{via.section}</em>{via.quote}</span>)}
            </span>}
          </button>)}
        </div>}
    </aside>
    {divider}
    <aside className="source-preview-pane" aria-label="Source preview">
      <header className="source-heading"><strong>Preview</strong><span>Read-only original document</span></header>
      {evidence?.available && !error && !loading ? <>
        <div className="source-navigation">
          <select aria-label="Source document" value={document} onChange={e => {setActive('');jump(e.target.value,
            evidence.pages?.find(p => p.document_id === e.target.value)?.page_number || 1);}}>
            {evidence.sources?.map(source => <option key={source.document_id} value={source.document_id}>{source.name}</option>)}
          </select>
          <button className="annotation-button" aria-label="Previous source page" disabled={page <= (pages[0]?.page_number || 1)}
            onClick={() => jump(document, page - 1)}>‹</button>
          <label>Page <select aria-label="Source page" value={page} onChange={e => jump(document, Number(e.target.value))}>
            {pages.map(p => <option key={p.page_number} value={p.page_number}>{p.page_number}</option>)}</select></label>
          <button className="annotation-button" aria-label="Next source page" disabled={page >= (pages.at(-1)?.page_number || 1)}
            onClick={() => jump(document, page + 1)}>›</button>
          <select aria-label="Source zoom" value={zoom} onChange={e => {jumpTarget.current = page;setZoom(Number(e.target.value));}}>
            {zoomOptions.map(n => <option key={n} value={n}>{n === 100 ? 'Fit width' : `${n}%`}</option>)}
          </select>
        </div>
        <div className="source-pages-scroll" ref={scroll} data-zoomed={zoom > 100}>
          {pages.map(p => <LazyPage key={`${document}:${p.page_number}`} document={document} page={p.page_number}
            loader={loadPage} cache={cache} scrollRoot={scroll} onVisible={visible} zoom={zoom}
            referenceId={activeRef?.document_id === document && activeRef.page_number === p.page_number ? activeRef.id : undefined}
            regions={activeRef?.document_id === document && activeRef.page_number === p.page_number ? activeRef.regions || [] : []}
            quote={activeRef?.document_id === document && activeRef.page_number === p.page_number ? activeRef.quote : ''}/>)}
        </div>
      </> : <p className="source-empty">Original pages appear here when source evidence is available.</p>}
    </aside>
  </>;
}
