/**
 * Top-level chat component for the Office add-in task pane.
 *
 * Responsibilities:
 *   - Manages thread state via useReducer (chat.ts)
 *   - Creates and owns a ToolsWssClient instance
 *   - Registers host-specific tool catalogs on connect
 *   - Dispatches server notifications to chat state
 *   - Handles server-initiated tools/call requests
 *   - Fetches workspace list on connect and shows WorkspacePicker in header
 *   - Renders: header (HostBadge + WorkspacePicker + StatusBar + New button) + MessageList + MessageInput
 */
import React, { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { PlusCircle, LogOut } from 'lucide-react';

import { putExecutionBinding, type StreamEvent } from '@scitrera/messaging-spec';

import { useAuth } from '../../auth/auth-context';
import { detectHost } from '../../host/detect';
import { excelTools } from '../../host/office-tools/excel';
import { wordTools } from '../../host/office-tools/word';
import { powerPointTools } from '../../host/office-tools/powerpoint';
import type { LocalToolDef } from '../../host/office-tools/types';
import { ToolsWssClient } from '../../ws/tools-wss-client';
import type { WorkspaceInfo } from '../../ws/tools-wss-client';
import { TOOLS_WSS_URL } from '../../lib/env';
import {
  chatMessageList,
  chatReducer,
  makeInitialState,
  userInputToSpecMessage,
} from '../../state/chat';
import { clientEventToConnectionState } from '../../state/connection';

import { MessageList } from './MessageList';
import { MessageInput } from './MessageInput';
import { StatusBar } from '../UI/StatusBar';
import { HostBadge } from '../UI/HostBadge';
import { WorkspacePicker } from '../UI/WorkspacePicker';
import {
  ExecutionViewPicker,
  type ExecutionSelection,
} from '../UI/ExecutionViewPicker';
import { Button } from '../UI/Button';

// ---------------------------------------------------------------------------
// Notification payload shapes (per PROTOCOL.md)
// ---------------------------------------------------------------------------

/**
 * Spec ``chat/stream`` notification payload — carries a universal
 * ``StreamEvent`` envelope emitted by Sahara through Platform Bridge/tools-wss.
 */
interface ChatStreamParams {
  threadId: string;
  event: StreamEvent;
}

interface ProgressNotifyParams {
  id: string;
  kind: string;
  payload?: { summary?: string; completion?: number; thread_id?: string };
}

interface ToolsCallParams {
  name: string;
  args: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// ChatApp
// ---------------------------------------------------------------------------

export default function ChatApp() {
  const { token, status: authStatus, refresh: refreshAuth, logout } = useAuth();
  const host = useMemo(() => detectHost(), []);

  const [state, dispatch] = useReducer(chatReducer, undefined, makeInitialState);
  const [executionSelection, setExecutionSelection] = useState<ExecutionSelection | null>(null);
  const executionSelectionRef = useRef<ExecutionSelection | null>(null);
  useEffect(() => { executionSelectionRef.current = executionSelection; }, [executionSelection]);

  // Keep refs so notification handlers (registered once) always read current values.
  const threadIdRef = useRef(state.threadId);
  useEffect(() => {
    threadIdRef.current = state.threadId;
  }, [state.threadId]);

  const currentWorkspaceRef = useRef(state.currentWorkspace);
  useEffect(() => {
    currentWorkspaceRef.current = state.currentWorkspace;
  }, [state.currentWorkspace]);

  // ---------------------------------------------------------------------------
  // Tool catalog for current host
  // ---------------------------------------------------------------------------

  const toolCatalog = useMemo((): LocalToolDef[] => {
    switch (host) {
      case 'EXCEL':
        return excelTools;
      case 'WORD':
        return wordTools;
      case 'POWERPOINT':
        return powerPointTools;
      default:
        return [];
    }
  }, [host]);

  const toolMap = useMemo(
    () => new Map(toolCatalog.map((t) => [t.name, t])),
    [toolCatalog],
  );

  // ---------------------------------------------------------------------------
  // WebSocket client
  //
  // The client instance lives in state so it can be passed to WorkspacePicker
  // during render without reading a ref (which the react-hooks/refs rule forbids
  // during render). The ref is still used in callbacks/effects where we need a
  // stable reference that won't trigger re-renders.
  // ---------------------------------------------------------------------------

  const [wsClient, setWsClient] = useState<ToolsWssClient | null>(null);
  // Stable ref used inside callbacks — always mirrors wsClient.
  const clientRef = useRef<ToolsWssClient | null>(null);

  const getToken = useCallback(async (): Promise<string> => {
    if (token) return token;
    await refreshAuth();
    if (!token) throw new Error('No auth token available');
    return token;
  }, [token, refreshAuth]);

  // Register tools and notification handlers once the client is created.
  const registerHandlers = useCallback(
    (client: ToolsWssClient) => {
      // Connection events → connection state
      const events = ['connected', 'disconnected', 'reconnecting', 'auth-failed', 'error'] as const;
      events.forEach((evt) => {
        client.addEventListener(evt, () => {
          const newState = clientEventToConnectionState(evt);
          if (newState) dispatch({ type: 'SET_CONNECTION_STATE', state: newState });
        });
      });

      // On connect: register tool catalog and fetch workspace list.
      client.addEventListener('connected', () => {
        if (toolCatalog.length > 0) {
          void client
            .call('tools/register', {
              tools: toolCatalog.map(({ name, description, jsonSchema }) => ({
                name,
                description,
                jsonSchema,
              })),
            })
            .catch((err: unknown) =>
              console.error('[ChatApp] tools/register failed:', err),
            );
        }

        // Fetch workspaces and populate state.
        void client
          .listWorkspaces()
          .then((result) => {
            dispatch({ type: 'WORKSPACES_LOADED', workspaces: result.workspaces });
          })
          .catch((err: unknown) => {
            console.error('[ChatApp] workspaces/list failed:', err);
          });
      });

      // Server → client: spec stream events (Phase 5 / Route 2).
      // The router translates Sahara's spec stream output into a single
      // ``chat/stream`` notification carrying a universal ``StreamEvent``
      // envelope. The reducer applies it via ``applyEvent`` from
      // ``@scitrera/messaging-spec``.
      client.setNotificationHandler('chat/stream', (raw) => {
        const params = raw as ChatStreamParams | undefined;
        if (!params || !params.event) return;
        if (params.threadId && params.threadId !== threadIdRef.current) return;
        dispatch({ type: 'APPLY_SPEC_EVENT', event: params.event });
      });

      // Server → client: progress
      client.setNotificationHandler('progress/notify', (raw) => {
        const params = raw as ProgressNotifyParams;
        if (params.kind === 'done') {
          if (
            !params.payload?.thread_id ||
            params.payload.thread_id === threadIdRef.current
          ) {
            dispatch({ type: 'SET_STREAMING_DONE' });
          }
        } else {
          if (
            params.id &&
            params.kind === 'running' &&
            params.payload?.thread_id === threadIdRef.current
          ) {
            dispatch({ type: 'SET_PENDING_TASK', taskId: params.id });
          }
          dispatch({
            type: 'SET_PROGRESS',
            progress: {
              taskId: params.id,
              kind: params.kind,
              summary: params.payload?.summary,
              completion: params.payload?.completion,
            },
          });
        }
      });

      // Server → client: tools/call (execute a local tool)
      client.setRequestHandler('tools/call', async (raw) => {
        const params = raw as ToolsCallParams;
        const tool = toolMap.get(params.name);
        if (!tool) {
          throw Object.assign(new Error(`Tool not found: ${params.name}`), {
            code: -32000,
          });
        }
        return tool.handler(params.args);
      });
    },
    [toolCatalog, toolMap],
  );

  // Create the WebSocket client once when the component mounts.
  useEffect(() => {
    const client = new ToolsWssClient({
      url: TOOLS_WSS_URL,
      getToken,
      onTokenExpired: () => {
        dispatch({ type: 'SET_CONNECTION_STATE', state: 'auth-required' });
        void refreshAuth();
      },
    });

    registerHandlers(client);
    clientRef.current = client;

    // Defer the state update to after the synchronous effect body so React
    // does not treat it as a synchronous setState-in-effect.
    void Promise.resolve().then(() => setWsClient(client));

    void client.connect();

    return () => {
      client.close();
      clientRef.current = null;
      setWsClient(null);
    };
    // We intentionally only run this once on mount.
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ---------------------------------------------------------------------------
  // Workspace selection
  // ---------------------------------------------------------------------------

  const handleWorkspaceSelect = useCallback((workspace: WorkspaceInfo) => {
    setExecutionSelection(null);
    dispatch({ type: 'WORKSPACE_CHANGED', workspace });
  }, []);

  // ---------------------------------------------------------------------------
  // Send message
  // ---------------------------------------------------------------------------

  const handleSend = useCallback(
    (text: string) => {
      const client = clientRef.current;
      if (!client) return;

      // Phase 6: build the spec ChatMessage once and reuse it for both
      // the optimistic insert and the wire payload. Passing the same
      // ``id`` into ``ADD_USER_MESSAGE`` makes the reducer rebuild a
      // structurally identical spec message keyed by the same id, so
      // the local bubble matches the eventual server echo.
      const threadId = threadIdRef.current;
      const workspaceId = currentWorkspaceRef.current?.id ?? null;
      const specMessage = userInputToSpecMessage(text, {
        threadId,
        workspaceId,
      });
      const selection = executionSelectionRef.current;
      if (selection) {
        putExecutionBinding(specMessage, selection.binding);
        specMessage.meta['scitrera.execution_view_policy'] = selection.policy;
      }

      dispatch({
        type: 'ADD_USER_MESSAGE',
        text,
        id: specMessage.id,
      });

      // Spec-native Sahara wire shape. Platform Bridge stamps the Aether
      // task/grant and every server-authoritative address field before dispatch.
      void client
        .chatSend({
          thread_id: threadId,
          workspace: workspaceId ?? '',
          message: specMessage,
        })
        .catch((err: unknown) => {
          console.error('[ChatApp] chat/send failed:', err);
          dispatch({ type: 'CLEAR_PENDING_TASK' });
        });
    },
    [],
  );

  const handleCancel = useCallback(() => {
    const client = clientRef.current;
    const taskId = state.pendingTaskId;
    if (!client || !taskId) return;
    void client
      .chatCancel(taskId)
      .then(() => dispatch({ type: 'SET_STREAMING_DONE' }))
      .catch((err: unknown) => {
        console.error('[ChatApp] chat/cancel failed:', err);
      });
  }, [state.pendingTaskId]);

  // ---------------------------------------------------------------------------
  // New chat
  // ---------------------------------------------------------------------------

  const handleNewChat = useCallback(() => {
    dispatch({ type: 'NEW_THREAD' });
  }, []);

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  // Spec messages don't carry a per-message ``isStreaming`` flag —
  // Streaming state is owned by the real Aether task id delivered through
  // progress/notify, then cleared when Sahara finalizes the turn.
  const messages = useMemo(() => chatMessageList(state), [state]);
  const isStreaming = state.pendingTaskId !== null;

  const noWorkspaceSelected =
    state.connectionState === 'connected' && state.currentWorkspace === null;

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-200 bg-gray-50 flex-shrink-0 gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <HostBadge host={host} />
          {wsClient !== null && (
            <WorkspacePicker
              client={wsClient}
              value={state.currentWorkspace}
              onSelect={handleWorkspaceSelect}
              disabled={state.connectionState !== 'connected'}
            />
          )}
          {wsClient !== null && (
            <ExecutionViewPicker
              key={state.currentWorkspace?.id ?? 'no-workspace'}
              client={wsClient}
              workspaceId={state.currentWorkspace?.id ?? null}
              value={executionSelection}
              onSelect={setExecutionSelection}
              disabled={state.connectionState !== 'connected' || isStreaming}
            />
          )}
          <StatusBar state={state.connectionState} />
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleNewChat}
            title="Start a new chat"
          >
            <PlusCircle size={13} />
            New
          </Button>
          {authStatus === 'authenticated' && (
            <Button
              variant="ghost"
              size="icon"
              onClick={() => void logout()}
              title="Sign out"
            >
              <LogOut size={13} />
            </Button>
          )}
          {(authStatus === 'error' || state.connectionState === 'auth-required') && (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => void refreshAuth()}
            >
              Sign in
            </Button>
          )}
        </div>
      </div>

      {/* No-workspace placeholder */}
      {noWorkspaceSelected && (
        <div className="px-4 py-2 text-xs text-amber-700 bg-amber-50 border-b border-amber-100">
          Select a workspace above to start chatting.
        </div>
      )}

      {/* Message list */}
      <MessageList
        messages={messages}
        progress={state.progress}
        isStreaming={isStreaming}
      />

      {/* Input — disabled until a workspace is selected */}
      <MessageInput
        onSend={handleSend}
        onCancel={handleCancel}
        connectionState={state.connectionState}
        isStreaming={isStreaming}
        authStatus={authStatus}
        disabled={state.currentWorkspace === null}
      />
    </div>
  );
}
