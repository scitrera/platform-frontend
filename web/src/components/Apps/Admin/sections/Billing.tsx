import {Fragment, useCallback, useContext, useEffect, useMemo, useState} from 'react';
import {Bar} from 'react-chartjs-2';
import {
    Chart as ChartJS,
    BarElement,
    CategoryScale,
    LinearScale,
    Tooltip as ChartTooltip,
    Legend,
    Title,
    type ChartData,
    type ChartOptions,
} from 'chart.js';
import {WebSocketContext} from '@/contexts/WebSocketContext';
import {useAuthStore} from '@/stores/authStore';
import {adminRpc} from '@/utils/adminRpc';
import {Tooltip, TooltipContent, TooltipProvider, TooltipTrigger} from '@/components/ui/tooltip';
import {EmptyState} from '../_shared/EmptyState';
import {SuperBadge} from '../_shared/IdentityBadge';
import {TimeAgo} from '../_shared/TimeAgo';

/** Treat null/undefined the same as zero for visibility decisions. */
function isZeroOrEmpty(v: number | null | undefined): boolean {
    return v == null || Number.isNaN(v) || v === 0;
}

// chart.js v3+ requires explicit registration of every controller, scale,
// and plugin we use. Idempotent — safe to run on every module import.
ChartJS.register(BarElement, CategoryScale, LinearScale, ChartTooltip, Legend, Title);

const POLL_MS = 60_000;

type BreakdownDim = 'user' | 'workspace' | 'agent' | 'kind' | 'source';

interface BreakdownRow {
    key: string;
    value: number;
}

interface MeterData {
    value: number | null;
    breakdowns?: Partial<Record<BreakdownDim, BreakdownRow[]>>;
    error?: string;
}

interface InvoiceLine {
    id?: string;
    name?: string;
    featureKey?: string;
    quantity?: string;
    meteredQuantity?: string;
    rateCard?: {key?: string; name?: string};
    totals?: {amount?: string; total?: string};
    type?: string;
    // Per-line period (from/to). Different lines on the same invoice can
    // span different periods — e.g. metered usage for the current period
    // alongside a pre-billed seat fee for the next period.
    period?: {from?: string; to?: string; start?: string; end?: string};
}

interface Invoice {
    id?: string;
    status?: string;
    currency?: string;
    // OpenMeter uses {from, to} on invoice.period (not {start, end} like
    // some other sub-objects). Keep the legacy keys typed too in case the
    // shape varies across endpoints.
    period?: {from?: string; to?: string; start?: string; end?: string};
    totals?: {amount?: string; total?: string};
    lines?: InvoiceLine[];
}

interface BillingConfig {
    customer_key?: string;
    customer_id?: string;
    plan_key?: string;
    plan_id?: string;
    subscription_id?: string;
    currency?: string;
}

interface InvoiceHistorySnapshot {
    empty: boolean;
    reason?: string;
    synced_at?: number;
    customer_id?: string;
    lookback_months?: number;
    invoices?: Invoice[];
    billing_config?: BillingConfig | null;
}

interface UsageSnapshot {
    empty: boolean;
    reason?: string;
    synced_at?: number;
    subject?: string;
    from?: string;
    to?: string;
    meters?: Record<string, MeterData>;
    invoice?: Invoice | null;
    billing_config?: BillingConfig | null;
}

// Display order matches openmeter-config.yaml. Any meters returned by the
// snapshot that aren't listed here are appended at the end with their slug
// as the label.
const METER_DISPLAY: Array<{slug: string; label: string; unit: string}> = [
    {slug: 'tokens_in',          label: 'LLM Input Tokens',  unit: 'tokens'},
    {slug: 'tokens_out',         label: 'LLM Output Tokens', unit: 'tokens'},
    {slug: 'time_seconds',       label: 'Compute Time',      unit: 'seconds'},
    {slug: 'credits',            label: 'Aether Credits',    unit: 'credits'},
    {slug: 'startups',           label: 'Agent Startups',    unit: 'starts'},
    {slug: 'cpu_time',           label: 'CPU Time',          unit: 'core-sec'},
    {slug: 'gpu_time',           label: 'GPU Time',          unit: 'gpu-sec'},
    {slug: 'ram_time',           label: 'Memory Time',       unit: 'GB-sec'},
    {slug: 'storage_gb_seconds', label: 'Storage',           unit: 'GB-sec'},
];

const BREAKDOWN_TABS: Array<{key: 'total' | BreakdownDim; label: string}> = [
    {key: 'total',     label: 'Total'},
    {key: 'user',      label: 'By User'},
    {key: 'workspace', label: 'By Workspace'},
    {key: 'agent',     label: 'By Agent'},
    {key: 'kind',      label: 'By Kind'},     // declared by every meter except `credits`
    {key: 'source',    label: 'By Source'},   // declared by cpu_time / gpu_time / ram_time only
];

function formatNumber(value: number | null | undefined): string {
    if (value == null || Number.isNaN(value)) return '—';
    if (Number.isInteger(value)) return value.toLocaleString();
    return value.toLocaleString(undefined, {maximumFractionDigits: 4});
}

/** Time-based meters use whole seconds — fractional seconds add no signal at this scale. */
function isSecondsUnit(unit: string | undefined): boolean {
    return !!unit && unit.toLowerCase().includes('sec');
}

