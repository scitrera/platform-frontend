import React, {useState, useEffect, useRef} from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import {useAuthStore} from '@/stores/authStore';
import {useWorkspaceStore} from '@/stores/workspaceStore';
import {cleanSlug} from "../../utils/Naming.jsx";
import {useWebSocket} from "../../hooks/useWebSocket.jsx";
import {WORKSPACE} from "../../constants/WebSocketConstants.jsx";
import {titleCase} from "../../lib/utils";

export default function NewWorkspaceModal({
                                              open = false,
                                              onOpenChange = () => {
                                              },
                                              onCreateWorkspace = null
                                          }) {
    const uiConfig = useAuthStore(s => s.uiConfig);
    const workspaces = useWorkspaceStore(s => s.workspaces);
    const setCurrentWorkspaceCustom = useWorkspaceStore(s => s.setCurrentWorkspaceCustom);
    const {sendRpcRequest, sendMessage: sendWsMessage} = useWebSocket();
    const {templates} = workspaces;

    const workspaceLabel = titleCase(uiConfig.workspacesLabel).slice(0, -1);

    const [title, setTitle] = useState('');
    const [slug, setSlug] = useState('');
    const [slugTouched, setSlugTouched] = useState(false);
    const [titleError, setTitleError] = useState('');
    const [slugError, setSlugError] = useState('');
    const [loading, setLoading] = useState(false);
    const [selectedTemplateId, setSelectedTemplateId] = useState(null);

    const titleRef = useRef(null);

    // Determine the default template selection based on available templates
    useEffect(() => {
        if (!templates || templates.length === 0) {
            setSelectedTemplateId(null);
        } else if (templates.length === 1) {
            setSelectedTemplateId(templates[0].id);
        } else {
            // Multiple templates - put null for now???
            // TODO: Should be able to pull the default template from state (or send null and do it server side?)
            setSelectedTemplateId(null);
        }
    }, [templates]);

    // auto-fill slug when title changes, unless user has touched slug
    useEffect(() => {
        if (!slugTouched) {
            setSlug(cleanSlug(title));
            setSlugError('');
        }
    }, [title, slugTouched]);

    // focus title when dialog opens
    useEffect(() => {
        if (open && titleRef.current) {
            titleRef.current.focus();
        }
    }, [open]);

    const reset = () => {
        setTitle('');
        setSlug('');
        setSlugTouched(false);
        setTitleError('');
        setSlugError('');
        setLoading(false);
        // selectedTemplateId will be reset by the useEffect when templates change
    };

    const handleClose = () => {
        reset();
        onOpenChange(false);
    };

    const handleCreate = async () => {
        setTitleError('');
        setSlugError('');
        const t = title.trim();
        const s = slug.trim();
        if (!t) {
            setTitleError(`${workspaceLabel} title is required`);
            return;
        }
        if (!s) {
            setSlugError(`${workspaceLabel} ID is required`);
            return;
        }
        setLoading(true);

        const templateId = selectedTemplateId;

        // Use the provided onCreateWorkspace function or fallback to the default behavior
        if (onCreateWorkspace) {
            try {
                await onCreateWorkspace({
                    title: t,
                    workspaceId: s,
                    templateId,
                });
                handleClose();
            } catch (error) {
                setSlugError(error?.message || `Failed to create ${workspaceLabel.toLowerCase()}`);
            } finally {
                setLoading(false);
            }
        } else {
            // Fallback to original behavior if no custom handler provided
            try {
                await sendRpcRequest(WORKSPACE.CREATE_WORKSPACE, {
                    title: t,
                    workspaceId: s,
                    templateId,
                }).then((response) => {
                    // Update workspace in UI
                    setCurrentWorkspaceCustom(response.workspaceData ?? response);
                    // request that the server update our workspace list -- which should happen in the background
                    sendWsMessage(WORKSPACE.GET_WORKSPACES, null);
                    // close the dialog
                    handleClose();
                }, (error) => {
                    setSlugError(error?.message || 'Rejected');
                });
            } catch (err) {
                const msg = err?.message || `Failed to create ${workspaceLabel.toLowerCase()}`;
                setSlugError(msg);
            } finally {
                setLoading(false);
            }
        }
    };

    const sendOnEnter = async (e) => {
        if (e.key === 'Enter') {
            await handleCreate();
        }
    };

    return (
        <Dialog.Root open={open} onOpenChange={val => !val && handleClose()}>
            <Dialog.Portal>
                <Dialog.Overlay className="fixed inset-0 bg-black/40"/>
                <Dialog.Content
                    className="fixed top-1/2 left-1/2 w-[400px] -translate-x-1/2 -translate-y-1/2 bg-white rounded-md shadow-lg p-6">
                    <Dialog.Title className="text-lg font-medium">New {workspaceLabel}</Dialog.Title>
                    <Dialog.Description>Create a new {workspaceLabel}</Dialog.Description>
                    <div className="mt-4 space-y-4">
                        <div className="flex flex-col">
                            <label htmlFor="workspace-title"
                                   className="text-sm font-semibold mb-1">{workspaceLabel} Title</label>
                            <input
                                id="workspace-title"
                                ref={titleRef}
                                value={title}
                                onKeyDown={sendOnEnter}
                                onChange={e => setTitle(e.target.value)}
                                placeholder={`Give your new ${workspaceLabel.toLowerCase()} a title`}
                                className="border border-gray-300 rounded px-2 py-1"
                            />
                            {titleError && <p className="text-red-600 text-sm mt-1">{titleError}</p>}
                        </div>

                        <div className="flex flex-col">
                            <label htmlFor="workspace-slug" className="text-sm font-semibold mb-1">Preferred ID</label>
                            <input
                                id="workspace-slug"
                                value={slug}
                                onKeyDown={sendOnEnter}
                                onChange={e => {
                                    setSlug(e.target.value);
                                    setSlugTouched(true);
                                }}
                                placeholder="(optional) control the URL short name"
                                className="border border-gray-300 rounded px-2 py-1"
                            />
                            {slugError && <p className="text-red-600 text-sm mt-1">{slugError}</p>}
                        </div>

                        {/* Template Selection Dropdown */}
                        {uiConfig.showWorkspaceTemplateSelection && templates && templates.length > 0 && (
                            <div className="flex flex-col">
                                <label htmlFor="workspace-template"
                                       className="text-sm font-semibold mb-1">Template</label>
                                <select
                                    id="workspace-template"
                                    value={selectedTemplateId || ''}
                                    onChange={e => setSelectedTemplateId(e.target.value || null)}
                                    className="border border-gray-300 rounded px-2 py-1"
                                >
                                    {templates.map(template => (
                                        <option key={template.id} value={template.id}>
                                            {template.label}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        )}
                    </div>

                    <div className="mt-6 flex justify-end space-x-2">
                        <button
                            onClick={handleCreate}
                            disabled={loading}
                            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
                        >Create
                        </button>
                        <button
                            onClick={handleClose}
                            className="px-4 py-2 bg-gray-100 rounded hover:bg-gray-200"
                        >Close
                        </button>
                    </div>
                </Dialog.Content>
            </Dialog.Portal>
        </Dialog.Root>
    );
}
