# Application panes and close controls

The header X dismisses a pane in the current browser. It does not cancel a task,
delete a document, or stop a service. Main and secondary application headers use
the same policy in `AppArea`:

| Pane configuration | Header X |
| --- | --- |
| Workspace/app selection prompt | Hidden |
| Explicit `closeable: false` | Hidden, in either pane |
| Explicit `closeable: true` | Shown, overriding workspace defaults |
| Secondary pane, no explicit setting | Shown |
| Main pane, no explicit setting | Hidden for the workspace's default app, a single-app workspace, or workspace mode `app-only`/`no-chat`; otherwise shown |

Disabling chat globally through `uiConfig.chatEnabled` does not itself disable
main-app closing. A tenant with multiple apps can close an app to return to its
app picker. Workspace mode `no-chat` retains its existing main-app close default.
Native Library, Sharing, Knowledgebase, Document Viewer and dynamic/iframe app
headers receive this policy. Admin and Workspace Settings have their own
navigation and do not render the standard pane X. Document dialogs, expanded
reading views and the chat rail have separate close/collapse controls.

## App-controlled previews

Dynamic JSX can supply an optional second argument to `switchApplication` or
`switchApplication2`. Existing calls with only an app ID remain supported:

```jsx
switchApplication2('_review_preview', {
    title: 'Preview',
    closeable: false,
    ownerAppId: 'document-review',
});
```

Use an explicit title for internal apps absent from the workspace's app list.
The title overrides the catalog name. `ownerAppId` associates a secondary pane
with its main app. Closing or replacing that main app removes the owned pane;
a late asynchronous request cannot reopen it after its owner has left. Changing
the selected document within the same app preserves the pane. Independent
secondary panes omit `ownerAppId` and retain their existing lifecycle.

`closeable` governs the header affordance, not an authorization or navigation
restriction. App code can still replace a preview or close it with
`switchApplication2(null)`. Programmatic main-app navigation (including browser
tools) also clears owned previews. A required companion preview should normally
have both `closeable: false` and `ownerAppId`; an independently opened reference
viewer should normally remain closeable.
