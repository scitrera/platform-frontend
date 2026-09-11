/**
 * Unit tests for ToolsWssClient.
 * Uses mock-socket to simulate a WebSocket server in jsdom.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Server as MockServer, WebSocket as MockWebSocket } from 'mock-socket';
import { ToolsWssClient } from './tools-wss-client';
import { makeRequest, makeSuccessResponse, makeErrorResponse, makeNotification, ErrorCodes } from './jsonrpc';

// Inject mock WebSocket into global scope (jsdom doesn't ship a real one)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(global as any).WebSocket = MockWebSocket;

const TEST_URL = 'ws://localhost:9999';
const MOCK_TOKEN = 'test-jwt-token';

function makeClient(overrides: Partial<ConstructorParameters<typeof ToolsWssClient>[0]> = {}) {
  return new ToolsWssClient({
    url: TEST_URL,
    getToken: async () => MOCK_TOKEN,
    callTimeoutMs: 2000,
    ...overrides,
  });
}

function waitFor(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms));
}

describe('ToolsWssClient', () => {
  let server: MockServer;

  beforeEach(() => {
    server = new MockServer(`${TEST_URL}/?access_token=${MOCK_TOKEN}`);
  });

  afterEach(() => {
    server.stop();
    vi.restoreAllMocks();
  });

  // -------------------------------------------------------------------------
  // Connection
  // -------------------------------------------------------------------------

  it('connects and emits connected event', async () => {
    const client = makeClient();
    let connected = false;
    client.addEventListener('connected', () => { connected = true; });

    await client.connect();
    await waitFor(50);

    expect(connected).toBe(true);
    expect(client.getState()).toBe('connected');
    client.close();
  });

  // -------------------------------------------------------------------------
  // ID correlation: call() resolves on matching response
  // -------------------------------------------------------------------------

  it('resolves call() with matched response result', async () => {
    server.on('connection', (socket) => {
      socket.on('message', (raw) => {
          const msg = JSON.parse(raw as string) as { id: string; method: string };
        if (msg.method === 'tools/register') {
          socket.send(JSON.stringify(makeSuccessResponse(msg.id, { accepted: ['test.tool'] })));
        }
      });
    });

    const client = makeClient();
    await client.connect();
    await waitFor(50);

    const result = await client.call<{ accepted: string[] }>('tools/register', {
      tools: [{ name: 'test.tool', description: 'A test tool', jsonSchema: {} }],
    });

    expect(result.accepted).toEqual(['test.tool']);
    client.close();
  });

  // -------------------------------------------------------------------------
  // Request timeout
  // -------------------------------------------------------------------------

  it('rejects call() after timeout with no server response', async () => {
    // Server receives message but never replies
    server.on('connection', () => { /* intentionally silent */ });

    const client = new ToolsWssClient({
      url: TEST_URL,
      getToken: async () => MOCK_TOKEN,
      callTimeoutMs: 100,
    });

    await client.connect();
    await waitFor(50);

    await expect(
      client.call('tools/register', { tools: [] }),
    ).rejects.toThrow('timed out');

    client.close();
  });

  // -------------------------------------------------------------------------
  // Server-initiated tools/call round-trip
  // -------------------------------------------------------------------------

  it('handles server-initiated tools/call and sends back result', async () => {
    const callId = 'srv-123';
    let serverReceivedReply: unknown = null;

    server.on('connection', (socket) => {
      // Wait for connect then send a tools/call request to the client
      socket.on('message', (raw) => {
          const msg = JSON.parse(raw as string) as { id?: string; method?: string };
        // Capture any response from the client (no id in notification ack)
        if (msg.id === callId) {
          serverReceivedReply = msg;
        }
      });

      // Send the request after a tiny delay so the client is ready
      setTimeout(() => {
        socket.send(JSON.stringify(
          makeRequest(callId, 'tools/call', { name: 'excel.read_range', args: { range: 'A1' } }),
        ));
      }, 30);
    });

    const client = makeClient();

    // Register a handler for tools/call
    client.setRequestHandler('tools/call', async (params) => {
      const p = params as { name: string; args: Record<string, unknown> };
      if (p.name === 'excel.read_range') {
        return { values: [[42]] };
      }
      throw new Error(`Unknown tool: ${p.name}`);
    });

    await client.connect();
    await waitFor(200);

    expect(serverReceivedReply).toMatchObject({
      jsonrpc: '2.0',
      id: callId,
      result: { values: [[42]] },
    });

    client.close();
  });

  // -------------------------------------------------------------------------
  // tools/call handler error → JSON-RPC error response
  // -------------------------------------------------------------------------

  it('returns JSON-RPC error when tools/call handler throws', async () => {
    const callId = 'srv-err-456';
    let serverReceivedReply: unknown = null;

    server.on('connection', (socket) => {
      socket.on('message', (raw) => {
          const msg = JSON.parse(raw as string) as { id?: string };
        if (msg.id === callId) {
          serverReceivedReply = msg;
        }
      });

      setTimeout(() => {
        socket.send(JSON.stringify(
          makeRequest(callId, 'tools/call', { name: 'excel.does_not_exist', args: {} }),
        ));
      }, 30);
    });

    const client = makeClient();

    client.setRequestHandler('tools/call', async (params) => {
      const p = params as { name: string };
      throw new Error(`Unknown tool: ${p.name}`);
    });

    await client.connect();
    await waitFor(200);

    expect(serverReceivedReply).toMatchObject({
      jsonrpc: '2.0',
      id: callId,
      error: {
        code: ErrorCodes.ToolExecutionFailed,
        message: 'Tool execution failed',
      },
    });

    client.close();
  });

  // -------------------------------------------------------------------------
  // Notification routing
  // -------------------------------------------------------------------------

  it('fans out notifications to all registered handlers', async () => {
    const received1: unknown[] = [];
    const received2: unknown[] = [];

    server.on('connection', (socket) => {
      setTimeout(() => {
        socket.send(JSON.stringify(
          makeNotification('chat/append_tokens', { thread_id: 't1', tokens: ' hello' }),
        ));
      }, 30);
    });

    const client = makeClient();
    client.setNotificationHandler('chat/append_tokens', (p) => { received1.push(p); });
    client.setNotificationHandler('chat/append_tokens', (p) => { received2.push(p); });

    await client.connect();
    await waitFor(150);

    expect(received1).toHaveLength(1);
    expect(received2).toHaveLength(1);
    expect((received1[0] as { tokens: string }).tokens).toBe(' hello');

    client.close();
  });

  // -------------------------------------------------------------------------
  // Unknown server-initiated method → MethodNotFound error reply
  // -------------------------------------------------------------------------

  it('replies MethodNotFound for unregistered server request', async () => {
    const callId = 'srv-unknown-789';
    let serverReceivedReply: unknown = null;

    server.on('connection', (socket) => {
      socket.on('message', (raw) => {
          const msg = JSON.parse(raw as string) as { id?: string };
        if (msg.id === callId) {
          serverReceivedReply = msg;
        }
      });

      setTimeout(() => {
        socket.send(JSON.stringify(
          makeRequest(callId, 'unknown/method', {}),
        ));
      }, 30);
    });

    const client = makeClient();
    await client.connect();
    await waitFor(200);

    expect(serverReceivedReply).toMatchObject({
      error: { code: ErrorCodes.MethodNotFound },
    });

    client.close();
  });

  // -------------------------------------------------------------------------
  // Error response from server → call() rejects
  // -------------------------------------------------------------------------

  it('rejects call() when server responds with error', async () => {
    server.on('connection', (socket) => {
      socket.on('message', (raw) => {
          const msg = JSON.parse(raw as string) as { id: string };
        socket.send(JSON.stringify(
          makeErrorResponse(msg.id, ErrorCodes.ToolNotFound, 'Tool not found', 'no_such_tool'),
        ));
      });
    });

    const client = makeClient();
    await client.connect();
    await waitFor(50);

    await expect(
      client.call('tools/call', { name: 'no_such_tool', args: {} }),
    ).rejects.toThrow('JSON-RPC error');

    client.close();
  });

  // -------------------------------------------------------------------------
  // workspaces/list round-trip
  // -------------------------------------------------------------------------

  it('listWorkspaces() resolves with workspace list', async () => {
    const fakeWorkspaces = [
      { id: 'ws-1', name: 'Marketing' },
      { id: 'ws-2', name: 'Engineering' },
    ];

    server.on('connection', (socket) => {
      socket.on('message', (raw) => {
        const msg = JSON.parse(raw as string) as { id: string; method: string };
        if (msg.method === 'workspaces/list') {
          socket.send(
            JSON.stringify(makeSuccessResponse(msg.id, { workspaces: fakeWorkspaces })),
          );
        }
      });
    });

    const client = makeClient();
    await client.connect();
    await waitFor(50);

    const result = await client.listWorkspaces();
    expect(result.workspaces).toHaveLength(2);
    expect(result.workspaces[0]).toMatchObject({ id: 'ws-1', name: 'Marketing' });
    expect(result.workspaces[1]).toMatchObject({ id: 'ws-2', name: 'Engineering' });

    client.close();
  });

  it('lists durable views and exact live hosts with opaque cursors', async () => {
    const methods: string[] = [];
    server.on('connection', (socket) => {
      socket.on('message', (raw) => {
        const msg = JSON.parse(raw as string) as { id: string; method: string };
        methods.push(msg.method);
        if (msg.method === 'workspace_views/list') {
          socket.send(JSON.stringify(makeSuccessResponse(msg.id, {
            workspace_id: 'ws-1',
            views: [{ workspace_id: 'ws-1', view_id: 'view-a', kind: 'git_worktree' }],
            next_page_token: 'view-cursor',
          })));
        } else if (msg.method === 'workspace_views/list_hosts') {
          socket.send(JSON.stringify(makeSuccessResponse(msg.id, {
            workspace_id: 'ws-1',
            view_id: 'view-a',
            hosts: [{
              binding: {
                schema_version: '1.0', workspace_id: 'ws-1', view_id: 'view-a',
                tool_host_id: 'host-a', execution_site: 'worker', revision: 'abc123',
              },
              capabilities: ['workspace.read'],
              observed_at: '2026-08-12T12:00:00Z',
            }],
            next_page_token: 'host-cursor',
          })));
        }
      });
    });

    const client = makeClient();
    await client.connect();
    await waitFor(50);
    const views = await client.listWorkspaceViews({
      workspace: 'ws-1', limit: 7, page_token: 'incoming-view',
    });
    const hosts = await client.listWorkspaceViewHosts({
      workspace: 'ws-1', view_id: 'view-a', limit: 9, page_token: 'incoming-host',
    });

    expect(methods).toEqual(['workspace_views/list', 'workspace_views/list_hosts']);
    expect(views.next_page_token).toBe('view-cursor');
    expect(hosts.hosts[0]?.binding).toMatchObject({ tool_host_id: 'host-a', revision: 'abc123' });
    expect(hosts.next_page_token).toBe('host-cursor');
    client.close();
  });

  // -------------------------------------------------------------------------
  // chat/send happy path: send message, receive streaming tokens, final result
  // -------------------------------------------------------------------------

  it('chatSend() sends message and resolves with task_id after streaming tokens', async () => {
    const receivedTokens: string[] = [];
    const threadId = 'thread-test-1';
    // Capture the canonical spec-native Sahara request.
    let chatSendParams: Record<string, unknown> | null = null;

    server.on('connection', (socket) => {
      socket.on('message', (raw) => {
        const msg = JSON.parse(raw as string) as {
          id: string;
          method: string;
          params: { thread_id: string } & Record<string, unknown>;
        };
        if (msg.method === 'chat/send') {
          chatSendParams = msg.params;
          // Send a few streaming token notifications
          socket.send(
            JSON.stringify(
              makeNotification('chat/append_tokens', {
                thread_id: msg.params.thread_id,
                tokens: 'Hello',
              }),
            ),
          );
          socket.send(
            JSON.stringify(
              makeNotification('chat/append_tokens', {
                thread_id: msg.params.thread_id,
                tokens: ' world',
              }),
            ),
          );
          // Send the final RPC response
          socket.send(
            JSON.stringify(
              makeSuccessResponse(msg.id, { message_id: 'msg-abc', task_id: 'task-abc' }),
            ),
          );
        }
      });
    });

    const client = makeClient();
    client.setNotificationHandler('chat/append_tokens', (raw) => {
      const p = raw as { thread_id: string; tokens: string };
      if (p.thread_id === threadId) receivedTokens.push(p.tokens);
    });

    await client.connect();
    await waitFor(50);

    const specMessage = {
      schema_version: '1.0',
      id: 'user-msg-rt-1',
      role: 'user' as const,
      created_at: '2026-05-26T12:00:00.000Z',
      content: [{ type: 'text' as const, text: 'Hello?' }],
      addr: {
        workspace_id: 'ws-1',
        thread_id: threadId,
        app_id: null,
      },
      meta: {},
      ref: null,
    };

    const result = await client.chatSend({
      thread_id: threadId,
      workspace: 'ws-1',
      message: specMessage,
    });

    await waitFor(50);

    expect(result.task_id).toBe('task-abc');
    expect(result.message_id).toBe('msg-abc');
    expect(receivedTokens).toEqual(['Hello', ' world']);

    // Assert the spec wire shape made it through verbatim.
    expect(chatSendParams).not.toBeNull();
    expect(chatSendParams!.thread_id).toBe(threadId);
    expect(chatSendParams!.workspace).toBe('ws-1');
    expect(chatSendParams!.message).toMatchObject({
      schema_version: '1.0',
      id: 'user-msg-rt-1',
      role: 'user',
      addr: { workspace_id: 'ws-1', thread_id: threadId },
    });
    // No legacy text/attachment shadow payload is emitted.
    expect(chatSendParams!.text).toBeUndefined();
    expect(chatSendParams!.attachments).toBeUndefined();

    client.close();
  });

  // -------------------------------------------------------------------------
  // chat/cancel round-trip
  // -------------------------------------------------------------------------

  it('chatCancel() sends chat/cancel and resolves', async () => {
    let cancelledTaskId = '';

    server.on('connection', (socket) => {
      socket.on('message', (raw) => {
        const msg = JSON.parse(raw as string) as { id: string; method: string; params: { task_id: string } };
        if (msg.method === 'chat/cancel') {
          cancelledTaskId = msg.params.task_id;
          socket.send(JSON.stringify(makeSuccessResponse(msg.id, {})));
        }
      });
    });

    const client = makeClient();
    await client.connect();
    await waitFor(50);

    await client.chatCancel('task-xyz');
    expect(cancelledTaskId).toBe('task-xyz');

    client.close();
  });

  // -------------------------------------------------------------------------
  // Reconnect: 'connected' fires on every open (including reconnects)
  // -------------------------------------------------------------------------

  it('emits connected twice when the socket is closed and reopens', async () => {
    // This test verifies that ws.onopen → _emit('connected') fires on every
    // WebSocket open, so any listener (e.g. workspace list fetcher) that is
    // registered once and listens for 'connected' will be called again after
    // a reconnect — without any code change needed in ChatApp.
    let connectedCount = 0;

    // mock-socket fires 'connection' for each client WebSocket that opens.
    // We capture the server-side socket so we can force-close it later.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let serverSocket: any = null;
    server.on('connection', (socket) => {
      serverSocket = socket;
    });

    const client = new ToolsWssClient({
      url: TEST_URL,
      getToken: async () => MOCK_TOKEN,
      callTimeoutMs: 2000,
    });

    client.addEventListener('connected', () => {
      connectedCount += 1;
    });

    await client.connect();
    await waitFor(100);

    expect(connectedCount).toBe(1);
    expect(client.getState()).toBe('connected');

    // Force the server side to close the socket — triggers client reconnect.
    serverSocket?.close();

    // Wait for the client to reconnect (default backoff 1000 ms for attempt 1,
    // but mock-socket reconnects are near-instant in tests because the server
    // is still listening).
    await waitFor(1500);

    expect(connectedCount).toBe(2);
    expect(client.getState()).toBe('connected');

    client.close();
  });
});
