import React, {useState, useEffect, useRef} from 'react';
import {useWebSocket} from '../../../hooks/useWebSocket.jsx';
import {useToasts} from '../../../hooks/useToasts.jsx';
import {ChevronRight, Paperclip, X} from 'lucide-react';
import {CHAT} from '../../../constants/WebSocketConstants.jsx';
import {DEBUG_MODE, CHAT_UI_CONSTANTS} from '../../../constants/AppConstants';
import {useChatState} from '../../../hooks/useChatState';
import {generateId} from '../../../lib/utils';
import {useFileUploader} from '../../../utils/FileUploadFunctions.jsx';
import {userInputToSpecMessage} from '@/utils/messaging/specAdapters';
import {useWorkspaceHomedThreads} from '@/hooks/useThreadMode';
import {DEFAULT_THREAD_ID, type Attachment} from '@/types/chat';
import {
    ExecutionViewPicker,
    type ExecutionSelection,
} from './ExecutionViewPicker';

const {MAX_WIDTH_CLASS} = CHAT_UI_CONSTANTS;

export interface MessageInputProps {
    workspaceId: string | null;
    contextAppId?: string;
    threadId?: string;
    scrollToBottom?: (returnLambda?: boolean, behavior?: ScrollBehavior) => void | (() => void);
}

