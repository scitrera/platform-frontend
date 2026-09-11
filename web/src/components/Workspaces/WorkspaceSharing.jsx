import React, {useEffect, useMemo, useState} from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import {Trash2, UserPlus, X} from 'lucide-react';
import {
    PERMISSION_LABELS,
    PERMISSIONS,
    PERMISSIONS_ENUMS,
    permIndex,
    permissionFromLevel,
    permissionToLevel,
    stripUserPrefix,
    principalDisplay,
    DEBUG_MODE
} from "../../constants/AppConstants";
import {useWebSocket} from "../../hooks/useWebSocket.jsx";
import {USER} from "../../constants/WebSocketConstants.jsx";
import {useToasts} from "../../hooks/useToasts.jsx";

/**
 * WorkspaceSharing component
 * Props:
 *  - workspaceId: string
 *  - currentUserId: string
 *  - currentUserPermission: one of PERMISSIONS
 *  - api: { fetchSharedUsers, removeUser, fetchAllUsers, inviteUsers }
 */
export default function WorkspaceSharing({workspaceId, currentUserId, currentUserPermission}) {
    const {sendRpcRequest} = useWebSocket()
    const {addToast} = useToasts();

    const [sharedUsers, setSharedUsers] = useState({});
    const [inviteOpen, setInviteOpen] = useState(false);

    // Invite modal state
    const [allUsers, setAllUsers] = useState([]);
    const [inviteSelection, setInviteSelection] = useState(new Set());
    // TODO: default starting permission should probably come from workspace/tenant configuration!
    const [invitePermission, setInvitePermission] = useState(PERMISSIONS_ENUMS.RW_PLUS);
    const [inviteFilter, setInviteFilter] = useState('');


    const refreshUsers = async () => {
        await sendRpcRequest(USER.TOOL_CALL, {
            service: 'platform_bridge',
            op: 'sharing.list_members',
            workspaceId: workspaceId,
            args: {},
        }).then((response) => {
            // Backend sends role as an ACL level int (10/20/30/40); the UI
            // compares/labels via the PERMISSIONS_ENUMS strings, so normalize it
            // here. Keys stay the raw ``user:<email>`` ids (used by unshare).
            const members = response.result.members || {};
            const normalized = Object.fromEntries(
                Object.entries(members).map(([id, m]) => [
                    id, {...m, role: permissionFromLevel(m.role)},
                ])
            );
            setSharedUsers(normalized)
        }, (err) => {
            console.error('Failed to load workspace members:', err);
            addToast('Failed to load workspace members.', 'error');
        })
    };

    // Load shared users
    useEffect(() => {
        async function innerFunc() {
            await refreshUsers();
        }

        innerFunc().finally();
        return () => {
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [sendRpcRequest, workspaceId]);

    const updateInviteUsers = async () => {
        // if (!inviteOpen) {
        //     setAllUsers([])  // release existing data
        //     setInviteSelection(new Set());
        //     return;
        // }
        // TODO: rework UI for pagination support, etc.; already available at API
        await sendRpcRequest(USER.TOOL_CALL, {
            service: 'platform_bridge',
            op: 'sharing.list_eligible',
            workspaceId: workspaceId,
            args: {
                filter: inviteFilter,
                limit: 500,
                offset: 0,
            },
        }).then((response) => {
            setAllUsers(response.result.users)
        }, (err) => {
            console.error('Failed to load users for invite:', err);
            addToast('Failed to load user list.', 'error');
        })
    }

    // Load all users for invite when modal opens
    useEffect(() => {
        async function innerFunc() {
            await updateInviteUsers();
            // if (inviteOpen) {
            //     api.fetchAllUsers().then(setAllUsers);
            //     setInviteSelection(new Set());
            //     setInvitePermission(currentUserPermission);
            //     setInviteFilter('');
            // }
        }

        innerFunc().finally()
        return () => {
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [sendRpcRequest, workspaceId]);

    // Helpers to compare permission levels
    const canManage = permIndex(currentUserPermission) >= permIndex(PERMISSIONS_ENUMS.RW_PLUS);

    // Count remaining managers/admins (exclude one being removed)
    const managerCount = useMemo(() => Object.values(sharedUsers).filter(u => permIndex(u.role) >= permIndex(PERMISSIONS_ENUMS.ADMIN)).length, [sharedUsers]);

    // Filter invite list by search
    const filteredUsers = useMemo(() => {
        const q = inviteFilter.toLowerCase();
        return allUsers.filter(u =>
            u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q)
        );
    }, [allUsers, inviteFilter]);

    // Actions
    const handleRemove = async (sUserId) => {
        if (!canManage) return;
        if ((sUserId === currentUserId) && managerCount <= 1) {
            // TODO: nicer alert
            addToast("Cannot remove last admin!", 'warning', 2500)
            // alert('Cannot remove the last manager/admin');
            return;
        }
        await sendRpcRequest(USER.TOOL_CALL, {
            service: 'platform_bridge',
            op: 'sharing.unshare',
            workspaceId,
            args: {target_users: [sUserId]},
        }).then(async () => {
            // reload shared users
            // await api.removeUser(workspaceId, user.userId);
            // setSharedUsers(s => s.filter(u => u.userId !== user.userId));
            await refreshUsers();
        }, (err) => {
            console.error('Failed to remove workspace member:', err);
            addToast('Failed to remove member. Please try again.', 'error');
        })
    };

    const handleInvite = async () => {
        const toInvite = Array.from(inviteSelection);
        if (toInvite.length === 0) return;
        await sendRpcRequest(USER.TOOL_CALL, {
            service: 'platform_bridge',
            op: 'sharing.share',
            workspaceId,
            // Backend share_workspace expects target_role as an ACL level int
            // (it compares target_role > user_role numerically), so convert the
            // UI permission enum before sending.
            args: {target_users: toInvite, target_role: permissionToLevel(invitePermission)},
        }).then(async () => {
            // const inviteSuccess = await api.inviteUsers(workspaceId, toInvite, invitePermission);
            setInviteOpen(false);
            // refresh list
            // const updated = await api.fetchSharedUsers(workspaceId);
            // setSharedUsers(updated);
            await refreshUsers();
        }, (err) => {
            console.error('Failed to invite users:', err);
            addToast('Failed to invite users. Please try again.', 'error');
        });
    };

    return (
        <div className="bg-white shadow rounded-lg p-6 space-y-4">
            <h2 className="text-xl font-semibold">Sharing Settings</h2>

            <div className="flex justify-between items-center">
                <p className="text-gray-700">Shared with:</p>
                {canManage && (
                    <button
                        onClick={() => setInviteOpen(true)}
                        className="flex items-center space-x-1 px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700"
                    >
                        <UserPlus className="w-4 h-4"/>
                        <span>Invite People</span>
                    </button>
                )}
            </div>

            <table className="min-w-full text-sm divide-y divide-gray-200">
                <thead>
                <tr className="bg-gray-50">
                    <th className="px-4 py-2 text-left">Name</th>
                    <th className="px-4 py-2 text-left">Email</th>
                    <th className="px-4 py-2 text-left">Permission</th>
                    <th className="px-4 py-2 text-left">Actions</th>
                </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                {Object.entries(sharedUsers).map(([sUserId, sUserData]) => {
                    const p = principalDisplay(sUserId);
                    return (
                    <tr key={sUserId} className="hover:bg-gray-50">
                        <td className="px-4 py-2">{p.name}</td>
                        <td className="px-4 py-2">
                            {p.special
                                ? <span className="text-gray-400 italic">{p.detail}</span>
                                : stripUserPrefix(sUserData.email)}
                        </td>
                        <td className="px-4 py-2">{PERMISSION_LABELS[sUserData.role]}</td>
                        <td className="px-4 py-2">
                            {(canManage && permIndex(currentUserPermission) >= permIndex(sUserData.role)) ? (
                                <button
                                    onClick={() => handleRemove(sUserId)}
                                    className="text-red-600 hover:text-red-800"
                                >
                                    <Trash2 className="w-5 h-5"/>
                                </button>
                            ) : (
                                <span className="text-gray-400">—</span>
                            )}
                        </td>
                    </tr>
                    );
                })}
                </tbody>
            </table>

            {/* Invite Modal */}
            <Dialog.Root open={inviteOpen} onOpenChange={setInviteOpen}>
                <Dialog.Portal>
                    <Dialog.Overlay className="fixed inset-0 bg-black/30"/>
                    <Dialog.Content
                        className="fixed top-1/2 left-1/2 w-[500px] -translate-x-1/2 -translate-y-1/2 bg-white rounded-md shadow-lg p-6">
                        <div className="flex justify-between items-center mb-4">
                            <Dialog.Title className="text-lg font-medium">Invite People</Dialog.Title>
                            <Dialog.Description>Manage sharing in this workspace</Dialog.Description>
                            <button onClick={() => setInviteOpen(false)}><X/></button>
                        </div>

                        <input
                            type="text"
                            value={inviteFilter}
                            onChange={e => setInviteFilter(e.target.value)}
                            placeholder="Search users..."
                            className="w-full border border-gray-300 rounded px-3 py-2 mb-4"
                        />
                        {/* TODO: option to add/invite/license users from here is user has sufficient permissions */}

                        <div className="max-h-64 overflow-y-auto border border-gray-200 rounded mb-4">
                            {filteredUsers.map(u => (
                                <div key={u.email}
                                     className="flex items-center justify-between px-4 py-2 hover:bg-gray-50">
                                    <div>
                                        <p className="font-medium">{stripUserPrefix(u.name)}</p>
                                        <p className="text-gray-500 text-xs">{stripUserPrefix(u.email)}</p>
                                    </div>
                                    <input
                                        type="checkbox"
                                        checked={inviteSelection.has(u.email)}
                                        onChange={e => {
                                            const s = new Set(inviteSelection);
                                            if (e.target.checked) s.add(u.email);
                                            else s.delete(u.email);
                                            setInviteSelection(s);
                                        }}
                                    />
                                </div>
                            ))}
                        </div>

                        <div className="mb-4">
                            <label className="block text-sm font-medium mb-1">Permission</label>
                            <select
                                value={invitePermission}
                                onChange={e => setInvitePermission(e.target.value)}
                                className="w-full border border-gray-300 rounded px-3 py-2"
                            >
                                {PERMISSIONS.filter(p => permIndex(p) <= permIndex(currentUserPermission)).map(p => (
                                    <option key={p} value={p}>{PERMISSION_LABELS[p]}</option>
                                ))}
                            </select>
                        </div>

                        <div className="flex justify-end space-x-2">
                            <button variant="secondary" onClick={() => setInviteOpen(false)}>Cancel</button>
                            <button onClick={handleInvite} disabled={inviteSelection.size === 0}>Invite</button>
                        </div>
                    </Dialog.Content>
                </Dialog.Portal>
            </Dialog.Root>
        </div>
    );
}
