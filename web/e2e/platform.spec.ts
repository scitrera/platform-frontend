import {test, expect, type Page, type WebSocketRoute} from '@playwright/test';

// Synthetic protocol fixtures only. These tests exercise the production bundle
// in a real browser; they do not authenticate to a deployed backend or Office.
const tenant = {id: 'demo', name: 'Demo Organization', default_workspace: '_private'};
const workspaces = {private: [{id: '_private', label: 'My workspace', default_app: null}], shared: [{id: 'project', label: 'Synthetic project', default_app: null}], hidden: [], templates: []};
const makeMessage = (text: string, id = 'saved') => ({schema_version: '1.0', id, role: 'assistant', created_at: '2026-01-01T00:00:00Z', addr: {tenant_id: 'demo', workspace_id: '_private', thread_id: '_default'}, content: [{type: 'text', text}], meta: {}, ref: null});

async function fixture(page: Page, options: {tenants?: object[]; authorized?: boolean; ready?: boolean; history?: boolean} = {}) {
  const sent: any[] = [];
  const sockets: WebSocketRoute[] = [];
  const external: string[] = [];
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.hostname !== '127.0.0.1') { external.push(url.href); return route.abort(); }
    if (url.pathname === '/api/auth/checkz') return route.fulfill({json: {auth: 'valid', email: 'tester@example.test', tenants: options.tenants ?? [tenant], authorized: options.authorized}});
    return route.continue();
  });
  await page.routeWebSocket(/\/rfe1-ws\/v2/, socket => {
    sockets.push(socket);
    const reply = (msg: any, payload: any) => socket.send(JSON.stringify({type: msg.type, ...(msg.id ? {id: msg.id, event: 'RPC'} : {}), payload}));
    socket.onMessage(raw => {
      const msg = JSON.parse(String(raw)); sent.push(msg);
      switch (msg.type) {
        case 'GET_USER_PROFILE': return reply(msg, {id: 'tester', email: 'tester@example.test', name: 'Synthetic Tester', tenant: new URL(socket.url()).searchParams.get('tenant'), tenants: ['demo', 'second'], permissions: {isTenantAdmin: true}, uiConfig: {enableDefaultThreads: true}});
        case 'GET_WORKSPACES': return reply(msg, workspaces);
        case 'GET_APPS': return reply(msg, []);
        case 'GET_BACKGROUND_TASKS': case 'CT_LIST': return reply(msg, []);
        case 'CHAT_GET_ACTIVE_TASKS': return reply(msg, {});
        case 'GET_CHAT_HISTORY': return reply(msg, {threadId: msg.payload.threadId || '_default', messages: options.history ? [makeMessage('Synthetic persisted conversation')] : []});
        case 'ADMIN_RPC_CALL': return socket.send(JSON.stringify({event: 'RPC', id: msg.id, type: 'RPX', payload: {message: 'Synthetic admin service unavailable'}}));
        default: if (msg.id) reply(msg, {});
      }
    });
    if (options.ready !== false) socket.send(JSON.stringify({type: 'CONNECTION_READY', payload: {}}));
  });
  return {sent, sockets, external, errors, push: (type: string, payload: any) => sockets.at(-1)!.send(JSON.stringify({type, payload}))};
}

test('authenticated denial has no login loop and signs out with POST', async ({page}) => {
  const f = await fixture(page, {authorized: false});
  let logoutMethod = '';
  await page.route('**/api/auth/auth/logout', route => {logoutMethod = route.request().method(); return route.fulfill({contentType: 'text/html', body: '<p>Signed out</p>'});});
  await page.goto('/demo/project?x=1&y=2');
  await expect(page.getByRole('heading', {name: 'Access not granted'})).toBeVisible();
  expect(f.sockets).toHaveLength(0);
  await page.screenshot({path: 'test-results/denied-desktop.png'});
  await page.getByRole('button', {name: 'Sign out'}).click();
  await expect(page.getByText('Signed out')).toBeVisible();
  expect(logoutMethod).toBe('POST'); expect(f.external).toEqual([]); expect(f.errors).toEqual([]);
});

test('expired session preserves query and fragment through login return', async ({page}) => {
  await fixture(page);
  await page.route('**/api/auth/checkz', route => route.fulfill({status: 401, json: {auth: 'invalid'}}));
  let returnUrl = '';
  await page.route('**/api/auth/login?*', route => {returnUrl = new URL(route.request().url()).searchParams.get('rd')!; return route.fulfill({contentType: 'text/html', body: '<p>Synthetic identity provider</p>'});});
  await page.goto('/demo/project?x=1&y=2#section');
  await expect(page.getByText('Synthetic identity provider')).toBeVisible();
  expect(returnUrl).toBe('http://127.0.0.1:4178/demo/project?x=1&y=2#section');
});

test('tenant selection and mobile empty state stay on the local origin', async ({page}) => {
  await page.setViewportSize({width: 390, height: 844});
  const f = await fixture(page, {tenants: [tenant, {id: 'second', name: 'Second Organization'}]});
  await page.goto('/');
  await expect(page.getByRole('heading', {name: 'Select Tenant'})).toBeVisible();
  await page.screenshot({path: 'test-results/tenant-mobile.png'});
  await page.getByText('Second Organization', {exact: true}).click();
  await expect(page).toHaveURL(/\/second/);
  await expect.poll(() => f.sockets.length).toBeGreaterThan(0);
  expect(new URL(f.sockets.at(-1)!.url()).searchParams.get('tenant')).toBe('second');
  expect(f.external).toEqual([]); expect(f.errors).toEqual([]);
});

