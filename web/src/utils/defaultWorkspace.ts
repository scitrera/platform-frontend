/** Choose only a navigable workspace; templates and internal IDs are not homes. */
export function defaultWorkspace(
  workspaces: { private?: { id: string }[]; shared?: { id: string }[] },
  configured: string | null | undefined,
  showPrivate = true,
  autoSelect = true,
): string | null {
  if (!autoSelect) return null;
  const choices = [...(workspaces.private || []), ...(workspaces.shared || [])]
    .filter(w => (showPrivate && w.id === '_private') || (!w.id.startsWith('_') && !w.id.startsWith('workspace:')));
  if (configured && choices.some(w => w.id === configured)) return configured;
  if (showPrivate && choices.some(w => w.id === '_private')) return '_private';
  return choices[0]?.id || null;
}
