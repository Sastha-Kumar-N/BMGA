'use client';

import { AlertTriangle, X } from 'lucide-react';

export function DeleteConfirmationModal({
  open,
  title,
  body,
  confirmationLabel,
  confirmationValue,
  typedValue,
  loading,
  onTypedValueChange,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  title: string;
  body: string;
  confirmationLabel: string;
  confirmationValue: string;
  typedValue: string;
  loading: boolean;
  onTypedValueChange: (value: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  if (!open) return null;

  const typed = typedValue.trim();
  const expected = confirmationValue.trim();
  const confirmed = typed.toUpperCase() === 'DELETE' || typed === expected || typed.toLowerCase() === expected.toLowerCase();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0B1B3A]/70 px-4 py-6 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-lg border border-red-200 bg-white p-6 text-[#0B1B3A] shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md bg-red-50 text-red-600">
              <AlertTriangle size={24} />
            </span>
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-red-500">Destructive Action</p>
              <h2 className="mt-1 text-2xl font-black tracking-tight">{title}</h2>
            </div>
          </div>
          <button type="button" onClick={onCancel} className="rounded-md border border-slate-200 p-2 text-slate-500 transition hover:border-red-200 hover:text-red-600" aria-label="Close delete confirmation">
            <X size={18} />
          </button>
        </div>

        <p className="mt-5 text-sm font-semibold leading-6 text-slate-600">{body}</p>

        <label className="mt-5 block">
          <span className="mb-2 block text-[10px] font-black uppercase tracking-widest text-slate-400">{confirmationLabel} or DELETE</span>
          <input
            value={typedValue}
            onChange={(event) => onTypedValueChange(event.target.value)}
            className="h-12 w-full rounded-md border border-slate-200 bg-slate-50 px-3 font-mono text-sm font-bold outline-none transition focus:border-red-400 focus:bg-white"
            autoFocus
          />
        </label>

        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <button type="button" onClick={onCancel} className="rounded-md border border-slate-200 bg-white px-4 py-3 text-xs font-black uppercase tracking-widest text-slate-600 transition hover:border-slate-300">
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={!confirmed || loading}
            className="rounded-md bg-red-600 px-4 py-3 text-xs font-black uppercase tracking-widest text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? 'Deleting...' : 'Delete Permanently'}
          </button>
        </div>
      </div>
    </div>
  );
}
