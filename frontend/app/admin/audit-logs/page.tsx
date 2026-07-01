'use client';

import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle, CheckCircle2, Home, LayoutDashboard, Search, ShieldCheck } from 'lucide-react';
import { apiPath } from '../../lib/api-client';
import { AuditTimelineRow, type AuditLogRecord } from '../components/AuditTimeline';

type AuditLogResponse = {
  logs: AuditLogRecord[];
  total: number;
  limit: number;
};

const TARGET_TYPES = ['', 'OrganismUpload', 'BlogPost', 'User', 'ContactMessage', 'ToolRun', 'AnalysisRun', 'Auth'];
const EMPTY_FILTERS = { search: '', targetType: '', action: '', targetId: '' };

export default function AdminAuditLogsPage() {
  const { data: session } = useSession();
  const [logs, setLogs] = useState<AuditLogRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [targetType, setTargetType] = useState('');
  const [action, setAction] = useState('');
  const [targetId, setTargetId] = useState('');
  const [appliedFilters, setAppliedFilters] = useState(EMPTY_FILTERS);
  const [message, setMessage] = useState<{ type: 'idle' | 'loading' | 'success' | 'error'; text: string }>({ type: 'idle', text: '' });

  const headers = useMemo(() => ({
    Authorization: `Bearer ${session?.user?.accessToken || ''}`,
  }), [session?.user?.accessToken]);

  const load = useCallback(async () => {
    if (!session?.user?.accessToken) return;
    setMessage({ type: 'loading', text: 'Loading audit trail...' });
    try {
      const params = new URLSearchParams({ limit: '150' });
      if (appliedFilters.search.trim()) params.set('search', appliedFilters.search.trim());
      if (appliedFilters.targetType) params.set('targetType', appliedFilters.targetType);
      if (appliedFilters.action.trim()) params.set('action', appliedFilters.action.trim());
      if (appliedFilters.targetId.trim()) params.set('targetId', appliedFilters.targetId.trim());

      const response = await fetch(apiPath(`/admin/audit-logs?${params.toString()}`), { headers, cache: 'no-store' });
      const data = await response.json().catch(() => ({})) as Partial<AuditLogResponse> & { error?: string };
      if (!response.ok) throw new Error(data.error || 'Failed to load audit logs');
      setLogs(data.logs || []);
      setTotal(data.total || 0);
      setMessage({ type: 'idle', text: '' });
    } catch (error) {
      setMessage({ type: 'error', text: error instanceof Error ? error.message : 'Failed to load audit logs' });
    }
  }, [appliedFilters, headers, session?.user?.accessToken]);

  useEffect(() => {
    void load();
  }, [load]);

  const submitSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setAppliedFilters({ search, targetType, action, targetId });
  };

  return (
    <main className="min-h-screen bg-[#f6f8fb] px-5 py-8 text-[#0B1B3A] md:px-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="rounded-3xl bg-[#0B1B3A] p-7 text-white shadow-xl md:p-9">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <Link href="/admin/cockpit" className="text-xs font-black uppercase tracking-widest text-orange-300">Admin Cockpit</Link>
              <h1 className="mt-3 flex items-center gap-3 text-4xl font-black tracking-tight">
                <ShieldCheck className="text-orange-400" size={36} /> Admin Audit Logs
              </h1>
              <p className="mt-2 max-w-3xl text-sm font-semibold leading-6 text-slate-300">
                Review sensitive account, submission, approval, message, and ingestion activity across BMGA.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link href="/" className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/5 px-4 py-3 text-xs font-black uppercase tracking-widest text-white transition hover:border-orange-300 hover:text-orange-200">
                <Home size={15} /> Home
              </Link>
              <Link href="/dashboard" className="inline-flex items-center justify-center gap-2 rounded-xl bg-orange-500 px-4 py-3 text-xs font-black uppercase tracking-widest text-white shadow-lg shadow-orange-500/20 transition hover:bg-orange-400">
                <LayoutDashboard size={15} /> Dashboard
              </Link>
            </div>
          </div>
        </header>

        <section className="grid gap-5 md:grid-cols-3">
          <Metric label="Total Matching Events" value={message.type === 'loading' ? '...' : String(total)} />
          <Metric label="Loaded In View" value={message.type === 'loading' ? '...' : String(logs.length)} />
          <Metric label="Event Types" value={String(new Set(logs.map((log) => log.action)).size)} />
        </section>

        <form onSubmit={submitSearch} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_180px_180px_minmax(0,1fr)_auto]">
            <label className="block">
              <span className="mb-2 block text-[10px] font-black uppercase tracking-widest text-slate-400">Search</span>
              <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Action, actor, target..." className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm font-bold outline-none focus:border-orange-500 focus:bg-white" />
            </label>
            <label className="block">
              <span className="mb-2 block text-[10px] font-black uppercase tracking-widest text-slate-400">Target Type</span>
              <select value={targetType} onChange={(event) => setTargetType(event.target.value)} className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm font-bold outline-none focus:border-orange-500 focus:bg-white">
                {TARGET_TYPES.map((type) => <option key={type || 'all'} value={type}>{type || 'All targets'}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="mb-2 block text-[10px] font-black uppercase tracking-widest text-slate-400">Action</span>
              <input value={action} onChange={(event) => setAction(event.target.value.toUpperCase())} placeholder="APPROVED" className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm font-bold outline-none focus:border-orange-500 focus:bg-white" />
            </label>
            <label className="block">
              <span className="mb-2 block text-[10px] font-black uppercase tracking-widest text-slate-400">Target ID</span>
              <input value={targetId} onChange={(event) => setTargetId(event.target.value)} placeholder="UUID or numeric id" className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 font-mono text-xs font-bold outline-none focus:border-orange-500 focus:bg-white" />
            </label>
            <button type="submit" className="inline-flex h-11 items-center justify-center gap-2 self-end rounded-xl bg-[#0B1B3A] px-5 text-xs font-black uppercase tracking-widest text-white transition hover:bg-orange-500">
              <Search size={15} /> Search
            </button>
          </div>
        </form>

        {message.type !== 'idle' && (
          <div className={`flex items-center gap-3 rounded-2xl p-4 text-sm font-bold ${message.type === 'error' ? 'border border-red-200 bg-red-50 text-red-700' : 'border border-emerald-200 bg-emerald-50 text-emerald-700'}`}>
            {message.type === 'error' ? <AlertCircle size={20} /> : <CheckCircle2 size={20} />}
            {message.text}
          </div>
        )}

        <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-5 py-4">
            <h2 className="text-xl font-black tracking-tight">Recent Security Events</h2>
            <p className="mt-1 text-xs font-bold text-slate-500">Newest events appear first. Admin-only route protections still apply to every target page.</p>
          </div>
          <div className="divide-y divide-slate-100">
            {logs.length ? logs.map((log) => <AuditTimelineRow key={log.id} log={log} compact />) : (
              <p className="px-5 py-16 text-center text-sm font-bold text-slate-500">No audit events found.</p>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">{label}</p>
      <p className="mt-2 text-3xl font-black tracking-tight">{value}</p>
    </div>
  );
}
