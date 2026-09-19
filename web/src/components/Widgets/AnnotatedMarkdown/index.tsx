import React, {useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState} from 'react';
import {MessageSquarePlus, MessageSquare, Pencil, Trash2, Send, X, Maximize2, Minimize2} from 'lucide-react';
import {SciMarkdown} from '../../Apps/Chat/SciMarkdown';
import {SourceEvidencePane, type ReviewEvidence, type SourcePageLoader} from './SourceEvidencePane';
import {locateAnchor, selectedAnchor, type TextAnnotation} from './anchors';

export type {TextAnnotation} from './anchors';
export interface AnnotatedMarkdownProps {
  children: string;
  documentId: string;
  documentVersion: string;
  annotations: TextAnnotation[];
  onChange: (annotations: TextAnnotation[]) => Promise<unknown>;
  onSubmit: () => Promise<unknown>;
  disabled?: boolean;
  stale?: boolean;
  submitLabel?: string;
  expandedOnly?: boolean;
  allowComments?: boolean;
  title?: string;
  toolbarActions?: React.ReactNode;
  expandedTabs?: React.ReactNode;
  loadEvidence?: () => Promise<ReviewEvidence>;
  loadSourcePage?: SourcePageLoader;
}

type Anchor = NonNullable<ReturnType<typeof selectedAnchor>>;
type Placement = {id: string; top: number; rects: {top: number; left: number; width: number; height: number}[]; missing: boolean};