/** Format a meter value, rounding to whole seconds when the unit is seconds-based. */
function formatMeterValue(value: number | null | undefined, unit: string | undefined): string {
    if (value == null || Number.isNaN(value)) return '—';
    if (isSecondsUnit(unit)) return Math.round(value).toLocaleString();
    return formatNumber(value);
}

function formatMoney(amount: string | number | null | undefined,
                     currency: string | undefined): string {
    if (amount == null || amount === '') return '—';
    const num = typeof amount === 'string' ? parseFloat(amount) : amount;
    if (Number.isNaN(num)) return '—';
    return `${num.toFixed(2)} ${currency ?? ''}`.trim();
}

// Three top-level admin sections under the "Billing" group:
//   - UsageSection:    real-time usage + in-progress invoice  (15-min KV cache)
//   - InvoicesSection: finalized invoice history              (24-h KV cache)
//   - TrendsSection:   charts of spend over time              (built from invoice history)
// Each is registered separately in AdminDashboardApp.SECTIONS so they appear
// as siblings in the sidebar (matching the Aether/Connections pattern).

export function UsageSection() {
    const ws = useContext(WebSocketContext);
    const sendRpcRequest = ws?.sendRpcRequest;
    // Zero/empty meters and breakdown rows are super-only — keeps the
    // tenant-admin view focused on what the customer actually consumed.
    const canSuper = useAuthStore(s => !!s.userInfo?.permissions?.isSuperAdmin);

    const [snapshot, setSnapshot] = useState<UsageSnapshot | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [tab, setTab] = useState<'total' | BreakdownDim>('total');

    const refresh = useCallback(async () => {
        if (!sendRpcRequest) return;
        setLoading(true);
        setError(null);
        try {
            const data = await adminRpc<UsageSnapshot>(
                sendRpcRequest,
                'billing.get_usage_snapshot',
            );
            setSnapshot(data);
        } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
        } finally {
            setLoading(false);
        }
    }, [sendRpcRequest]);

    useEffect(() => {
        refresh();
        const t = setInterval(refresh, POLL_MS);
        return () => clearInterval(t);
    }, [refresh]);

    const meters = snapshot?.meters ?? {};
    const invoice = snapshot?.invoice ?? null;
    const currency = invoice?.currency ?? snapshot?.billing_config?.currency;

    // Map feature key → invoice line for cost-per-meter rendering.
    const lineByFeature = useMemo(() => {
        const map: Record<string, InvoiceLine> = {};
        for (const line of invoice?.lines ?? []) {
            const k = line.featureKey ?? line.rateCard?.key;
            if (k) map[k] = line;
        }
        return map;
    }, [invoice]);

    // Invoice lines that DON'T correspond to one of our metered meters —
    // typically flat-rate base charges (seat fee, platform fee, etc).
    // Without these, a $10 invoice total looks like it appeared from
    // nowhere; surfacing them in their own section closes the loop.
    const baseCharges = useMemo(() => {
        const meterKeys = new Set(METER_DISPLAY.map(d => d.slug));
        return (invoice?.lines ?? []).filter(line => {
            const k = line.featureKey ?? line.rateCard?.key;
            return !k || !meterKeys.has(k);
        });
    }, [invoice]);

    // Display order of meters: configured ones first, then any extras.
    const orderedMeters = useMemo(() => {
        const known = METER_DISPLAY.map(d => ({
            ...d,
            data: meters[d.slug] as MeterData | undefined,
            line: lineByFeature[d.slug],
        }));
        const extras = Object.entries(meters)
            .filter(([slug]) => !METER_DISPLAY.find(d => d.slug === slug))
            .map(([slug, m]) => ({
                slug, label: slug, unit: '',
                data: m as MeterData, line: lineByFeature[slug],
            }));
        return [...known, ...extras];
    }, [meters, lineByFeature]);

    // For each tab, decide whether a tenant admin would see ANY non-zero
    // content. Tabs that come up empty for tenants are hidden from them and
    // SUPER-badged for super-admins (mirrors the row-level visibility rule).
    const tabHasTenantContent = useMemo<Record<'total' | BreakdownDim, boolean>>(() => {
        const totalHasContent =
            orderedMeters.some(m => !isZeroOrEmpty(m.data?.value)) ||
            baseCharges.some(line => {
                const amt = line.totals?.total ?? line.totals?.amount;
                const num = amt != null && amt !== '' ? parseFloat(amt) : null;
                return !isZeroOrEmpty(num);
            });
        const dimHasContent = (dim: BreakdownDim) =>
            orderedMeters.some(m =>
                (m.data?.breakdowns?.[dim] ?? []).some(r => !isZeroOrEmpty(r.value)),
            );
        return {
            total:     totalHasContent,
            user:      dimHasContent('user'),
            workspace: dimHasContent('workspace'),
            agent:     dimHasContent('agent'),
            kind:      dimHasContent('kind'),
            source:    dimHasContent('source'),
        };
    }, [orderedMeters, baseCharges]);

    const visibleTabs = useMemo(
        () => canSuper ? BREAKDOWN_TABS : BREAKDOWN_TABS.filter(t => tabHasTenantContent[t.key]),
        [canSuper, tabHasTenantContent],
    );

    // If the currently active tab is no longer visible (data changed under
    // us, or the user just lost super access), snap to the first visible tab.
    useEffect(() => {
        if (!visibleTabs.find(t => t.key === tab)) {
            setTab(visibleTabs[0]?.key ?? 'total');
        }
    }, [visibleTabs, tab]);

    return (
        <div className="flex flex-col h-full p-4 gap-4 overflow-auto">
            {/* ── Header ─────────────────────────────────────────── */}
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-lg font-semibold">Usage</h2>
                    {snapshot?.synced_at ? (
                        <p className="text-xs text-gray-500">
                            Snapshot refreshed <TimeAgo ts={snapshot.synced_at}/> · data is up to 15 min stale
                        </p>
                    ) : (
                        <p className="text-xs text-gray-500">
                            Sourced from OpenMeter via the metrics-bridge.
                        </p>
                    )}
                </div>
                <button
                    onClick={refresh}
                    disabled={loading}
                    className="px-3 py-1.5 rounded border bg-white hover:bg-gray-50 disabled:opacity-50 text-sm"
                >
                    {loading ? 'Loading…' : 'Refresh'}
                </button>
            </div>

            {error && (
                <div className="p-3 bg-red-50 border border-red-200 rounded text-sm text-red-700">
                    {error}
                </div>
            )}

            {/* ── Empty state ────────────────────────────────────── */}
            {snapshot?.empty && (
                <EmptyState
                    title="No usage snapshot yet"
                    description={
                        snapshot.reason === 'no_billing_config'
                            ? 'This tenant has no OpenMeter billing configuration. Run ./dev-billing.sh setup.'
                            : 'metrics-bridge hasn\'t produced a snapshot yet. It refreshes every 15 minutes; check back shortly.'
                    }
                />
            )}

            {!snapshot?.empty && snapshot && (
                <>
                    {/* ── Invoice in progress ────────────────────── */}
                    <InvoiceCard
                        invoice={invoice}
                        config={snapshot.billing_config}
                        subject={snapshot.subject}
                        currency={currency}
                    />

                    {/* ── Tabs ───────────────────────────────────── */}
                    <div className="flex gap-1 border-b">
                        {visibleTabs.map(t => {
                            const tabIsSuperOnly = !tabHasTenantContent[t.key];
                            return (
                                <button
                                    key={t.key}
                                    onClick={() => setTab(t.key)}
                                    className={`px-3 py-2 text-sm border-b-2 -mb-px ${
                                        tab === t.key
                                            ? 'border-blue-500 font-medium text-blue-700'
                                            : 'border-transparent text-gray-600 hover:text-gray-900'
                                    }`}
                                >
                                    {tabIsSuperOnly && <SuperBadge title="No nonzero data — hidden from tenant admins"/>}
                                    {t.label}
                                </button>
                            );
                        })}
                    </div>

                    {/* ── Tab content ────────────────────────────── */}
                    {tab === 'total' ? (
                        <>
                            <BaseChargesTable
                                lines={baseCharges}
                                currency={currency}
                                canSuper={canSuper}
                            />
                            <TotalUsageTable
                                meters={orderedMeters}
                                currency={currency}
                                from={snapshot.from}
                                to={snapshot.to}
                                invoiceTotal={invoice?.totals?.total ?? invoice?.totals?.amount}
                                canSuper={canSuper}
                            />
                        </>
                    ) : (
                        <BreakdownView
                            meters={orderedMeters}
                            dimension={tab}
                            canSuper={canSuper}
                        />
                    )}
                </>
            )}
        </div>
    );
}

