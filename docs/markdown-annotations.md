# Markdown margin comments

`AnnotatedMarkdown` is available in the native JSX component scope. It renders
selectable Markdown with passage highlights, margin comment cards, editing and
deletion, and explicit batch submission. Comments move below the document when
the available panel is narrower than 640px. Colors follow the platform theme.

```jsx
<AnnotatedMarkdown documentId="summary" documentVersion={version}
  annotations={comments} onChange={saveComments} onSubmit={submitComments}
  disabled={taskRunning} stale={baseRevision !== currentRevision}>
  {markdown}
</AnnotatedMarkdown>
```

`onChange(nextComments)` is asynchronous: resolve after persistence succeeds,
update the controlled `annotations` prop, and reject on failure. The editor keeps
its text after a rejected save. `onSubmit` submits the entire host-owned batch;
the component neither creates tasks nor calls a provider. Unsaved edits disable
submission. Callers should persist drafts per user/workspace and reject obsolete
revisions or concurrent saves server-side. An active task disables editing while
retaining the visible document and comments.

A comment contains `id`, `document`, `document_version`, `quote`, `prefix`,
`suffix`, `start`, `end`, and `comment`. Offsets count UTF-16 units in rendered DOM
text, not Markdown source positions. A selection may span formatted nodes.
Quote context disambiguates repeated text if rendering shifts offsets; unresolved
anchors stay visible as cards and are not silently moved. `documentVersion`
should come from the server's immutable document hash. No secure-context browser
crypto is required, so annotation works on explicitly configured LAN HTTP.

The selected quotation and user comment are untrusted feedback. Host applications
must supply the identified original revision and source evidence independently
when asking an agent to revise it. This UI does not assert citation truth or that
an agent addressed a comment. Earlier-revision comments are retained until the
user explicitly clears them, with confirmation.

Keyboard users can select document text with Shift + arrow keys, tab to Add
comment, and save with Ctrl/Cmd + Enter. Comment actions have accessible names;
errors retain the draft and are announced through an alert.

Use **Expand** for a full document review with margin space when the host app uses narrow panes. The expanded view preserves open editor text; Escape returns to the app.