/** Text-anchored, controlled feedback. Persistence and submission belong to the host app. */
export function AnnotatedMarkdown({children, documentId, documentVersion, annotations, onChange, onSubmit,
  disabled = false, stale = false, submitLabel = 'Submit comments', expandedOnly = false, allowComments = true, title = '',
  toolbarActions, expandedTabs, loadEvidence, loadSourcePage}: AnnotatedMarkdownProps) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [expanded, setExpanded] = useState(false);
  const scroll = useRef<HTMLDivElement>(null);
  const scrollPositions = useRef<Record<string, number>>({});
  useLayoutEffect(() => {
    if (scroll.current) scroll.current.scrollTop = scrollPositions.current[documentId] || 0;
  }, [expanded, documentId]);
  const commentsVisible = allowComments && (!expandedOnly || expanded);
  const loaders = useRef({loadEvidence, loadSourcePage}); loaders.current = {loadEvidence, loadSourcePage};
  const [evidence, setEvidence] = useState<ReviewEvidence | null>(null);
  const [evidenceError, setEvidenceError] = useState('');
  const [evidenceLoading, setEvidenceLoading] = useState(false);
  const [selectedPoint, setSelectedPoint] = useState<string>('');
  const [leftWidth, setLeftWidth] = useState(47);
  const [sourceWidth, setSourceWidth] = useState(19);
  const [mobilePane, setMobilePane] = useState('document');
  const workspace = useRef<HTMLDivElement>(null);
  const points = evidence?.documents?.[documentId]?.document_version === documentVersion
    ? evidence.documents[documentId].points : [];
  const point = points.find(p => p.id === selectedPoint) || null;
  useEffect(() => {
    let active = true;
    setEvidence(null);setEvidenceError('');setSelectedPoint('');
    if (!expanded || !loaders.current.loadEvidence) return;
    setEvidenceLoading(true);
    loaders.current.loadEvidence().then(value => {if (active) setEvidence(value);})
      .catch(e => {if (active) setEvidenceError(e instanceof Error ? e.message : 'Unable to load evidence.');})
      .finally(() => {if (active) setEvidenceLoading(false);});
    return () => {active = false;};
  }, [expanded, documentId, documentVersion]);
  const article = useRef<HTMLDivElement>(null);
  const body = useRef<HTMLDivElement>(null);
  const rail = useRef<HTMLElement>(null);
  const editorInput = useRef<HTMLTextAreaElement>(null);
  const [selection, setSelection] = useState<Anchor | null>(null);
  const [editor, setEditor] = useState<TextAnnotation | null>(null);
  const [active, setActive] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [placements, setPlacements] = useState<Placement[]>([]);
  const visible = useMemo(() => annotations.filter(a => a.document === documentId), [annotations, documentId]);
  const editable = commentsVisible && !disabled && !stale && !busy;

  const findCard = (id: string) => Array.from(rail.current?.querySelectorAll<HTMLElement>('[data-comment-id]') || [])
    .find(card => card.dataset.commentId === id);

  const measure = useCallback(() => {
    if (!article.current || !body.current) return;
    const bounds = body.current.getBoundingClientRect();
    let bottom = 0;
    const placed = [...visible, ...(editor && !visible.some(a => a.id === editor.id) && editor.document === documentId ? [editor] : [])]
      .map(a => {
        const range = !stale && a.document_version === documentVersion ? locateAnchor(article.current!, a) : null;
        const rects = range ? Array.from(range.getClientRects()).filter(r => r.width && r.height)
          .map(r => ({top: r.top - bounds.top, left: r.left - bounds.left, width: r.width, height: r.height})) : [];
        return {id: a.id, top: rects[0]?.top || 0, rects, missing: !range};
      }).sort((a, b) => a.top - b.top);
    for (const p of placed) {
      p.top = Math.max(bottom, p.top);
      const card = findCard(p.id);
      bottom = p.top + (card?.offsetHeight || 180) + 12;
    }
    setPlacements(previous => JSON.stringify(previous) === JSON.stringify(placed) ? previous : placed);
  }, [visible, editor, stale, documentVersion, expanded]);

  useLayoutEffect(() => {
    measure();
    const observer = new ResizeObserver(measure);
    if (body.current) observer.observe(body.current);
    if (article.current) observer.observe(article.current);
    rail.current?.querySelectorAll('[data-comment-id]').forEach(node => observer.observe(node));
    return () => observer.disconnect();
  }, [measure]);
  useEffect(() => { setSelection(null); }, [documentId, documentVersion]);
  useLayoutEffect(() => {
    if (!expanded || !article.current) return;
    const bullets = Array.from(article.current.querySelectorAll<HTMLElement>('li')).filter(li => !li.parentElement?.closest('li'));
    if (points.length !== bullets.length) return;
    bullets.forEach((li, index) => {
      li.dataset.evidencePoint = points[index].id;
      li.tabIndex = 0; li.setAttribute('role', 'button');
      li.setAttribute('aria-label', `Show evidence: ${li.textContent?.slice(0, 130)}`);
      li.classList.toggle('evidence-point-active', points[index].id === selectedPoint);
    });
    return () => bullets.forEach(li => {
      delete li.dataset.evidencePoint;li.removeAttribute('tabindex');li.removeAttribute('role');li.removeAttribute('aria-label');li.classList.remove('evidence-point-active');
    });
  }, [expanded, points, selectedPoint, children]);
  const selectPoint = (target: EventTarget | null) => {
    const node = target instanceof Element ? target.closest<HTMLElement>('[data-evidence-point]') : null;
    if (node && article.current?.contains(node)) {setSelectedPoint(node.dataset.evidencePoint || '');setMobilePane('sources');}
  };
  useEffect(() => {
    if (expanded) dialog.current?.showModal();
    else dialog.current?.close();
    if (editor) editorInput.current?.focus();
  }, [expanded, editor?.id]);
  useEffect(() => {
    if (!editor) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [editor]);

  const captureSelection = () => {
    if (!article.current || !editable) return;
    const selected = selectedAnchor(article.current, window.getSelection());
    setSelection(selected);
  };
  const beginComment = () => {
    if (!selection || !editable) return;
    if (editor) { setError('Save or cancel your open comment first.'); return; }
    const id = `comment-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
    setEditor({id, document: documentId, document_version: documentVersion, ...selection, comment: ''});
    setActive(id); setSelection(null); setError('');
    window.getSelection()?.removeAllRanges();
  };
  const save = async () => {
    if (!editor?.comment.trim()) return;
    setBusy(true); setError('');
    try {
      const comment = {...editor, comment: editor.comment.trim()};
      await onChange(annotations.some(a => a.id === editor.id)
        ? annotations.map(a => a.id === editor.id ? comment : a) : [...annotations, comment]);
      setEditor(null);
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to save this comment. Your text is retained.'); }
    finally { setBusy(false); }
  };
  const remove = async (id: string) => {
    setBusy(true); setError('');
    try { await onChange(annotations.filter(a => a.id !== id)); if (editor?.id === id) setEditor(null); }
    catch (e) { setError(e instanceof Error ? e.message : 'Unable to remove the comment.'); }
    finally { setBusy(false); }
  };
  const submit = async () => {
    setBusy(true); setError('');
    try { await onSubmit(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Unable to submit comments. Your draft is retained.'); }
    finally { setBusy(false); }
  };
  const focusComment = (id: string) => {
    setActive(id);
    findCard(id)?.focus({preventScroll: true});
  };
  const cardTop = (id: string) => placements.find(p => p.id === id)?.top || 0;
  const cards = [...visible, ...(editor && !visible.some(a => a.id === editor.id) ? [editor] : [])];
  const last = placements.at(-1);
  const height = last ? last.top + (findCard(last.id)?.offsetHeight || 180) + 24 : 0;

  const content = <section className={`annotated-markdown ${commentsVisible ? '' : 'annotation-compact'}`} aria-label="Document review">
    <div className="annotation-toolbar">
      {!(expanded && expandedOnly && loadSourcePage) && <button type="button" className="annotation-button" onClick={() => setExpanded(!expanded)}
        aria-label={expanded ? 'Close expanded view' : 'Expand document'} title={expanded ? 'Close expanded view' : 'Expand document'}>
        {expanded ? <Minimize2 size={16}/> : <Maximize2 size={16}/>}<span>{expanded ? 'Close' : `Expand${expandedOnly && editor ? ' (unsaved comment)' : expandedOnly && annotations.length ? ` (${annotations.length} comments)` : ''}`}</span>
      </button>}
      {commentsVisible ? <>
      <div className="annotation-instructions"><MessageSquare size={17} aria-hidden="true"/>
        <span>Select a passage to add a comment</span>
      </div>
      <button type="button" className="annotation-button" onMouseDown={e => e.preventDefault()} onClick={beginComment}
        disabled={!selection || !editable || !!editor}><MessageSquarePlus size={16} aria-hidden="true"/>Add comment</button>
      <button type="button" className="annotation-button annotation-primary" onClick={submit}
        disabled={!annotations.length || !editable || !!editor}>
        <Send size={15} aria-hidden="true"/>{busy ? 'Saving…' : `${submitLabel}${annotations.length ? ` (${annotations.length})` : ''}`}
      </button>
      </> : <div className="annotation-toolbar-actions"><fieldset disabled={!!editor || busy} style={{border: 0, padding: 0, margin: 0}}>{toolbarActions}</fieldset>
        {editor && <span className="annotation-unsaved">Expand to save or cancel your open comment.</span>}</div>}
    </div>
    {commentsVisible && error && <p className="annotation-notice annotation-error" role="alert">{error}</p>}
    {commentsVisible && stale && <div className="annotation-notice" role="status">
      These comments refer to an earlier revision. Their quoted passages are retained below.
      <button type="button" className="annotation-button" disabled={busy || disabled} onClick={async () => {
        if (!window.confirm('Clear these earlier comments and start commenting on the current revision?')) return;
        setBusy(true);
        try { await onChange([]); setEditor(null); }
        catch (e) { setError(e instanceof Error ? e.message : 'Unable to clear comments.'); }
        finally { setBusy(false); }
      }}>Start comments on this revision</button>
    </div>}
    {commentsVisible && disabled && <p className="annotation-notice" role="status">A review is in progress. Your saved comments are retained.</p>}
    <div className="annotation-scroll" ref={scroll} onScroll={e => {scrollPositions.current[documentId] = e.currentTarget.scrollTop;}}>
      <div className="annotation-body" ref={body} style={{'--comment-height': `${height}px`} as React.CSSProperties}>
        <div className="annotation-document" onPointerUp={captureSelection} onKeyUp={captureSelection}>
          <div className="annotation-text" ref={article} tabIndex={0} aria-label={`${documentId} document`}
            onClick={event => {
              if (!window.getSelection()?.isCollapsed) return;
              const bounds = body.current!.getBoundingClientRect();
              const x = event.clientX - bounds.left, y = event.clientY - bounds.top;
              const hit = placements.find(p => p.rects.some(r => x >= r.left && x <= r.left + r.width && y >= r.top && y <= r.top + r.height));
              if (hit && commentsVisible) focusComment(hit.id);
              if (expanded) selectPoint(event.target);
            }} onKeyDown={event => {
              if (expanded && (event.key === 'Enter' || event.key === ' ') && event.target instanceof HTMLElement && event.target.dataset.evidencePoint) {
                event.preventDefault();selectPoint(event.target);
              }
            }}><SciMarkdown>{children}</SciMarkdown></div>
        </div>
        {commentsVisible && <><div className="annotation-highlights" aria-hidden="true">
          {placements.flatMap(p => p.rects.map((r, index) => <span key={`${p.id}-${index}`}
            className={p.id === active ? 'annotation-highlight active' : 'annotation-highlight'} style={r}/>))}
        </div>
        <aside className="annotation-rail" ref={rail} aria-label="Margin comments">
          {!cards.length && <div className="annotation-empty"><MessageSquarePlus size={25} aria-hidden="true"/>
            <strong>Review in the margin</strong><p>Highlight text, add your feedback, and save each comment. Submit them together when you’re ready.</p>
            {!!annotations.length && <p>{annotations.length} saved comment(s) on another document tab.</p>}
          </div>}
          {cards.map((comment, index) => {
            const editing = editor?.id === comment.id;
            const missing = placements.find(p => p.id === comment.id)?.missing;
            return <article key={comment.id} data-comment-id={comment.id} tabIndex={-1}
              className={`annotation-card ${active === comment.id ? 'active' : ''}`} style={{'--comment-top': `${cardTop(comment.id)}px`} as React.CSSProperties}
              onFocus={() => setActive(comment.id)}>
              <div className="annotation-card-heading"><span>Comment {index + 1}</span><span className="annotation-document-label">{comment.document}</span></div>
              <button type="button" className="annotation-quote" onClick={() => {
                setActive(comment.id);
                const range = !stale && article.current ? locateAnchor(article.current, comment) : null;
                const element = range?.startContainer.parentElement;
                element?.scrollIntoView({block: 'center', behavior: 'smooth'});
              }}>{comment.quote}</button>
              {missing && <p className="annotation-anchor-note">{stale ? 'Earlier revision' : 'Passage could not be located in this view'}</p>}
              {editing ? <>
                <label className="annotation-editor-label" htmlFor={`${comment.id}-text`}>Your comment</label>
                <textarea id={`${comment.id}-text`} ref={editorInput} value={editor.comment} maxLength={2000} rows={4}
                  placeholder="What should the reviewer check or change?" disabled={busy || disabled || stale}
                  onChange={e => setEditor({...editor, comment: e.target.value})}
                  onKeyDown={e => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {e.preventDefault(); void save();} }}/>
                <div className="annotation-card-actions"><button type="button" className="annotation-button" disabled={busy} onClick={() => setEditor(null)}><X size={14} aria-hidden="true"/>Cancel</button>
                  <button type="button" className="annotation-button annotation-primary" disabled={!editor.comment.trim() || !editable} onClick={save}>Save comment</button></div>
              </> : <><p className="annotation-comment-text">{comment.comment}</p>
                <div className="annotation-card-actions"><span className="annotation-saved">Saved</span>
                  <button type="button" className="annotation-icon-button" aria-label={`Edit comment ${index + 1}`} disabled={!editable || !!editor} onClick={() => {setEditor(comment);setError('');}}><Pencil size={14}/></button>
                  <button type="button" className="annotation-icon-button" aria-label={`Delete comment ${index + 1}`} disabled={!editable || !!editor} onClick={() => remove(comment.id)}><Trash2 size={14}/></button></div>
              </>}
            </article>;
          })}
        </aside></>}
      </div>
    </div>
  </section>;
  return <>
    {!expanded && content}
    <dialog className="annotation-dialog" ref={dialog} aria-label="Expanded document review"
      onCancel={() => setExpanded(false)} onClose={() => setExpanded(false)}>
      {expanded && (expandedOnly && loadSourcePage ? <div className="expanded-review-shell">
        <header className="expanded-review-header"><strong>{title || 'Document review'}</strong>{expandedTabs}
          <div className="review-mobile-switch"><button className="annotation-button" onClick={() => setMobilePane('document')}>Document</button>
            <button className="annotation-button" onClick={() => setMobilePane('sources')}>Sources</button>
            <button className="annotation-button" onClick={() => setMobilePane('preview')}>Preview</button></div>
          <button className="annotation-button" aria-label="Close review" onClick={() => setExpanded(false)}><X size={16}/>Close</button>
        </header>
        <div ref={workspace} className={`expanded-review-workspace mobile-${mobilePane}`}
          style={{'--review-left': `${leftWidth}fr`, '--review-sources': `${sourceWidth}fr`, '--review-right': `${100 - leftWidth - sourceWidth}fr`} as React.CSSProperties}>
          <div className="expanded-review-document">{content}</div>
          <div className="review-divider" role="separator" aria-label="Resize document and sources" aria-orientation="vertical"
            tabIndex={0} aria-valuenow={leftWidth} aria-valuemin={35} aria-valuemax={Math.min(60, 75 - sourceWidth)}
            onKeyDown={e => {if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {e.preventDefault();setLeftWidth(n => Math.max(35, Math.min(60, 75 - sourceWidth, n + (e.key === 'ArrowRight' ? 2 : -2))));}}}
            onPointerDown={e => {e.currentTarget.setPointerCapture(e.pointerId);}}
            onPointerMove={e => {if (!e.currentTarget.hasPointerCapture(e.pointerId) || !workspace.current) return;
              const box = workspace.current.getBoundingClientRect();setLeftWidth(Math.max(35, Math.min(60, 75 - sourceWidth, (e.clientX - box.left) * 100 / box.width)));}}
            onPointerUp={e => {if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);}}/>
          <SourceEvidencePane evidence={evidence} point={point} loading={evidenceLoading} error={evidenceError}
            onPreview={() => setMobilePane('preview')}
            divider={<div className="review-divider" role="separator" aria-label="Resize sources and preview" aria-orientation="vertical"
              tabIndex={0} aria-valuenow={sourceWidth} aria-valuemin={15} aria-valuemax={Math.min(30, 75 - leftWidth)}
              onKeyDown={e => {if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {e.preventDefault();setSourceWidth(n => Math.max(15, Math.min(30, 75 - leftWidth, n + (e.key === 'ArrowRight' ? 2 : -2))));}}}
              onPointerDown={e => {e.currentTarget.setPointerCapture(e.pointerId);}}
              onPointerMove={e => {if (!e.currentTarget.hasPointerCapture(e.pointerId) || !workspace.current) return;
                const box = workspace.current.getBoundingClientRect();setSourceWidth(Math.max(15, Math.min(30, 75 - leftWidth, (e.clientX - box.left) * 100 / box.width - leftWidth)));}}
              onPointerUp={e => {if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);}}/>}
            loadPage={(doc, page) => loaders.current.loadSourcePage!(doc, page)}/>
        </div>
      </div> : content)}
    </dialog>
  </>;
}
