'use client';

import Link from 'next/link';
import { Activity, ArrowUpRight, Clock3, UserRound } from 'lucide-react';

export type AuditLogRecord = {
  id: string;
  action: string;
  targetType: string;
  targetId?: string | null;
  createdAt: string;
  metadata?: Record<string, unknown> | null;
  admin?: {
    id: string;
    name?: string | null;
    email?: string | null;
    role?: string | null;
  } | null;
};

export function AuditTimeline({ logs, title = 'Audit Timeline', empty = 'No audit events recorded yet.' }: {
  logs: AuditLogRecord[];
  title?: string;
  empty?: string;
}) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
        <div>
          <p className="text-[10px] font-black uppercase tracking-widest text-orange-500">Security Trace</p>
          <h2 className="mt-1 text-xl font-black tracking-tight">{title}</h2>
        </div>
        <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-slate-500">
          {logs.length} events
        </span>
      </div>

      <div className="divide-y divide-slate-100">
        {logs.length ? logs.map((log) => <AuditTimelineRow key={log.id} log={log} />) : (
          <p className="px-5 py-12 text-center text-sm font-bold text-slate-500">{empty}</p>
        )}
      </div>
    </section>
  );
}

export function AuditTimelineRow({ log, compact = false }: { log: AuditLogRecord; compact?: boolean }) {
  const actor = log.admin?.name || log.admin?.email || metadataText(log.metadata, 'actorEmail') || 'System event';
  const href = targetHref(log);
  const result = metadataText(log.metadata, 'result') || 'success';

  return (
    <div className={`grid gap-4 px-5 py-4 ${compact ? 'lg:grid-cols-[minmax(0,1fr)_auto]' : 'lg:grid-cols-[minmax(0,1fr)_180px]'}`}>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-orange-50 text-orange-600">
            <Activity size={18} />
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-black text-[#0B1B3A]">{humanizeAction(log.action)}</p>
            <p className="mt-0.5 flex flex-wrap items-center gap-2 text-xs font-bold text-slate-500">
              <span className="inline-flex items-center gap-1"><UserRound size={13} /> {actor}</span>
              <span>{log.targetType}</span>
              {log.targetId && <span className="font-mono text-[11px] text-slate-400">{log.targetId}</span>}
            </p>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          <span className={`rounded-full border px-2.5 py-1 text-[9px] font-black uppercase tracking-widest ${result === 'failure' ? 'border-red-200 bg-red-50 text-red-700' : 'border-emerald-200 bg-emerald-50 text-emerald-700'}`}>
            {result}
          </span>
          {metadataEntries(log.metadata).map(([key, value]) => (
            <span key={key} className="max-w-full truncate rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[9px] font-black uppercase tracking-widest text-slate-500">
              {humanizeAction(key)}: {String(value)}
            </span>
          ))}
        </div>
      </div>

      <div className="flex flex-col items-start gap-2 lg:items-end">
        <span className="inline-flex items-center gap-2 text-xs font-bold text-slate-500">
          <Clock3 size={14} /> {new Date(log.createdAt).toLocaleString()}
        </span>
        {href && (
          <Link href={href} className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-widest text-orange-600 hover:text-[#0B1B3A]">
            Open Target <ArrowUpRight size={13} />
          </Link>
        )}
      </div>
    </div>
  );
}

function targetHref(log: AuditLogRecord) {
  if (!log.targetId) return '';
  if (log.targetType === 'OrganismUpload') return `/admin/submissions/${log.targetId}`;
  if (log.targetType === 'BlogPost') return `/admin/blogs/${log.targetId}`;
  if (log.targetType === 'User') return '/admin/users';
  if (log.targetType === 'ContactMessage') return '/admin/contact-messages';
  if (log.targetType === 'ToolRun' || log.targetType === 'AnalysisRun') return '/admin';
  return '';
}

function humanizeAction(value: string) {
  return value.toLowerCase().replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function metadataText(metadata: AuditLogRecord['metadata'], key: string) {
  const value = metadata?.[key];
  return typeof value === 'string' ? value : '';
}

function metadataEntries(metadata: AuditLogRecord['metadata']) {
  if (!metadata) return [];
  const hidden = new Set(['result', 'requestId', 'ipAddress', 'userAgent', 'actorEmail', 'actorRole']);
  return Object.entries(metadata)
    .filter(([key, value]) => !hidden.has(key) && value !== undefined && value !== null && typeof value !== 'object')
    .slice(0, 5);
}
