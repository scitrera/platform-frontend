import { describe, expect, it } from 'vitest';
import { defaultWorkspace } from './defaultWorkspace';

describe('defaultWorkspace', () => {
  const workspaces = { private: [{ id: '_private' }], shared: [{ id: 'project' }, { id: 'second' }] };
  it('honors an accessible configured default', () => {
    expect(defaultWorkspace(workspaces, 'second')).toBe('second');
  });
  it('retains the personal home by default', () => {
    expect(defaultWorkspace(workspaces, 'missing')).toBe('_private');
  });
  it('uses a project when personal homes are disabled, including old defaults', () => {
    expect(defaultWorkspace(workspaces, '_private', false)).toBe('project');
    expect(defaultWorkspace({ shared: [{ id: 'project' }] }, 'missing')).toBe('project');
  });
  it('does not invent a home for an empty or internal-only navigation', () => {
    expect(defaultWorkspace({}, null, false)).toBeNull();
    expect(defaultWorkspace({ private: [{ id: '_private-user-hash' }] }, null, false)).toBeNull();
  });
});
