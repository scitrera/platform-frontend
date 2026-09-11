import type {ReactNode} from 'react';

export type Authority = 'tenant' | 'super';

export interface SectionDef {
    id: string;
    /** URL appPath segment (e.g. "cowork/sandboxes", "tenant/users"). */
    path: string;
    group: string;
    label: string;
    authority: Authority;
    Component: () => ReactNode;
}

export interface SandboxRow {
    task_id: string;
    // Lease task's home workspace (operator/ACL view; e.g. `_sandbox`).
    workspace: string;
    // The user's app workspace where the sandbox was triggered
    // (e.g. `default`). The user-facing context — what the list view
    // surfaces because it's the answer most operators want.
    app_workspace: string;
    user: string;
    thread_id: string;
    sandbox_id: string;
    provider: string;
    lease_status: string;
    created_at: number;
    updated_at: number;
    sidecar_connected: boolean;
    sidecar_session_id: string;
}

export interface SandboxDetail extends SandboxRow {
    raw_metadata: Record<string, unknown>;
    // Container image the sandbox is (or will be) running.
    image?: string;
    // Lifecycle phase reported by the backend. While an upgrade is in
    // flight this is an "upgrading:*" string (e.g. "upgrading:queued",
    // "upgrading:pulling"); terminal states include "running" (success)
    // and "upgrade_failed".
    phase?: string;
    // Human-readable detail for the current phase (surfaced in progress UI).
    phase_message?: string;
}

export type PullPolicy = 'never' | 'if-not-present' | 'always';

export interface ConnectionRow {
    session_id: string;
    type: string;
    identity: string;
    workspace: string;
    implementation: string;
    specifier: string;
    connected_at: number;
    duration: string;
    remote_addr: string;
    last_activity: number;
}

export interface AuditEntry {
    audit_id: number;
    timestamp: number;
    event_type: string;
    actor_type: string;
    actor_id: string;
    resource_type: string;
    resource_id: string;
    operation: string;
    workspace: string;
    session_id: string;
    gateway_id: string;
    success: boolean;
    error_message: string;
    metadata_json: string;
    subject_type: string;
    subject_id: string;
    root_subject_type: string;
    root_subject_id: string;
    authority_mode: string;
    authority_grant_id: string;
    root_authority_grant_id: string;
    parent_authority_grant_id: string;
}

export interface AuditQueryResult {
    entries: AuditEntry[];
    total_count: number;
}

// =============================================================================
// MemoryLayer admin
// =============================================================================

/** Aggregate counts from GET /v1/admin/stats. */
export interface MLStats {
    workspace_count: number;
    memory_count: number;
    session_count: number;
    document_count: number;
    dataset_count: number;
    token_count: number;
}

/**
 * Tenant-wide storage-tiering stats from GET /v1/admin/tiering (the
 * memorylayer.overview op calls admin_tiering_stats). Storage sizes are MEASURED
 * on-disk bytes (pg_total_relation_size: heap + TOAST + indexes), not estimates;
 * compression_ratio / estimated_savings remain a logical tiering-benefit model.
 */
export interface MLTieringStats {
    hot_memory_count: number;
    cold_memory_count: number;
    hot_storage_bytes: number;
    cold_storage_bytes: number;
    compression_ratio: number;
    estimated_savings_bytes: number;
    archival_candidates_count: number;
    // Measured on-disk size of the document tables (documents + document_pages).
    // Optional: absent on older backends → render guards below.
    document_storage_bytes?: number;
    documents_table_bytes?: number;
    document_pages_bytes?: number;
}

export interface MLDependency {
    status: string;
    details?: Record<string, unknown>;
}

/** GET /v1/health/dependencies. */
export interface MLHealth {
    status: string;
    dependencies: Record<string, MLDependency>;
}

/**
 * Tenant storage footprint from data-connectors → blobgw (the pack substrate).
 * MEASURED on-disk bytes: physical is post dedup + compression (the effective
 * storage), logical_deduped is unique content pre-compression. Covers both mlfs
 * files and blobgw blobs (shared substrate). Distinct from the DB-relation-size
 * numbers in MLTieringStats. `computed_at` is blobgw's real compute time even
 * when served from the DC cache; `cached` marks a cache hit.
 */
export interface MLStorageUsage {
    physical_bytes: number;
    logical_deduped_bytes: number;
    compression_ratio: number;
    // blobgw-object apparent bytes only (references into the shared substrate);
    // always present. The mlfs slice-reference side lives in a separate meta DB
    // blobgw can't see, so a true tenant-wide apparent requires data-connectors
    // to add it in — see the mlfs.* fields below.
    object_apparent_bytes: number;
    // Present only when data-connectors could read the mlfs meta DB (`mlfs`).
    // apparent_bytes = object_apparent + mlfs slice sources (pre-dedup referenced
    // size, duplicates counted); dedup_ratio = apparent / deduped; file_logical
    // is the apparent total of mlfs files; mlfs_apparent is the mlfs slice-source
    // portion. Absent → substrate-only rollup (older backend or meta unreachable).
    mlfs?: boolean;
    apparent_bytes?: number;
    dedup_ratio?: number;
    mlfs_apparent_bytes?: number;
    file_logical_bytes?: number;
    computed_at?: string;
    cached?: boolean;
}

