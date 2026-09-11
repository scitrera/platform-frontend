/**
 * displayThreadId strips the workspace prefix from a compound thread id.
 *
 * Cowork's runtime keys sandboxes with a compound `{workspace}:{thread_id}`
 * scope so the same logical thread id in different app workspaces stays
 * distinct. The compound form is the right thing to store, but operators
 * scanning the dashboard already know the workspace from the column next
 * to it — showing the full compound id is just noise.
 *
 * Splits on the first `:` and returns the trailing portion. Strings without
 * a colon are returned unchanged. Empty input yields empty output.
 */
export function displayThreadId(value: string | null | undefined): string {
    if (!value) return '';
    const idx = value.indexOf(':');
    return idx >= 0 ? value.slice(idx + 1) : value;
}