export const MessageInput = ({
    workspaceId,
    contextAppId,
    threadId = DEFAULT_THREAD_ID,
    scrollToBottom,
}: MessageInputProps) => {
    const {addToast} = useToasts();
    const [inputValue, setInputValue] = useState('');
    const [dragActive, setDragActive] = useState(false);
    const [dragCounter, setDragCounter] = useState(0);
    const [executionState, setExecutionState] = useState<{
        workspaceId: string | null;
        selection: ExecutionSelection | null;
    }>({workspaceId, selection: null});
    const executionSelection = executionState.workspaceId === workspaceId
        ? executionState.selection
        : null;
    const setExecutionSelection = (selection: ExecutionSelection | null) => {
        setExecutionState({workspaceId, selection});
    };
    const fileInputRef = useRef<HTMLInputElement>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    const {sendMessage, isConnected} = useWebSocket();

    // Send-on-Enter preference (persisted in sessionStorage, defaults to true)
    const [sendOnEnter, setSendOnEnter] = useState(() => {
        const stored = sessionStorage.getItem('sendOnEnter');
        return stored !== null ? stored === 'true' : true;
    });
    const toggleSendOnEnter = () => {
        setSendOnEnter(prev => {
            sessionStorage.setItem('sendOnEnter', String(!prev));
            return !prev;
        });
    };

    // Attachment state & handlers from context
    const {
        attachments,
        documents,
        upsertSpecMessage,
        addAttachment,
        removeAttachment,
        removeDocument,
        clearAttachments,
        clearDocuments,
        setAttachments,
        activeThreadId,
        getActiveChatTaskForThread,
        dropSpecMessageAndAfter,
        specMessageList,
        markTurnCancelled,
    } = useChatState();

    // Workspace-homed threads: tell the backend to route this turn's commit +
    // thread mint to the real workspace (ownership='workspace') instead of the
    // user-chat home. Must match the workspaceScoped flag the history/list/clear
    // requests send so all four agree on the thread's storage.
    const workspaceHomed = useWorkspaceHomedThreads();

    // In-flight chat_message task for the currently selected thread (if any).
    // When set, the send button is replaced by a Cancel button that issues
    // CHAT.CANCEL_MESSAGE — the agent observes the cancellation and wraps
    // up at its next event boundary; CHAT.MSG_TASK_DONE clears this state.
    const activeChatTask = getActiveChatTaskForThread
        ? getActiveChatTaskForThread(activeThreadId)
        : null;
    const isInFlight = Boolean(activeChatTask?.taskId);

    const handleCancelInFlight = () => {
        if (!isInFlight || !activeChatTask) return;
        DEBUG_MODE && console.log(
            '[CANCEL-DELETE-DIAG] cancel clicked: activeChatTask=', activeChatTask,
            ' threadId=', threadId,
        );
        // Always tell the backend to cancel the in-flight task; the agent wraps
        // up at its next event boundary and MSG_TASK_DONE clears the active task.
        sendMessage(CHAT.CANCEL_MESSAGE, {taskId: activeChatTask.taskId});

        // Has the model already produced anything this turn? Look for an
        // assistant (non-user) message after the user's message that already
        // carries content (text, a tool call, etc.). The streamed assistant
        // bubble is id'd ``<taskId>-assistant``; we scan defensively so the
        // detection holds regardless of the stream id scheme.
        const list = specMessageList || [];
        const userIdx = list.findIndex(m => m.id === activeChatTask.messageId);
        // Only look at messages AFTER this turn's user message; if it isn't in
        // the map, don't risk matching a prior turn's assistant bubble — fall
        // through to the (safe, no-op) undo path.
        const after = userIdx >= 0 ? list.slice(userIdx + 1) : [];
        const respondedMsg = [...after].reverse().find(
            m => m.role !== 'user' && Array.isArray(m.content) && m.content.length > 0,
        );

        if (respondedMsg) {
            // The turn is already underway — undoing it would discard real work
            // (tool calls, partial output). Leave the conversation in place and
            // surface a "Turn cancelled" indicator on the assistant bubble.
            DEBUG_MODE && console.log(
                '[CANCEL-DELETE-DIAG] halt-only cancel; responded msg=', respondedMsg.id,
            );
            markTurnCancelled && markTurnCancelled(respondedMsg.id);
            return;
        }

        // Nothing produced yet — treat cancel as "this turn never happened":
        // drop the user message (and any empty assistant bubble after it) and
        // restore the text into the input box so the user can edit and resend.
        const droppedText = dropSpecMessageAndAfter
            ? dropSpecMessageAndAfter(activeChatTask.messageId)
            : '';
        DEBUG_MODE && console.log(
            '[CANCEL-DELETE-DIAG] undo cancel; dropped messageId=', activeChatTask.messageId,
            ' droppedText.length=', droppedText.length,
        );
        if (droppedText) {
            setInputValue(droppedText);
        }
    };

    function updateAttachment(id: string, changes: Partial<Attachment>) {
        setAttachments(prev =>
            prev.map(a => (a.id === id ? {...a, ...changes} : a))
        );
    }

    // Auto-resize textarea up to 8 lines
    const autoResize = () => {
        const ta = textareaRef.current;
        if (ta) {
            ta.style.height = 'auto';
            const lineHeight = parseFloat(getComputedStyle(ta).lineHeight) || 24;
            const maxHeight = lineHeight * 8;
            ta.style.height = Math.min(ta.scrollHeight, maxHeight) + 'px';
        }
    };

    // Resize on content change
    useEffect(() => {
        autoResize();
    }, [inputValue]);

    // Auto-focus the textarea whenever it's safe to type. This fires on
    // initial mount (so the user can start typing into the welcome
    // greeting), on reconnect, on agent-turn completion, and on thread
    // switch. We skip the focus grab when another text input is already
    // focused so we don't yank focus away from a thread search, document
    // rename, etc.
    useEffect(() => {
        if (!isConnected || isInFlight) return;
        const ta = textareaRef.current;
        if (!ta) return;
        const active = document.activeElement as HTMLElement | null;
        if (active && active !== ta) {
            const tag = active.tagName;
            if (tag === 'INPUT' || tag === 'TEXTAREA' || active.isContentEditable) return;
        }
        ta.focus();
    }, [isConnected, isInFlight, threadId]);

    const {uploadFile, notifyUploadComplete} = useFileUploader(workspaceId);

    async function uploadFileAndTrack(file: File) {
        const id = generateId('f');
        const label = file.name;

        addAttachment({id, label, key: null, progress: 0, status: 'uploading', cancelFn: null});

        const abortController = new AbortController();

        await uploadFile({
            file,
            threadId,
            onStart: () => {
                updateAttachment(id, {status: 'uploading'});
            },
            onProgress: (_: unknown, pct: number) => {
                updateAttachment(id, {progress: pct});
            },
            onFinish: (key: string | null, err: Error | null) => {
                if (err) {
                    removeAttachment(id);
                    addToast(`Upload failed: ${label}`, 'error');
                } else {
                    updateAttachment(id, {key, progress: 100, status: 'done'});
                    // Commit the staged blob so the sandbox agent can fetch it.
                    // Chat attachments are committed WITHOUT KB ingestion
                    // (skip_ingest); the backend also finalizes unfinalized refs
                    // on message-send as a safety net.
                    if (key) notifyUploadComplete([key], {skipIngest: true});
                }
            },
            signal: abortController.signal,
        });

        // Allow canceling
        updateAttachment(id, {cancelFn: () => abortController.abort()});

        return id;
    }

    const handlePaste = async (e: React.ClipboardEvent<HTMLFormElement>) => {
        const files = Array.from(e.clipboardData.files || []);
        await Promise.all(files.map(uploadFileAndTrack));
    };

    // File selector
    const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(e.target.files || []);
        await Promise.all(files.map(uploadFileAndTrack));
        e.target.value = '';
    };

    // Drag handlers
    const handleDragEnter = (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        setDragCounter(c => c + 1);
        setDragActive(true);
    };
    const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
    };
    const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        setDragCounter(c => {
            const next = c - 1;
            if (next <= 0) {
                setDragActive(false);
                return 0;
            }
            return next;
        });
    };
    const handleDrop = async (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        setDragActive(false);
        setDragCounter(0);
        const files = Array.from(e.dataTransfer.files || []);
        await Promise.all(files.map(uploadFileAndTrack));
    };

    // Keyboard handler: sendOnEnter mode sends on bare Enter (Shift+Enter = newline),
    // legacy mode sends on Shift+Enter (Enter = newline)
    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === 'Enter') {
            if (sendOnEnter) {
                if (e.shiftKey) return; // Shift+Enter = newline in sendOnEnter mode
                handleSend(e);
            } else {
                if (e.shiftKey || e.ctrlKey) handleSend(e); // legacy: Shift/Ctrl+Enter to send
            }
        } else if (e.key === 'Tab') {
            e.preventDefault();
            setInputValue(prev => prev + '\t');
        }
    };

    // Send message
    const handleSend = (e: React.SyntheticEvent) => {
        e.preventDefault();
        if (!inputValue.trim() || !isConnected) {
            !isConnected && addToast('Cannot send: disconnected', 'error');
            return;
        }
        const id = generateId('msg');
        const text = inputValue.trim();
        const timestamp = Date.now() / 1000;  // seconds (with decimals) since epoch UTC
        // Carry the friendly filename (the composer chip's ``label``) alongside
        // the vfs_ref so the FilePart renders the name — not the raw ref — both
        // inline and in the artifacts sidebar, and so it persists to history.
        const attachmentInputs = attachments
            .filter(a => a.key != null)
            .map(a => ({key: a.key as string, file_name: a.label}));
        const documentIds = documents.map(a => a.id);
        // Phase 6: wire payload is now a spec ChatMessage natively.
        // `userInputToSpecMessage` builds a role=user message with
        // text/file content parts; the WS server stamps server-side
        // addr fields (tenant_id, user_id, task_id, request_id,
        // authority_grant_id) onto it at the handler. The optimistic
        // insert reuses the SAME spec message so local state matches
        // the wire envelope identity. ``threadId`` / ``workspace`` /
        // ``app`` are mirrored as top-level fields for
        // belt-and-suspenders parity with the legacy handlers (e.g.
        // ``_ws_chat_msg_cowork``) that still read those.
        // Sending while a turn is running is an INTERJECTION into that turn, not
        // the start of a new one: the server mints no chat task for it and the
        // agent delivers it into the in-flight turn at its next boundary. It
        // does not cancel anything — the stop button remains the way to abandon
        // work. See agent-harness/docs/mid-run-steering-design.md.
        const specMessage = userInputToSpecMessage({
            id,
            text,
            attachments: attachmentInputs,
            documents: documentIds,
            timestamp,
            steering: isInFlight,
        });
        // Belt-and-suspenders: mirror addr.thread_id / workspace_id /
        // app_id onto the spec message addr so consumers that read
        // straight off the spec envelope (sidecar bridge) see them
        // without needing the top-level fields.
        specMessage.addr = {
            ...specMessage.addr,
            workspace_id: workspaceId ?? null,
            thread_id: threadId,
            app_id: contextAppId ?? null,
        };
        if (executionSelection) {
            specMessage.meta = {
                ...(specMessage.meta ?? {}),
                'scitrera.execution_binding': executionSelection.binding,
                'scitrera.execution_view_policy': executionSelection.policy,
            };
        }
        sendMessage(CHAT.APPEND_MESSAGE, {
            workspace: workspaceId,
            app: contextAppId,
            message: specMessage,
            threadId,
            workspaceScoped: workspaceHomed,
        });
        // Optimistic insert into the spec map so the bubble renders
        // immediately without waiting for the server echo. Matches the
        // legacy ``addChatMessage(compileMessagePayload(msg))`` UX.
        upsertSpecMessage(specMessage);
        setInputValue('');
        // Always scroll to bottom when user sends a message
        if (scrollToBottom) {
            scrollToBottom();
        }
        // clearAttachments(); // for now, we're NOT clearing attachments with each message...
    };

    return (
        <div>
            <form onSubmit={handleSend} onPaste={handlePaste}
                  className="border-t border-gray-200 bg-gray-50 flex-shrink-0 p-4">
                <div className={`${MAX_WIDTH_CLASS} w-full mx-auto`}>
                    <div
                        className={`relative p-4 flex flex-col space-y-3 bg-white shadow rounded-lg ${dragActive ? 'ring-2 ring-blue-300' : ''}`}
                        onDragEnter={handleDragEnter} onDragOver={handleDragOver} onDragLeave={handleDragLeave}
                        onDrop={handleDrop}>
                        {dragActive && <div
                            className="absolute inset-0 bg-white bg-opacity-90 flex items-center justify-center pointer-events-none rounded-lg">
                            <span className="text-blue-600 font-medium">Drop File Here to Attach</span></div>}
                        {/* Stays disabled while a turn runs even though the composer no
                            longer does: an interjection joins the running turn and
                            inherits ITS execution binding (the binding rides the parent
                            task's metadata, and a steering send mints no task), so
                            offering a view change here would be a control that silently
                            does nothing. */}
                        <ExecutionViewPicker
                            key={workspaceId ?? 'no-workspace'}
                            workspaceId={workspaceId}
                            value={executionSelection}
                            onSelect={setExecutionSelection}
                            disabled={!isConnected || isInFlight}
                        />
                        {/* Documents */}
                        <div className="flex flex-wrap items-center gap-2">
                            <span className="text-xs text-gray-400">Documents:</span>
                            {documents.map(a => <div key={a.id}
                                                     className="flex items-center bg-gray-100 text-gray-800 text-sm px-2 py-1 rounded">
                                <div className="relative w-full max-w-xs">
                                    <div
                                        className="truncate pr-4 z-10 relative"
                                        title={a.label}
                                    >
                                        {a.label}
                                    </div>
                                    <div
                                        className="absolute left-0 top-0 h-full bg-blue-200 z-0 rounded"
                                        style={{width: `${a.progress || 0}%`, transition: 'width 0.3s'}}
                                    />
                                </div>
                                <button
                                    type="button"
                                    onClick={() => {
                                        removeDocument(a.id);
                                    }}
                                    className="ml-1 text-gray-500 hover:text-gray-700 z-10 relative"
                                >
                                    <X size={14}/>
                                </button>
                            </div>)}
                            {!dragActive && documents.length > 0 ? <>
                                <button type="button" onClick={() => clearDocuments()}
                                        disabled={!documents.length}
                                        className={`flex items-center text-sm px-2 py-1 rounded ${!documents.length ? 'text-gray-400 cursor-not-allowed' : 'text-gray-500 hover:text-gray-700'}`}>
                                    <X size={16} className="mr-1"/> Clear Documents
                                </button>
                            </> : <>
                                <span className="text-xs text-gray-400 cursor-not-allowed">(none)</span>
                            </>}
                        </div>
                        {/* Attachments */}
                        <div className="flex flex-wrap items-center gap-2">
                            <span className="text-xs text-gray-400">Uploads:</span>
                            {attachments.map(a => <div key={a.id}
                                                       className="flex items-center bg-gray-100 text-gray-800 text-sm px-2 py-1 rounded">
                                <div className="relative w-full max-w-xs">
                                    <div
                                        className="truncate pr-4 z-10 relative"
                                        title={a.label}
                                    >
                                        {a.label}
                                    </div>
                                    <div
                                        className={`absolute left-0 top-0 h-full ${a.status === 'done' ? 'bg-green-200' : 'bg-blue-200'} z-0 rounded`}
                                        style={{width: `${a.progress || 0}%`, transition: 'width 0.3s'}}
                                    />
                                </div>
                                <button
                                    type="button"
                                    onClick={() => {
                                        a.cancelFn?.(); // cancel if still uploading
                                        removeAttachment(a.id);
                                    }}
                                    className="ml-1 text-gray-500 hover:text-gray-700 z-10 relative"
                                >
                                    <X size={14}/>
                                </button>
                            </div>)}
                            {!dragActive && attachments.length > 0 ? <>
                                <button type="button" onClick={() => fileInputRef.current?.click()}
                                        className="text-gray-500 hover:text-gray-700 p-1"><Paperclip
                                    className="w-5 h-5"/></button>
                                <button type="button" onClick={() => clearAttachments()}
                                        disabled={!attachments.length}
                                        className={`flex items-center text-sm px-2 py-1 rounded ${!attachments.length ? 'text-gray-400 cursor-not-allowed' : 'text-gray-500 hover:text-gray-700'}`}>
                                    <X size={16} className="mr-1"/> Clear Attachments
                                </button>
                                <input type="file" multiple hidden ref={fileInputRef}
                                       onChange={handleFileSelect}/></> : <>
                                <span className="text-xs text-gray-400 cursor-not-allowed">(none)</span>
                            </>}
                        </div>
                        <div className="flex items-center space-x-3">
                            <textarea ref={textareaRef}
                                      value={inputValue}
                                      onChange={e => setInputValue(e.target.value)}
                                      placeholder={!isConnected
                                          ? 'Connecting...'
                                          : isInFlight
                                              ? 'Add to what the agent is doing...'
                                              : (sendOnEnter ? 'Type a message... (Enter to Send)' : 'Type a message... (Shift+Enter to Send)')}
                                      onKeyDown={handleKeyDown}
                                      rows={1}
                                      className="flex-grow p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm disabled:bg-gray-100 disabled:text-gray-500 disabled:cursor-not-allowed"
                                      disabled={!isConnected}/>
                            <button
                                type="button"
                                onClick={toggleSendOnEnter}
                                className={`px-2 py-1 text-xs rounded border transition-colors flex-shrink-0 ${
                                    sendOnEnter
                                        ? 'bg-blue-100 border-blue-300 text-blue-700'
                                        : 'bg-gray-100 border-gray-300 text-gray-500'
                                }`}
                                title={sendOnEnter ? 'Enter sends message (click to change)' : 'Shift+Enter sends message (click to change)'}
                            >
                                {sendOnEnter ? '⏎' : '⇧⏎'}
                            </button>
                            {/* While a turn is running both actions are offered, because
                                they are different intents: send ADDS to the running turn,
                                stop ABANDONS it. Collapsing to stop alone (the old
                                behavior) made "I have one more instruction" and "give up"
                                the same button. */}
                            {isInFlight && (
                                <button type="button"
                                        onClick={handleCancelInFlight}
                                        title="Stop the agent"
                                        className="p-3 bg-red-500 text-white rounded-lg hover:bg-red-600 disabled:bg-gray-300 transition-colors"
                                        disabled={!isConnected}>
                                    <X size={20}/>
                                </button>
                            )}
                            <button type="submit"
                                    title={isInFlight ? 'Add this to what the agent is doing' : 'Send'}
                                    className="p-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:bg-gray-300 transition-colors"
                                    disabled={!isConnected || !inputValue.trim()}>
                                <ChevronRight size={20}/>
                            </button>
                        </div>
                    </div>
                </div>
            </form>
        </div>
    );
};
