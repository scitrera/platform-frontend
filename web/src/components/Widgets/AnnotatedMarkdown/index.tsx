import React, {useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState} from 'react';
import {MessageSquarePlus, MessageSquare, Pencil, Trash2, Send, X} from 'lucide-react';
import {SciMarkdown} from '../../Apps/Chat/SciMarkdown';
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
}

type Anchor = NonNullable<ReturnType<typeof selectedAnchor>>;
type Placement = {id: string; top: number; rects: {top: number; left: number; width: number; height: number}[]; missing: boolean};

/** Text-anchored, controlled feedback. Persistence and submission belong to the host app. */
export function AnnotatedMarkdown({children, documentId, documentVersion, annotations, onChange, onSubmit,
  disabled = false, stale = false, submitLabel = 'Submit comments'}: AnnotatedMarkdownProps) {
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
  const editable = !disabled && !stale && !busy;

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
      const card = rail.current?.querySelector<HTMLElement>(`[data-comment-id="${p.id}"]`);
      bottom = p.top + (card?.offsetHeight || 180) + 12;
    }
    setPlacements(previous => JSON.stringify(previous) === JSON.stringify(placed) ? previous : placed);
  }, [visible, editor, stale, documentVersion]);

  useLayoutEffect(() => {
    measure();
    const observer = new ResizeObserver(measure);
    if (body.current) observer.observe(body.current);
    if (article.current) observer.observe(article.current);
    rail.current?.querySelectorAll('[data-comment-id]').forEach(node => observer.observe(node));
    return () => observer.disconnect();
  }, [measure]);
  useEffect(() => { setSelection(null); }, [documentId, documentVersion]);
  useEffect(() => { if (editor) editorInput.current?.focus(); }, [editor?.id]);
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
      await onChange([...annotations.filter(a => a.id !== editor.id), comment]);
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
    rail.current?.querySelector<HTMLElement>(`[data-comment-id="${id}"]`)?.focus({preventScroll: true});
  };
  const cardTop = (id: string) => placements.find(p => p.id === id)?.top || 0;
  const cards = [...visible, ...(editor && !visible.some(a => a.id === editor.id) ? [editor] : [])];
  const last = placements.at(-1);
  const height = last ? last.top + (rail.current?.querySelector<HTMLElement>(`[data-comment-id="${last.id}"]`)?.offsetHeight || 180) + 24 : 0;

  return <section className="annotated-markdown" aria-label="Document review">
    <div className="annotation-toolbar">
      <div className="annotation-instructions"><MessageSquare size={17} aria-hidden="true"/>
        <span>Select a passage to add a comment</span>
      </div>
      <button type="button" className="annotation-button" onMouseDown={e => e.preventDefault()} onClick={beginComment}
        disabled={!selection || !editable || !!editor}><MessageSquarePlus size={16} aria-hidden="true"/>Add comment</button>
      <button type="button" className="annotation-button annotation-primary" onClick={submit}
        disabled={!annotations.length || !editable || !!editor}>
        <Send size={15} aria-hidden="true"/>{busy ? 'Saving…' : `${submitLabel}${annotations.length ? ` (${annotations.length})` : ''}`}
      </button>
    </div>
    {error && <p className="annotation-notice annotation-error" role="alert">{error}</p>}
    {stale && <div className="annotation-notice" role="status">
      These comments refer to an earlier revision. Their quoted passages are retained below.
      <button type="button" className="annotation-button" disabled={busy || disabled} onClick={async () => {
        if (!window.confirm('Clear these earlier comments and start commenting on the current revision?')) return;
        setBusy(true);
        try { await onChange([]); setEditor(null); }
        catch (e) { setError(e instanceof Error ? e.message : 'Unable to clear comments.'); }
        finally { setBusy(false); }
      }}>Start comments on this revision</button>
    </div>}
    {disabled && <p className="annotation-notice" role="status">A review is in progress. Your saved comments are retained.</p>}
    <div className="annotation-scroll">
      <div className="annotation-body" ref={body} style={{'--comment-height': `${height}px`} as React.CSSProperties}>
        <div className="annotation-document" onPointerUp={captureSelection} onKeyUp={captureSelection}>
          <div className="annotation-text" ref={article} tabIndex={0} aria-label={`${documentId} document`}
            onClick={event => {
              if (!window.getSelection()?.isCollapsed) return;
              const bounds = body.current!.getBoundingClientRect();
              const x = event.clientX - bounds.left, y = event.clientY - bounds.top;
              const hit = placements.find(p => p.rects.some(r => x >= r.left && x <= r.left + r.width && y >= r.top && y <= r.top + r.height));
              if (hit) focusComment(hit.id);
            }}><SciMarkdown>{children}</SciMarkdown></div>
        </div>
        <div className="annotation-highlights" aria-hidden="true">
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
        </aside>
      </div>
    </div>
  </section>;
}
