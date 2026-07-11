'use client';

import { useState } from 'react';
import { useSession } from 'next-auth/react';
import { CheckCircle2, Clock3, Download, FileText, LoaderCircle, MessageSquareText, XCircle } from 'lucide-react';
import { apiPath } from '../../lib/api-client';

export type SubmissionStatus =
  | 'PENDING'
  | 'UNDER_REVIEW'
  | 'NEEDS_CHANGES'
  | 'APPROVED'
  | 'REJECTED'
  | 'ARCHIVED'
  | string;

export type SubmissionActor = {
  name?: string | null;
  email?: string | null;
  role?: string | null;
};

export type SubmissionHistoryEntry = {
  id: string;
  status: string;
  note?: string | null;
  createdAt: string;
  visibleToSubmitter?: boolean;
  actor?: SubmissionActor | null;
};

export type SubmissionReviewerNote = {
  id: string;
  message: string;
  visibleToSubmitter?: boolean;
  createdAt: string;
  author?: SubmissionActor | null;
};

export type SubmissionFile = {
  id: string;
  kind?: string | null;
  toolName?: string | null;
  toolVersion?: string | null;
  fileName: string;
  fileType?: string | null;
  fileSizeBytes?: number | null;
  uploadedAt?: string | null;
  processingStatus?: string | null;
  checksum?: string | null;
  errorMessage?: string | null;
  ingestedAt?: string | null;
  downloadPath?: string | null;
};

export function SubmissionStatusBadge({ status }: { status: SubmissionStatus }) {
  const styles = statusStyles(status);
  const Icon = status === 'APPROVED' ? CheckCircle2 : status === 'REJECTED' ? XCircle : Clock3;

  return (
    <span className={`inline-flex items-center justify-center gap-2 rounded-full border px-3 py-1.5 text-[10px] font-black uppercase tracking-widest ${styles}`}>
      <Icon size={14} /> {labelStatus(status)}
    </span>
  );
}

export function SubmissionTimeline({ history, title = 'Status History' }: { history: SubmissionHistoryEntry[]; title?: string }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-100 px-5 py-4">
        <p className="text-[10px] font-black uppercase tracking-widest text-orange-500">Review Timeline</p>
        <h2 className="mt-1 text-xl font-black tracking-tight">{title}</h2>
      </div>
      <div className="px-5 py-5">
        {history.length ? (
          <ol className="relative space-y-5 border-l-2 border-slate-200 pl-5">
            {history.map((entry) => (
              <li key={entry.id} className="relative">
                <span className="absolute -left-[31px] top-1 flex h-5 w-5 items-center justify-center rounded-full border-4 border-white bg-orange-500" />
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <SubmissionStatusBadge status={entry.status} />
                    <span className="text-xs font-bold text-slate-500">{new Date(entry.createdAt).toLocaleString()}</span>
                  </div>
                  <p className="mt-3 text-sm font-black text-[#0B1B3A]">{entry.actor?.name || entry.actor?.email || 'System'}</p>
                  {entry.note && <p className="mt-2 whitespace-pre-line text-sm font-semibold leading-6 text-slate-600">{entry.note}</p>}
                </div>
              </li>
            ))}
          </ol>
        ) : (
          <p className="py-10 text-center text-sm font-bold text-slate-500">No status history yet.</p>
        )}
      </div>
    </section>
  );
}

export function SubmissionFilesPanel({ files, title = 'Uploaded Files', eyebrow = 'Submitted Assets', emptyMessage = 'No uploaded files are attached to this submission.' }: {
  files: SubmissionFile[];
  title?: string;
  eyebrow?: string;
  emptyMessage?: string;
}) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-100 px-5 py-4">
        <p className="text-[10px] font-black uppercase tracking-widest text-orange-500">{eyebrow}</p>
        <h2 className="mt-1 text-xl font-black tracking-tight">{title}</h2>
      </div>
      <div className="divide-y divide-slate-100">
        {files.length ? files.map((file) => (
          <div key={file.id} className="grid gap-4 px-5 py-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
            <div className="min-w-0">
              <p className="truncate text-sm font-black text-[#0B1B3A]">{file.fileName}</p>
              <p className="mt-1 text-xs font-bold text-slate-500">
                {file.kind ? `${file.kind} | ` : file.toolName ? `${file.toolName}${file.toolVersion ? ` ${file.toolVersion}` : ''} | ` : ''}{file.fileType || 'N/A'} | {formatBytes(file.fileSizeBytes)} | {file.processingStatus || 'N/A'}
              </p>
              {file.checksum && <p className="mt-1 break-all font-mono text-[11px] font-semibold text-slate-400">SHA256: {file.checksum}</p>}
              {file.errorMessage && <p className="mt-2 text-xs font-bold text-red-700">{file.errorMessage}</p>}
            </div>
            <div className="flex flex-wrap items-center gap-2 lg:justify-end">
              <span className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-slate-500">
                <FileText size={14} /> {file.uploadedAt ? new Date(file.uploadedAt).toLocaleDateString() : 'No date'}
              </span>
              {file.downloadPath && <SecureFileDownload file={file} />}
            </div>
          </div>
        )) : (
          <div className="px-5 py-14 text-center">
            <FileText className="mx-auto text-slate-300" size={38} />
            <p className="mt-3 text-sm font-bold text-slate-500">{emptyMessage}</p>
          </div>
        )}
      </div>
    </section>
  );
}

