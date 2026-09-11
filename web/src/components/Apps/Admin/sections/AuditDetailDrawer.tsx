import {useMemo} from 'react';
import {X} from 'lucide-react';
import type {AuditEntry} from '../types';

interface Props {
    entry: AuditEntry;
    onClose: () => void;
}

function sortKeysDeep(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(sortKeysDeep);
    if (value && typeof value === 'object') {
        const src = value as Record<string, unknown>;
        const out: Record<string, unknown> = {};
        for (const k of Object.keys(src).sort()) out[k] = sortKeysDeep(src[k]);
        return out;
    }
    return value;
}

function tryParseJSON(s: string): unknown {
    if (!s) return null;
    try {
        return JSON.parse(s);
    } catch {
        return null;
    }
}

export function AuditDetailDrawer({entry, onClose}: Props) {
    const metadata = useMemo(() => sortKeysDeep(tryParseJSON(entry.metadata_json)), [entry.metadata_json]);
    const timestamp = entry.timestamp
        ? new Date(entry.timestamp * 1000).toISOString()
        : '—';

    return (
        <div
            className="fixed inset-0 z-50 flex"
            onClick={onClose}
        >
            <div className="flex-1 bg-black/30"/>
            <aside
                className="w-[560px] bg-white shadow-xl overflow-y-auto"
                onClick={e => e.stopPropagation()}
            >
                <div className="p-4 border-b flex items-center justify-between">
                    <div>
                        <h3 className="text-base font-semibold">Audit entry #{entry.audit_id}</h3>
                        <div className="text-xs text-gray-500">{timestamp}</div>
                    </div>
                    <button onClick={onClose} className="p-1 rounded hover:bg-gray-100">
                        <X size={18}/>
                    </button>
                </div>
                <div className="p-4 text-sm space-y-3">
                    <Section title="Event">
                        <Field label="Event type" value={entry.event_type}/>
                        <Field label="Operation" value={entry.operation}/>
                        <Field label="Status" value={entry.success ? 'ok' : 'fail'}/>
                        {!entry.success && entry.error_message && (
                            <Field label="Error" value={entry.error_message}/>
                        )}
                    </Section>

                    <Section title="Actor">
                        <Field label="Type" value={entry.actor_type}/>
                        <Field label="Identity" value={entry.actor_id}/>
                        <Field label="Session" value={entry.session_id}/>
                        <Field label="Gateway" value={entry.gateway_id}/>
                    </Section>

                    <Section title="Resource">
                        <Field label="Type" value={entry.resource_type}/>
                        <Field label="ID" value={entry.resource_id}/>
                        <Field label="Workspace" value={entry.workspace}/>
                    </Section>

                    {(entry.subject_id || entry.authority_mode) && (
                        <Section title="Authority">
                            <Field label="Mode" value={entry.authority_mode}/>
                            <Field label="Subject" value={entry.subject_id ? `${entry.subject_type}:${entry.subject_id}` : ''}/>
                            {entry.root_subject_id && entry.root_subject_id !== entry.subject_id && (
                                <Field label="Root subject" value={`${entry.root_subject_type}:${entry.root_subject_id}`}/>
                            )}
                            <Field label="Grant" value={entry.authority_grant_id}/>
                            {entry.parent_authority_grant_id && (
                                <Field label="Parent grant" value={entry.parent_authority_grant_id}/>
                            )}
                            {entry.root_authority_grant_id && entry.root_authority_grant_id !== entry.authority_grant_id && (
                                <Field label="Root grant" value={entry.root_authority_grant_id}/>
                            )}
                        </Section>
                    )}

                    {metadata !== null && (
                        <div>
                            <div className="text-xs uppercase tracking-wide text-gray-500 mb-1">Metadata</div>
                            <pre className="bg-gray-50 border rounded p-2 text-xs overflow-x-auto">
{JSON.stringify(metadata, null, 2)}
                            </pre>
                        </div>
                    )}
                    {metadata === null && entry.metadata_json && (
                        <div>
                            <div className="text-xs uppercase tracking-wide text-gray-500 mb-1">Metadata (raw)</div>
                            <pre className="bg-gray-50 border rounded p-2 text-xs overflow-x-auto">
{entry.metadata_json}
                            </pre>
                        </div>
                    )}
                </div>
            </aside>
        </div>
    );
}

function Section({title, children}: {title: string; children: React.ReactNode}) {
    return (
        <div>
            <div className="text-xs uppercase tracking-wide text-gray-500 mb-1">{title}</div>
            <div className="space-y-2">{children}</div>
        </div>
    );
}

function Field({label, value}: {label: string; value: string}) {
    if (!value) return null;
    return (
        <div>
            <div className="text-xs text-gray-500">{label}</div>
            <div className="font-mono text-xs break-all">{value}</div>
        </div>
    );
}