function InvoiceCard({
    invoice, config, subject, currency,
}: {
    invoice: Invoice | null;
    config: BillingConfig | null | undefined;
    subject: string | undefined;
    currency: string | undefined;
}) {
    const period = invoice?.period;
    const total = invoice?.totals?.total ?? invoice?.totals?.amount;
    // Customer falls back to snapshot.subject (the bridge always sets it)
    // when billing_config hasn't propagated yet — e.g. admin op response
    // raced an in-flight setup.
    const customerLabel = config?.customer_key ?? subject ?? '—';
    return (
        <div className="rounded border bg-gradient-to-r from-blue-50 to-white p-4">
            <div className="flex items-baseline justify-between mb-2">
                <div>
                    <h3 className="text-sm font-semibold text-gray-700">
                        Invoice in progress
                    </h3>
                    <p className="text-xs text-gray-500">
                        Customer:{' '}
                        <span className="font-mono">{customerLabel}</span>
                        {config?.plan_key && (
                            <>
                                {' '}· Plan:{' '}
                                <span className="font-mono">{config.plan_key}</span>
                            </>
                        )}
                        {invoice?.status && (
                            <>
                                {' '}· Status:{' '}
                                <span className="font-mono">{invoice.status}</span>
                            </>
                        )}
                    </p>
                </div>
                <div className="text-right">
                    <div className="text-xs text-gray-500">Period total</div>
                    <div className="text-2xl font-semibold tabular-nums">
                        {formatMoney(total, currency)}
                    </div>
                </div>
            </div>
            {period && (
                <p className="text-xs text-gray-500">
                    {(period.from ?? period.start)?.slice(0, 10) ?? '—'}
                    {' → '}
                    {(period.to ?? period.end)?.slice(0, 10) ?? '—'}
                </p>
            )}
            {!invoice && (
                <p className="text-xs text-gray-500 italic">
                    No gathering invoice yet — the subscription's first billing
                    period hasn't accumulated any rated events. The bridge keeps
                    polling.
                </p>
            )}
        </div>
    );
}