test('opening a socket waits for server readiness; refusal stops application requests', async ({page}) => {
  const f = await fixture(page, {ready: false});
  await page.goto('/demo/_private');
  await expect.poll(() => f.sockets.length).toBe(1);
  expect(f.sent).toEqual([]);
  f.push('CONNECTION_REFUSED', {message: 'No tenant access', data: {code: 'no-grant'}});
  await expect(page.getByRole('heading', {name: /Cannot connect|Access not granted/})).toBeVisible();
  expect(f.sent).toEqual([]); expect(f.external).toEqual([]);
});

test('history reload, streaming, approvals, tool failures and reconnect', async ({page}) => {
  const f = await fixture(page, {history: true});
  await page.goto('/demo/_private');
  await expect(page.getByText('Synthetic persisted conversation')).toBeVisible();
  await expect.poll(() => f.sent.some(m => m.type === 'AGENT_TOOL_CATALOG')).toBe(true);
  f.push('AGENT_TOOL_CALL', {toolName: 'missing-synthetic-tool', callId: 'tool-negative', args: {}});
  await expect.poll(() => f.sent.find(m => m.type === 'AGENT_TOOL_RESULT' && m.payload.callId === 'tool-negative')?.payload.error).toBeTruthy();
  f.push('CHAT_MSG_TASK_STARTED', {threadId: '_default', taskId: 'synthetic-task', messageId: 'stream', startedAt: '2026-01-01T00:00:00Z'});
  f.push('CHAT_STREAM', {threadId: '_default', event: {event: 'message_started', message: makeMessage('Streaming', 'stream')}});
  f.push('CHAT_STREAM', {threadId: '_default', event: {event: 'token_delta', message_id: 'stream', index: 0, text: ' answer'}});
  await expect(page.getByText('Streaming answer', {exact: true})).toBeVisible();
  f.push('CHAT_STREAM', {threadId: '_default', event: {event: 'part_appended', message_id: 'stream', index: 1, part: {type: 'approval_request', id: 'approval', tool: 'write_file', summary: 'Write a synthetic note', status: 'pending', options: ['once']}}});
  await page.getByRole('button', {name: 'Allow once', exact: true}).click();
  await expect.poll(() => f.sent.filter(m => m.type === 'CHAT_MSG_CONTROL').length).toBe(1);
  expect(f.sent.find(m => m.type === 'CHAT_MSG_CONTROL').payload.taskId).toBe('synthetic-task');
  await page.screenshot({path: 'test-results/chat-desktop.png'});
  f.sockets.at(-1)!.close({code: 1000, reason: 'synthetic restart'});
  await expect.poll(() => f.sockets.length, {timeout: 10000}).toBe(2);
  expect(f.sent.filter(m => m.type === 'CHAT_MSG_CONTROL')).toHaveLength(1);
  await page.reload();
  await expect(page.getByText('Synthetic persisted conversation')).toBeVisible();
  expect(f.external).toEqual([]); expect(f.errors).toEqual([]);
});

test('supported embedded admin reports RPC failure without private admin', async ({page}) => {
  const f = await fixture(page);
  await page.goto('/demo/_tenant/admin-console/billing/usage');
  await expect(page.getByText('Synthetic admin service unavailable')).toBeVisible();
  expect(f.sent.some(m => m.type === 'ADMIN_RPC_CALL')).toBe(true);
  expect(f.external).toEqual([]); expect(f.errors).toEqual([]);
  await page.screenshot({path: 'test-results/admin-error.png'});
});


test('approval denial, cancellation and workspace tool invocation preserve scope', async ({page}) => {
  const f = await fixture(page);
  await page.goto('/demo/_private');
  await expect.poll(() => f.sent.some(m => m.type === 'AGENT_TOOL_CATALOG')).toBe(true);
  f.push('CHAT_MSG_TASK_STARTED', {threadId: '_default', taskId: 'deny-task', messageId: 'deny-msg'});
  const message = makeMessage('Review this request', 'deny-msg');
  (message.content as any[]).push({type: 'approval_request', id: 'deny-approval', tool: 'write_file', summary: 'Synthetic denied write', status: 'pending', options: ['once']});
  f.push('CHAT_STREAM', {threadId: '_default', event: {event: 'message_started', message}});
  await page.getByRole('button', {name: 'Deny', exact: true}).click();
  await expect.poll(() => f.sent.find(m => m.type === 'CHAT_MSG_CONTROL')?.payload.taskId).toBe('deny-task');
  const decision = f.sent.find(m => m.type === 'CHAT_MSG_CONTROL').payload;
  expect(decision.workspace).toBe('_private');
  expect(decision.message.content[0].kind).toBe('deny');
  await page.getByTitle('Stop the agent').click();
  await expect.poll(() => f.sent.find(m => m.type === 'CHAT_MSG_CANCEL')?.payload.taskId).toBe('deny-task');
  f.push('AGENT_TOOL_CALL', {toolName: 'frontend_switch_workspace', callId: 'switch', args: {id: 'project'}});
  await expect.poll(() => f.sent.find(m => m.type === 'AGENT_TOOL_RESULT' && m.payload.callId === 'switch')?.payload.result).toBe('project');
  await expect(page).toHaveURL('/demo/project');
  await expect(page.getByRole('heading', {name: 'Synthetic project'})).toBeVisible();
  expect(f.external).toEqual([]); expect(f.errors).toEqual([]);
});

test('a valid session without tenants shows an actionable empty state', async ({page}) => {
  const f = await fixture(page, {tenants: []});
  await page.goto('/');
  await expect(page.getByRole('heading', {name: 'No workspaces available'})).toBeVisible();
  expect(f.sockets).toHaveLength(0);
  expect(f.external).toEqual([]);
});
