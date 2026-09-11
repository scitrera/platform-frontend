import React from 'react';
import {ShieldAlert, ServerCrash, RefreshCw, LogOut} from 'lucide-react';
import {getLogoutUrl} from '../../utils/wsConfig.js';

/**
 * Shown when the user IS signed in but cannot reach the backend.
 *
 * This is the terminal state for an authorization failure — sending the user
 * back through the login flow would just return them here with a fresh session
 * and the same missing grant, so this screen deliberately offers "retry" and
 * "sign out", NOT "sign in again".
 *
 * Before this existed, the same condition rendered as an ordinary app shell
 * whose WebSocket silently reconnected forever: the gateway rejects the
 * handshake with a 403 the browser refuses to expose to JS, so the UI had no
 * way to distinguish "denied" from "still connecting".
 */

const COPY = {
    'no-grant': {
        Icon: ShieldAlert,
        title: 'Access not granted',
        body: (tenant) => (
            tenant
                ? `Your account is signed in, but it has not been granted access to ${tenant}.`
                : 'Your account is signed in, but it has not been granted access to this workspace.'
        ),
        hint: 'An administrator needs to grant your account access before you can continue.',
    },
    'no-tenants': {
        Icon: ShieldAlert,
        title: 'No workspaces available',
        body: () => 'Your account is signed in, but it is not associated with any organization.',
        hint: 'An administrator needs to add your account to an organization before you can continue.',
    },
    // Deliberately covers TWO causes, because the browser cannot tell them
    // apart: a failed WebSocket upgrade exposes no HTTP status to JS, so a
    // gateway authorization rejection (403) and a genuine outage arrive as the
    // identical opaque transport error. Naming only "outage" here would send a
    // user with a real access problem to wait for a recovery that never comes.
    unreachable: {
        Icon: ServerCrash,
        title: 'Cannot connect',
        body: (tenant) => (
            tenant
                ? `Signed in successfully, but the connection to ${tenant} keeps being refused.`
                : 'Signed in successfully, but the connection to the server keeps being refused.'
        ),
        hint: 'This is either a temporary outage or your account may not have access to this '
            + 'workspace. Retry in a moment; if it persists, ask an administrator to check '
            + 'your access.',
    },
};

const AccessDeniedPrompt = ({denial}) => {
    const {reason, tenantId, email} = denial || {};
    const copy = COPY[reason] || COPY.unreachable;
    const {Icon} = copy;

    return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-gray-50 p-6">
            <div className="w-full max-w-lg bg-white rounded-lg shadow-lg p-8">
                <div className="text-center mb-6">
                    <Icon size={48} className="text-amber-500 mb-4 mx-auto"/>
                    <h2 className="text-2xl font-semibold text-gray-800 mb-2">{copy.title}</h2>
                    <p className="text-gray-600">{copy.body(tenantId)}</p>
                </div>

                <p className="text-sm text-gray-500 text-center mb-6">{copy.hint}</p>

                {email && (
                    <p className="text-sm text-gray-500 text-center mb-6">
                        Signed in as <span className="font-medium text-gray-700">{email}</span>
                    </p>
                )}

                <div className="flex items-center justify-center gap-3">
                    <button
                        onClick={() => window.location.reload()}
                        className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-500 text-white rounded-lg hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-offset-2 transition-colors duration-200"
                    >
                        <RefreshCw size={16}/> Retry
                    </button>
                    <form method="POST" action={getLogoutUrl()}>
                        <button
                            type="submit"
                            className="inline-flex items-center gap-2 px-5 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-300 focus:ring-offset-2 transition-colors duration-200"
                        >
                            <LogOut size={16}/> Sign out
                        </button>
                    </form>
                </div>
            </div>
        </div>
    );
};

export default AccessDeniedPrompt;