function SecureFileDownload({ file }: { file: SubmissionFile }) {
  const { data: session } = useSession();
  const [state, setState] = useState<'idle' | 'loading' | 'error'>('idle');

  const download = async () => {
    if (!file.downloadPath || !session?.user?.accessToken) return;
    setState('loading');
    try {
      const response = await fetch(apiPath(file.downloadPath), {
        headers: { Authorization: `Bearer ${session.user.accessToken}` },
      });
      if (!response.ok) throw new Error('Download failed');
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = file.fileName;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      setState('idle');
    } catch {
      setState('error');
    }
  };

  return (
    <button type="button" onClick={download} disabled={state === 'loading' || !session?.user?.accessToken} title={state === 'error' ? 'Download failed. Try again.' : `Download ${file.fileName}`} className={`inline-flex h-10 items-center gap-2 rounded-xl border px-3 text-[10px] font-black uppercase tracking-widest disabled:opacity-50 ${state === 'error' ? 'border-red-200 text-red-700' : 'border-teal-200 text-teal-700 hover:bg-teal-50'}`}>
      {state === 'loading' ? <LoaderCircle className="animate-spin" size={14} /> : <Download size={14} />} {state === 'error' ? 'Retry' : 'Download'}
    </button>
  );
}

export function ReviewerNotesPanel({ notes, showVisibility = false }: { notes: SubmissionReviewerNote[]; showVisibility?: boolean }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-100 px-5 py-4">
        <p className="text-[10px] font-black uppercase tracking-widest text-orange-500">Reviewer Feedback</p>
        <h2 className="mt-1 text-xl font-black tracking-tight">Reviewer Notes</h2>
      </div>
      <div className="divide-y divide-slate-100">
        {notes.length ? notes.map((note) => (
          <div key={note.id} className="px-5 py-4">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <p className="inline-flex items-center gap-2 text-sm font-black text-[#0B1B3A]">
                <MessageSquareText size={16} className="text-orange-500" /> {note.author?.name || note.author?.email || 'Reviewer'}
              </p>
              <span className="text-xs font-bold text-slate-500">{new Date(note.createdAt).toLocaleString()}</span>
            </div>
            <p className="mt-3 whitespace-pre-line text-sm font-semibold leading-6 text-slate-600">{note.message}</p>
            {showVisibility && (
              <span className="mt-3 inline-flex rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[9px] font-black uppercase tracking-widest text-slate-500">
                {note.visibleToSubmitter ? 'Visible to submitter' : 'Internal note'}
              </span>
            )}
          </div>
        )) : (
          <p className="px-5 py-12 text-center text-sm font-bold text-slate-500">No reviewer notes yet.</p>
        )}
      </div>
    </section>
  );
}

function statusStyles(status: SubmissionStatus) {
  const normalized = String(status).toUpperCase();
  if (normalized === 'APPROVED' || normalized === 'PUBLISHED') return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  if (normalized === 'REJECTED' || normalized === 'ARCHIVED') return 'border-red-200 bg-red-50 text-red-700';
  if (normalized === 'NEEDS_CHANGES') return 'border-orange-200 bg-orange-50 text-orange-700';
  if (normalized === 'UNDER_REVIEW') return 'border-blue-200 bg-blue-50 text-blue-700';
  return 'border-amber-200 bg-amber-50 text-amber-700';
}

function labelStatus(status: SubmissionStatus) {
  return String(status).toLowerCase().replace(/_/g, ' ');
}

function formatBytes(bytes?: number | null) {
  if (!bytes) return 'N/A';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}