function formatLinePeriod(period: InvoiceLine['period']): string {
    if (!period) return '—';
    const from = (period.from ?? period.start)?.slice(0, 10);
    const to = (period.to ?? period.end)?.slice(0, 10);
    if (!from && !to) return '—';
    return `${from ?? '—'} → ${to ?? '—'}`;
}

function BaseChargesTable({
    lines,
    currency,
    canSuper,
}: {
    lines: InvoiceLine[];
    currency: string | undefined;
    canSuper: boolean;
}) {
    // Annotate rows with a "zero or empty amount" flag so we can hide them
    // from tenant admins and badge them for super-admins.
    const rows = useMemo(() => lines.map(line => {
        const amountStr = line.totals?.total ?? line.totals?.amount;
        const amount = amountStr != null && amountStr !== '' ? parseFloat(amountStr) : null;
        return {line, amount, zero: isZeroOrEmpty(amount)};
    }), [lines]);

    const visible = canSuper ? rows : rows.filter(r => !r.zero);
    if (visible.length === 0) return null;

    return (
        <div className="border rounded bg-white">
            <div className="px-3 py-2 border-b bg-gray-50 text-xs uppercase tracking-wide text-gray-600">
                Base charges (flat-rate line items from the in-progress invoice)
            </div>
            <table className="w-full text-sm">
                <thead className="text-xs uppercase tracking-wide text-gray-600">
                    <tr>
                        <th className="px-3 py-2 text-left">Charge</th>
                        <th className="px-3 py-2 text-left">Period</th>
                        <th className="px-3 py-2 text-right">Quantity</th>
                        <th className="px-3 py-2 text-right">Amount</th>
                    </tr>
                </thead>
                <tbody>
                    {visible.map(({line, zero}, i) => (
                        <tr key={line.id ?? i} className="border-t">
                            <td className="px-3 py-2">
                                {zero && <SuperBadge title="Zero amount — hidden from tenant admins"/>}
                                {line.name ?? '—'}
                            </td>
                            <td className="px-3 py-2 font-mono text-xs text-gray-600">
                                {formatLinePeriod(line.period)}
                            </td>
                            <td className="px-3 py-2 text-right font-mono">
                                {line.quantity ?? '—'}
                            </td>
                            <td className="px-3 py-2 text-right font-mono">
                                {formatMoney(
                                    line.totals?.total ?? line.totals?.amount,
                                    currency,
                                )}
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

function TotalUsageTable({
    meters,
    currency,
    from,
    to,
    invoiceTotal,
    canSuper,
}: {
    meters: Array<{
        slug: string; label: string; unit: string;
        data: MeterData | undefined;
        line: InvoiceLine | undefined;
    }>;
    currency: string | undefined;
    from: string | undefined;
    to: string | undefined;
    invoiceTotal: string | undefined;
    canSuper: boolean;
}) {
    // For the "avg/day" denominator we want elapsed days within the current
    // period, NOT total period length. Otherwise an in-progress month would
    // artificially deflate avg/day (e.g. on the 14th, dividing by 30 makes
    // the running rate look ~half of reality).
    //
    // - If from ≤ now ≤ to:   denominator = days elapsed since `from`,
    //                         floored at 1 day so the first hours of a
    //                         period don't blow up the rate.
    // - If now < from:        period hasn't started → no average yet.
    // - Otherwise:            period bounds are missing or stale (e.g. dev
    //                         setup with no gathering invoice). Fall back
    //                         to "day of the current calendar month" so the
    //                         number is at least sane (today is May 1 → 1).
    const {elapsedDays, denominatorMode} = useMemo(() => {
        const dayMs = 1000 * 60 * 60 * 24;
        const nowMs = Date.now();
        const fromMs = from ? Date.parse(from) : NaN;
        const toMs = to ? Date.parse(to) : NaN;

        // Real in-progress period: now is between from and to.
        if (Number.isFinite(fromMs) && Number.isFinite(toMs)
            && toMs > fromMs && nowMs >= fromMs && nowMs <= toMs) {
            const elapsed = Math.max(1, (nowMs - fromMs) / dayMs);
            return {elapsedDays: elapsed, denominatorMode: 'in_progress' as const};
        }
        // Period legitimately in the future.
        if (Number.isFinite(fromMs) && nowMs < fromMs) {
            return {elapsedDays: null, denominatorMode: 'not_started' as const};
        }
        // No usable period bounds (missing or stale). Use day-of-month so the
        // rate makes sense even before the first invoice has gathered.
        const dayOfMonth = new Date().getDate();  // 1..31
        return {elapsedDays: dayOfMonth, denominatorMode: 'day_of_month' as const};
    }, [from, to]);

    // Plain-text tooltip for the Avg/day column header.
    const avgPerDayHelp = useMemo(() => {
        switch (denominatorMode) {
            case 'in_progress':
                return `Total usage ÷ days elapsed in this period (${elapsedDays!.toFixed(1)} so far). ` +
                       `Reflects the running rate, not a forecast — won't get diluted by days that haven't happened yet.`;
            case 'day_of_month':
                return `Total usage ÷ ${elapsedDays} (current day of the calendar month). ` +
                       `Used as a fallback when the snapshot has no live billing period — e.g. no gathering invoice has been created yet.`;
            case 'not_started':
                return 'Period hasn\'t started yet — no average available.';
            default:
                return 'Period bounds missing — no average available.';
        }
    }, [denominatorMode, elapsedDays]);

    const invoiceTotalNum = useMemo(() => {
        if (invoiceTotal == null || invoiceTotal === '') return null;
        const n = parseFloat(invoiceTotal);
        return Number.isFinite(n) && n > 0 ? n : null;
    }, [invoiceTotal]);

    // Pre-compute zero/empty flag per meter. A meter is "zero" when usage is
    // null/0 — line cost is irrelevant (a meter can have a flat-rate line
    // with cost while reporting no usage; we follow the user's spec that
    // visibility is driven by the metered quantity).
    const visibleMeters = useMemo(() => {
        const decorated = meters.map(m => ({m, zero: isZeroOrEmpty(m.data?.value)}));
        return canSuper ? decorated : decorated.filter(r => !r.zero);
    }, [meters, canSuper]);

    if (visibleMeters.length === 0) return null;

    return (
        <TooltipProvider>
        <div className="border rounded bg-white">
            <table className="w-full text-sm">
                <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-600">
                    <tr>
                        <th className="px-3 py-2 text-left">Meter</th>
                        <th className="px-3 py-2 text-left">Period</th>
                        <th className="px-3 py-2 text-right">Usage</th>
                        <th className="px-3 py-2 text-left">Unit</th>
                        <th className="px-3 py-2 text-right">
                            <span className="inline-flex items-center gap-1">
                                Avg/day
                                <Tooltip>
                                    <TooltipTrigger asChild>
                                        <span className="cursor-help text-gray-400 hover:text-gray-600 normal-case font-normal">(?)</span>
                                    </TooltipTrigger>
                                    <TooltipContent className="max-w-xs">{avgPerDayHelp}</TooltipContent>
                                </Tooltip>
                            </span>
                        </th>
                        <th className="px-3 py-2 text-right">Cost</th>
                        <th className="px-3 py-2 text-right">% of total</th>
                    </tr>
                </thead>
                <tbody>
                    {visibleMeters.map(({m, zero}) => {
                        const usage = m.data?.value;
                        const costStr = m.line?.totals?.total ?? m.line?.totals?.amount;
                        const cost = costStr != null ? parseFloat(costStr) : null;
                        const avgPerDay = (usage != null && elapsedDays)
                            ? usage / elapsedDays : null;
                        const pctOfTotal = (cost != null && invoiceTotalNum)
                            ? (cost / invoiceTotalNum) * 100 : null;
                        return (
                            <tr key={m.slug} className="border-t">
                                <td className="px-3 py-2">
                                    {zero && <SuperBadge title="Zero/no usage — hidden from tenant admins"/>}
                                    <span>{m.label}</span>
                                    <span className="ml-2 text-xs text-gray-400 font-mono">
                                        {m.slug}
                                    </span>
                                </td>
                                <td className="px-3 py-2 font-mono text-xs text-gray-600">
                                    {formatLinePeriod(m.line?.period)}
                                </td>
                                <td className="px-3 py-2 text-right font-mono">
                                    {formatMeterValue(usage, m.unit)}
                                </td>
                                <td className="px-3 py-2 text-gray-500">{m.unit || '—'}</td>
                                <td className="px-3 py-2 text-right font-mono text-gray-600">
                                    {formatMeterValue(avgPerDay, m.unit)}
                                </td>
                                <td className="px-3 py-2 text-right font-mono">
                                    {formatMoney(costStr, currency)}
                                </td>
                                <td className="px-3 py-2 text-right font-mono text-gray-500">
                                    {pctOfTotal != null
                                        ? `${pctOfTotal.toFixed(1)}%`
                                        : '—'}
                                </td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
        </TooltipProvider>
    );
}

function BreakdownView({
    meters,
    dimension,
    canSuper,
}: {
    meters: Array<{
        slug: string; label: string; unit: string;
        data: MeterData | undefined;
        line: InvoiceLine | undefined;
    }>;
    dimension: BreakdownDim;
    canSuper: boolean;
}) {
    // Decorate each meter with its rendered (filtered) breakdown rows so we
    // can decide whether the whole card is super-only.
    const cards = meters.map(m => {
        const rawRows = m.data?.breakdowns?.[dimension] ?? [];
        const decoratedRows = rawRows.map(r => ({...r, zero: isZeroOrEmpty(r.value)}));
        const visibleRows = canSuper ? decoratedRows : decoratedRows.filter(r => !r.zero);
        // A card is "super-only" when nothing remains visible to a tenant
        // admin — empty breakdown OR all rows zero. The card still renders
        // for super-admins and gets a SUPER badge.
        const cardIsSuperOnly = visibleRows.length === 0 || visibleRows.every(r => r.zero);
        return {m, visibleRows, cardIsSuperOnly};
    });

    const visibleCards = canSuper ? cards : cards.filter(c => !c.cardIsSuperOnly);
    if (visibleCards.length === 0) return null;

    return (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {visibleCards.map(({m, visibleRows, cardIsSuperOnly}) => (
                <div key={m.slug} className="border rounded bg-white">
                    <div className="px-3 py-2 border-b bg-gray-50 flex items-baseline justify-between">
                        <div>
                            {cardIsSuperOnly && <SuperBadge title="No nonzero breakdown rows — hidden from tenant admins"/>}
                            <span className="text-sm font-semibold">{m.label}</span>
                            <span className="ml-2 text-xs text-gray-500 font-mono">
                                ({m.slug})
                            </span>
                        </div>
                        <div className="text-xs text-gray-500">
                            Total: <span className="font-mono">{formatMeterValue(m.data?.value, m.unit)}</span> {m.unit}
                        </div>
                    </div>
                    {visibleRows.length === 0 ? (
                        <div className="px-3 py-4 text-xs text-gray-500 italic">
                            No usage broken down by {dimension} this period.
                        </div>
                    ) : (
                        <table className="w-full text-sm">
                            <thead className="text-xs uppercase tracking-wide text-gray-600">
                                <tr>
                                    <th className="px-3 py-2 text-left">{dimension}</th>
                                    <th className="px-3 py-2 text-right">Usage</th>
                                    <th className="px-3 py-2 text-right">% of total</th>
                                </tr>
                            </thead>
                            <tbody>
                                {visibleRows.map(r => {
                                    const total = m.data?.value ?? 0;
                                    const pct = total > 0 ? (r.value / total) * 100 : 0;
                                    return (
                                        <tr key={r.key} className="border-t">
                                            <td className="px-3 py-2 font-mono text-xs">
                                                {r.zero && <SuperBadge title="Zero usage — hidden from tenant admins"/>}
                                                {r.key}
                                            </td>
                                            <td className="px-3 py-2 text-right font-mono">
                                                {formatMeterValue(r.value, m.unit)}
                                            </td>
                                            <td className="px-3 py-2 text-right font-mono text-gray-500">
                                                {pct.toFixed(1)}%
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    )}
                </div>
            ))}
        </div>
    );
}

// ============================================================================
// InvoicesView — historical invoices (synced once/24h by the bridge)
// ============================================================================

const INVOICES_POLL_MS = 5 * 60_000;  // refresh from cache every 5 min

// Cosmetic prefix indicating the invoice originated in the Scitrera
// platform's OpenMeter backend. OpenMeter's auto-generated numbers
// look like "INV-EXAMPLE-1"; we prepend "SP-" purely at display time so
// invoices are visually attributable to the platform when shared with
// customers / accounting. Once we wire up the custom_invoicing
// finalized() callback to set explicit numbers, this becomes a no-op
// (the real number will already include whatever prefix we choose).
const PLATFORM_INVOICE_PREFIX = 'SP-';

function displayInvoiceNumber(num: string | undefined): string {
    if (!num) return '—';
    if (num.startsWith(PLATFORM_INVOICE_PREFIX)) return num;
    return `${PLATFORM_INVOICE_PREFIX}${num}`;
}

function statusColor(status: string | undefined): string {
    switch (status) {
        case 'paid':              return 'bg-green-100 text-green-700';
        case 'issued':
        case 'payment_processing':return 'bg-blue-100 text-blue-700';
        case 'overdue':
        case 'uncollectible':     return 'bg-red-100 text-red-700';
        case 'voided':            return 'bg-gray-100 text-gray-600';
        default:                  return 'bg-gray-100 text-gray-700';
    }
}

export function InvoicesSection() {
    const ws = useContext(WebSocketContext);
    const sendRpcRequest = ws?.sendRpcRequest;

    const [snapshot, setSnapshot] = useState<InvoiceHistorySnapshot | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [expanded, setExpanded] = useState<string | null>(null);

    const refresh = useCallback(async () => {
        if (!sendRpcRequest) return;
        setLoading(true);
        setError(null);
        try {
            const data = await adminRpc<InvoiceHistorySnapshot>(
                sendRpcRequest,
                'billing.get_invoice_history',
            );
            setSnapshot(data);
        } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
        } finally {
            setLoading(false);
        }
    }, [sendRpcRequest]);

    useEffect(() => {
        refresh();
        const t = setInterval(refresh, INVOICES_POLL_MS);
        return () => clearInterval(t);
    }, [refresh]);

    const invoices = snapshot?.invoices ?? [];
    const lookback = snapshot?.lookback_months ?? 24;

    return (
        <div className="flex flex-col h-full p-4 gap-4 overflow-auto">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-lg font-semibold">Invoices</h2>
                    {snapshot?.synced_at ? (
                        <p className="text-xs text-gray-500">
                            Synced <TimeAgo ts={snapshot.synced_at}/> · last {lookback} months · refreshed daily
                        </p>
                    ) : (
                        <p className="text-xs text-gray-500">
                            Synced once daily by the metrics-bridge from OpenMeter.
                        </p>
                    )}
                </div>
                <button
                    onClick={refresh}
                    disabled={loading}
                    className="px-3 py-1.5 rounded border bg-white hover:bg-gray-50 disabled:opacity-50 text-sm"
                >
                    {loading ? 'Loading…' : 'Refresh'}
                </button>
            </div>

            {error && (
                <div className="p-3 bg-red-50 border border-red-200 rounded text-sm text-red-700">
                    {error}
                </div>
            )}

            {snapshot?.empty && (
                <EmptyState
                    title="No invoice history yet"
                    description={
                        snapshot.reason === 'no_billing_config'
                            ? 'This tenant has no OpenMeter billing configuration. Run ./dev-billing.sh setup.'
                            : 'metrics-bridge hasn\'t synced any finalized invoices yet. The first sync runs at startup; finalized invoices appear once subscription periods close.'
                    }
                />
            )}

            {!snapshot?.empty && invoices.length === 0 && (
                <EmptyState
                    title="No finalized invoices in window"
                    description={`No invoices have been finalized in the last ${lookback} months. The current period's invoice is still gathering — see the Usage tab.`}
                />
            )}

            {invoices.length > 0 && (
                <div className="border rounded bg-white">
                    <table className="w-full text-sm">
                        <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-600">
                            <tr>
                                <th className="px-3 py-2 text-left">Status</th>
                                <th className="px-3 py-2 text-left">Number</th>
                                <th className="px-3 py-2 text-left">Period</th>
                                <th className="px-3 py-2 text-right">Lines</th>
                                <th className="px-3 py-2 text-right">Total</th>
                                <th className="px-3 py-2 text-right" />
                            </tr>
                        </thead>
                        <tbody>
                            {invoices.map(inv => {
                                const isOpen = expanded === inv.id;
                                const total = inv.totals?.total ?? inv.totals?.amount;
                                return (
                                    <Fragment key={inv.id}>
                                        <tr
                                            className="border-t cursor-pointer hover:bg-gray-50"
                                            onClick={() => setExpanded(isOpen ? null : inv.id ?? null)}
                                        >
                                            <td className="px-3 py-2">
                                                <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${statusColor(inv.status)}`}>
                                                    {inv.status ?? '—'}
                                                </span>
                                            </td>
                                            <td className="px-3 py-2 font-mono text-xs">
                                                {displayInvoiceNumber(
                                                    (inv as Invoice & {number?: string}).number ?? inv.id,
                                                )}
                                            </td>
                                            <td className="px-3 py-2 font-mono text-xs text-gray-600">
                                                {formatLinePeriod(inv.period)}
                                            </td>
                                            <td className="px-3 py-2 text-right font-mono">
                                                {inv.lines?.length ?? 0}
                                            </td>
                                            <td className="px-3 py-2 text-right font-mono">
                                                {formatMoney(total, inv.currency)}
                                            </td>
                                            <td className="px-3 py-2 text-right text-gray-400 text-xs">
                                                {isOpen ? '▾' : '▸'}
                                            </td>
                                        </tr>
                                        {isOpen && (
                                            <tr className="bg-gray-50">
                                                <td colSpan={6} className="px-3 py-3">
                                                    <table className="w-full text-xs">
                                                        <thead className="text-gray-500 uppercase tracking-wide">
                                                            <tr>
                                                                <th className="px-2 py-1 text-left">Line</th>
                                                                <th className="px-2 py-1 text-left">Period</th>
                                                                <th className="px-2 py-1 text-right">Quantity</th>
                                                                <th className="px-2 py-1 text-right">Amount</th>
                                                            </tr>
                                                        </thead>
                                                        <tbody>
                                                            {(inv.lines ?? []).map((line, i) => (
                                                                <tr key={line.id ?? i} className="border-t border-gray-200">
                                                                    <td className="px-2 py-1">{line.name ?? '—'}</td>
                                                                    <td className="px-2 py-1 font-mono">
                                                                        {formatLinePeriod(line.period)}
                                                                    </td>
                                                                    <td className="px-2 py-1 text-right font-mono">
                                                                        {line.quantity ?? '—'}
                                                                    </td>
                                                                    <td className="px-2 py-1 text-right font-mono">
                                                                        {formatMoney(
                                                                            line.totals?.total ?? line.totals?.amount,
                                                                            inv.currency,
                                                                        )}
                                                                    </td>
                                                                </tr>
                                                            ))}
                                                        </tbody>
                                                    </table>
                                                </td>
                                            </tr>
                                        )}
                                    </Fragment>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}

// ============================================================================
// TrendsView — placeholder for the chart-based view
// ============================================================================

// Color palette for chart series. Same colors stay tied to the same
// feature across renders (deterministic by index in METER_DISPLAY +
// dedicated slot for base charges, which is always last).
const METER_COLORS = [
    '#3b82f6',  // blue   — tokens_in
    '#10b981',  // green  — tokens_out
    '#f59e0b',  // amber  — time_seconds
    '#8b5cf6',  // violet — credits
    '#ec4899',  // pink   — startups
    '#ef4444',  // red    — cpu_time
    '#14b8a6',  // teal   — gpu_time
    '#f97316',  // orange — ram_time
    '#6366f1',  // indigo — storage_gb_seconds
];
const BASE_CHARGES_COLOR = '#6b7280';  // gray
const BASE_CHARGES_LABEL = 'Base charges';

export function TrendsSection() {
    const ws = useContext(WebSocketContext);
    const sendRpcRequest = ws?.sendRpcRequest;

    const [snapshot, setSnapshot] = useState<InvoiceHistorySnapshot | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const refresh = useCallback(async () => {
        if (!sendRpcRequest) return;
        setLoading(true);
        setError(null);
        try {
            const data = await adminRpc<InvoiceHistorySnapshot>(
                sendRpcRequest,
                'billing.get_invoice_history',
            );
            setSnapshot(data);
        } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
        } finally {
            setLoading(false);
        }
    }, [sendRpcRequest]);

    useEffect(() => {
        refresh();
        const t = setInterval(refresh, INVOICES_POLL_MS);
        return () => clearInterval(t);
    }, [refresh]);

    const invoices = snapshot?.invoices ?? [];

    // Build the chart data: one stacked bar per invoice, segments are
    // per-feature totals + base charges total.
    const chartData = useMemo<ChartData<'bar'> | null>(() => {
        if (invoices.length === 0) return null;

        // Sort oldest -> newest so the X-axis reads left-to-right in time.
        const sorted = [...invoices].sort((a, b) => {
            const ta = (a.period?.from ?? a.period?.start ?? '') as string;
            const tb = (b.period?.from ?? b.period?.start ?? '') as string;
            return ta.localeCompare(tb);
        });

        const labels = sorted.map(inv => {
            const start = inv.period?.from ?? inv.period?.start ?? '';
            // Render YYYY-MM (the bucket each invoice represents).
            return start ? start.slice(0, 7) : (inv.id ?? '—');
        });

        const meterKeys = new Set(METER_DISPLAY.map(d => d.slug));

        // datasets[i].data[j] = cost contribution of feature i to invoice j.
        const meterDatasets = METER_DISPLAY.map((d, idx) => ({
            label: d.label,
            data: sorted.map(inv => sumLineTotal(inv, d.slug)),
            backgroundColor: METER_COLORS[idx % METER_COLORS.length],
            stack: 'cost',
        }));

        const baseDataset = {
            label: BASE_CHARGES_LABEL,
            data: sorted.map(inv => sumBaseLines(inv, meterKeys)),
            backgroundColor: BASE_CHARGES_COLOR,
            stack: 'cost',
        };

        return {labels, datasets: [...meterDatasets, baseDataset]};
    }, [invoices]);

    const chartOptions = useMemo<ChartOptions<'bar'>>(() => ({
        responsive: true,
        maintainAspectRatio: false,
        scales: {
            x: {stacked: true, title: {display: true, text: 'Billing period'}},
            y: {
                stacked: true,
                title: {display: true, text: 'Cost'},
                ticks: {
                    callback: (val) => `$${Number(val).toFixed(2)}`,
                },
            },
        },
        plugins: {
            legend: {position: 'top' as const},
            tooltip: {
                callbacks: {
                    label: (ctx) => {
                        const v = ctx.parsed.y ?? 0;
                        return `${ctx.dataset.label}: $${v.toFixed(2)}`;
                    },
                    footer: (items) => {
                        const total = items.reduce((s, i) => s + (i.parsed.y ?? 0), 0);
                        return `Total: $${total.toFixed(2)}`;
                    },
                },
            },
        },
    }), []);

    return (
        <div className="flex flex-col h-full p-4 gap-4 overflow-auto">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-lg font-semibold">Trends</h2>
                    <p className="text-xs text-gray-500">
                        Stacked spend per billing period · sourced from finalized invoices ·
                        click legend to toggle series.
                        {snapshot?.synced_at && (
                            <> · last sync <TimeAgo ts={snapshot.synced_at}/></>
                        )}
                    </p>
                </div>
                <button
                    onClick={refresh}
                    disabled={loading}
                    className="px-3 py-1.5 rounded border bg-white hover:bg-gray-50 disabled:opacity-50 text-sm"
                >
                    {loading ? 'Loading…' : 'Refresh'}
                </button>
            </div>

            {error && (
                <div className="p-3 bg-red-50 border border-red-200 rounded text-sm text-red-700">
                    {error}
                </div>
            )}

            {!chartData && !error && (
                <EmptyState
                    title="No finalized invoices to chart yet"
                    description="The bridge syncs invoice history once daily. Once one billing period closes, its invoice will appear here."
                />
            )}

            {chartData && (
                <div className="border rounded bg-white p-4" style={{height: '400px'}}>
                    <Bar data={chartData} options={chartOptions}/>
                </div>
            )}
        </div>
    );
}

// Sum the totals of all invoice lines whose feature/rateCard key matches `slug`.
function sumLineTotal(inv: Invoice, slug: string): number {
    let s = 0;
    for (const line of inv.lines ?? []) {
        const k = line.featureKey ?? line.rateCard?.key;
        if (k !== slug) continue;
        const v = parseFloat(line.totals?.total ?? line.totals?.amount ?? '0');
        if (!Number.isNaN(v)) s += v;
    }
    return s;
}

// Sum totals of "base charge" lines — anything whose key is NOT a configured meter.
function sumBaseLines(inv: Invoice, meterKeys: Set<string>): number {
    let s = 0;
    for (const line of inv.lines ?? []) {
        const k = line.featureKey ?? line.rateCard?.key;
        if (k && meterKeys.has(k)) continue;
        const v = parseFloat(line.totals?.total ?? line.totals?.amount ?? '0');
        if (!Number.isNaN(v)) s += v;
    }
    return s;
}