/** memorylayer.overview op result (stats + best-effort tiering + health + storage). */
export interface MLOverview {
    overview: MLStats | null;
    tiering: MLTieringStats | null;
    health: MLHealth | null;
    storage: MLStorageUsage | null;
}

/** memorylayer.tiering_run op result (on-demand sweep / dry-run preview). */
export interface MLTieringRunResult {
    dry_run: boolean;
    only_enabled: boolean;
    workspaces_processed: number;
    workspaces_skipped: number;
    total_candidates: number;
    total_archived: number;
    total_failed: number;
    per_workspace: Array<Record<string, unknown>>;
}

/** Paginated envelope shared by sessions / jobs / memories. */
export interface MLPaginated<T> {
    items: T[];
    total: number;
    limit: number;
    offset: number;
}

export interface MLSession {
    id: string;
    workspace_id: string;
    user_id: string | null;
    tenant_id: string;
    context_id: string;
    auto_commit: boolean;
    committed_at: string | null;
    metadata: Record<string, unknown>;
    expires_at: string;
    created_at: string;
}

export interface MLJob {
    id: string;
    workspace_id: string;
    // 'document' | 'dataset' — synthesized by the admin_list_jobs projection.
    job_type: string;
    status: string;
    progress_percent: number;
    created_at: string;
    started_at: string | null;
    completed_at: string | null;
}

export interface MLMemory {
    id: string;
    workspace_id: string;
    tenant_id: string;
    context_id: string | null;
    user_id: string | null;
    content: string;
    content_hash: string;
    type: string;
    subtype: string | null;
    importance: number;
    tags: string[];
    metadata: Record<string, unknown>;
    abstract: string | null;
    overview: string | null;
    session_id: string | null;
    source_memory_id: string | null;
    category: string | null;
    status: string;
    deleted_at: string | null;
    created_at: string;
    updated_at: string;
}

export interface MLAuditEvent {
    id: string;
    event_type: string;
    action: string;
    tenant_id: string;
    workspace_id: string | null;
    user_id: string | null;
    resource_type: string | null;
    resource_id: string | null;
    metadata: Record<string, unknown>;
    timestamp: string;
}

/** memorylayer.audit op result (events + count; no offset paging). */
export interface MLAuditResult {
    events: MLAuditEvent[];
    count: number;
}

export interface MLDocument {
    id: string;
    workspace_id: string;
    filename: string;
    document_type: string;
    content_hash: string;
    size_bytes: number;
    mime_type: string | null;
    status: string;
    target_context_id: string;
    page_count: number;
    chunk_count: number;
    memory_ids: string[];
    created_at: string;
    processing_started_at: string | null;
    processing_completed_at: string | null;
}

export interface MLDataset {
    id: string;
    workspace_id: string;
    name: string;
    filename: string;
    format: string;
    content_hash: string;
    size_bytes: number;
    status: string;
    target_context_id: string;
    row_count: number;
    column_count: number;
    memory_ids: string[];
    created_at: string;
    profiling_started_at: string | null;
    profiling_completed_at: string | null;
}

/**
 * A MemoryLayer workspace. MemoryLayer exposes no dedicated admin/paginated
 * workspaces endpoint, so the ``memorylayer.workspaces`` op wraps the bare
 * ``GET /v1/workspaces`` list; fields beyond id/name are best-effort.
 */
export interface MLWorkspace {
    id: string;
    name?: string;
    created_at?: string;
    settings?: Record<string, unknown>;
}

/** Chat-thread list row (memorylayer.chats). Super-admin only. */
export interface MLChatThread {
    id: string;
    workspace_id: string;
    tenant_id: string;
    user_id: string | null;
    title: string | null;
    ownership: string;
    scope: string;
    message_count: number;
    parent_thread: string | null;
    idle_action: string | null;
    hidden_at: string | null;
    expires_at: string | null;
    created_at: string;
    updated_at: string | null;
}

/** Skill list row (memorylayer.skills). Super-admin only. */
export interface MLSkill {
    id: string;
    workspace_id: string;
    tenant_id: string;
    user_id: string | null;
    name: string;
    description: string;
    version: string;
    source_mode: string;
    enabled: boolean;
    created_at: string;
    updated_at: string | null;
}

/** MCP-server list row (memorylayer.mcp_servers). Super-admin only. */
export interface MLMcpServer {
    id: string;
    workspace_id: string;
    tenant_id: string;
    user_id: string | null;
    name: string;
    description: string | null;
    transport: string;
    enabled: boolean;
    created_at: string;
    updated_at: string | null;
}

/** Application list row (memorylayer.applications). Super-admin only. */
export interface MLApplication {
    id: string;
    tenant_id: string;
    name: string;
    description: string | null;
    app_type: string;
    enabled: boolean;
    skill_count: number;
    mcp_server_count: number;
    tool_count: number;
    created_at: string;
    updated_at: string | null;
}
