'use client';

import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  Archive,
  CheckCircle2,
  Inbox,
  Mail,
  MailOpen,
  RefreshCcw,
  Reply,
  Search,
} from 'lucide-react';
import { apiPath } from '../../lib/api-client';

type ContactMessageStatus = 'UNREAD' | 'READ';

type ContactMessage = {
  id: string;
  name: string;
  email: string;
  organization?: string | null;
  subject: string;
  message: string;
  status: ContactMessageStatus;
  adminNotes?: string | null;
  archived: boolean;
  createdAt: string;
  updatedAt: string;
};

type ContactMessagesResponse = {
  messages: ContactMessage[];
  unreadCount: number;
};

export default function AdminContactMessagesPage() {
  const { data: session } = useSession();
  const [messages, setMessages] = useState<ContactMessage[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [selected, setSelected] = useState<ContactMessage | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'ALL' | ContactMessageStatus>('ALL');
  const [adminNotes, setAdminNotes] = useState('');
  const [status, setStatus] = useState<{ type: 'idle' | 'loading' | 'success' | 'error'; text: string }>({ type: 'idle', text: '' });

  const headers = useMemo(() => ({
    'Content-Type': 'application/json',
    Authorization: `Bearer ${session?.user?.accessToken || ''}`,
  }), [session?.user?.accessToken]);

  const loadMessages = useCallback(async () => {
    if (!session?.user?.accessToken) return;
    setStatus({ type: 'loading', text: 'Loading contact messages...' });
    try {
      const response = await fetch(apiPath('/admin/contact-messages'), { headers, cache: 'no-store' });
      const data = response.ok ? await response.json() as ContactMessagesResponse : { messages: [], unreadCount: 0 };
      setMessages(data.messages);
      setUnreadCount(data.unreadCount);

      const nextSelected = selectedId
        ? data.messages.find((message) => message.id === selectedId)
        : data.messages.find((message) => message.status === 'UNREAD') || data.messages[0];
      setSelectedId(nextSelected?.id || '');
      setSelected(nextSelected || null);
      setAdminNotes(nextSelected?.adminNotes || '');
      setStatus({ type: 'idle', text: '' });
    } catch (error) {
      console.error('Contact messages load failed', error);
      setStatus({ type: 'error', text: 'Failed to load contact messages' });
    }
  }, [headers, selectedId, session?.user?.accessToken]);

  useEffect(() => {
    void loadMessages();
  }, [loadMessages]);

  const filteredMessages = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return messages.filter((message) => {
      const statusMatch = filter === 'ALL' || message.status === filter;
      if (!statusMatch) return false;
      if (!needle) return true;

      return [
        message.name,
        message.email,
        message.organization,
        message.subject,
        message.message,
      ].filter(Boolean).join(' ').toLowerCase().includes(needle);
    });
  }, [filter, messages, search]);

  const openMessage = async (message: ContactMessage) => {
    setSelectedId(message.id);
    setSelected(message);
    setAdminNotes(message.adminNotes || '');
    setStatus({ type: 'idle', text: '' });

    try {
      const response = await fetch(apiPath(`/admin/contact-messages/${message.id}`), { headers, cache: 'no-store' });
      if (!response.ok) return;
      const detail = await response.json() as ContactMessage;
      setSelected(detail);
      setAdminNotes(detail.adminNotes || '');
    } catch (error) {
      console.error('Contact message detail load failed', error);
    }
  };

  const updateSelected = async (action: 'read' | 'unread' | 'archive') => {
    if (!selected) return;
    setStatus({ type: 'loading', text: action === 'archive' ? 'Archiving message...' : 'Updating message status...' });
    try {
      const response = await fetch(apiPath(`/admin/contact-messages/${selected.id}/${action}`), {
        method: 'POST',
        headers,
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Failed to update message');
      setStatus({ type: 'success', text: data.message || 'Contact message updated' });
      if (action === 'archive') {
        setSelected(null);
        setSelectedId('');
      }
      await loadMessages();
    } catch (error) {
      setStatus({ type: 'error', text: error instanceof Error ? error.message : 'Failed to update message' });
    }
  };

  const saveNotes = async () => {
    if (!selected) return;
    setStatus({ type: 'loading', text: 'Saving admin notes...' });
    try {
      const response = await fetch(apiPath(`/admin/contact-messages/${selected.id}`), {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ adminNotes }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Failed to save admin notes');
      setSelected(data as ContactMessage);
      setStatus({ type: 'success', text: 'Admin notes saved' });
      await loadMessages();
    } catch (error) {
      setStatus({ type: 'error', text: error instanceof Error ? error.message : 'Failed to save admin notes' });
    }
  };

  return (
    <main className="min-h-screen bg-[#f6f8fb] px-5 py-8 text-[#0B1B3A] md:px-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="flex flex-col gap-4 rounded-3xl bg-[#0B1B3A] p-7 text-white md:flex-row md:items-center md:justify-between">
          <div>
            <Link href="/admin/cockpit" className="text-xs font-black uppercase tracking-widest text-orange-300">Admin Cockpit</Link>
            <h1 className="mt-3 flex items-center gap-3 text-4xl font-black tracking-tight">
              <Inbox className="text-orange-400" size={34} /> Contact Messages
              {unreadCount > 0 && (
                <span className="rounded-full bg-orange-500 px-3 py-1 text-sm font-black text-white">{unreadCount}</span>
              )}
            </h1>
            <p className="mt-2 max-w-3xl text-sm font-semibold leading-6 text-slate-300">
              Read collaboration requests submitted through the public Home page contact form.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void loadMessages()}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/15 px-4 py-3 text-xs font-black uppercase tracking-widest text-white transition hover:border-orange-300 hover:text-orange-200"
          >
            <RefreshCcw size={15} />
            Refresh
          </button>
        </header>

        {status.type !== 'idle' && (
          <div className={`flex items-center gap-3 rounded-2xl p-4 text-sm font-bold ${status.type === 'error' ? 'border border-red-200 bg-red-50 text-red-700' : status.type === 'loading' ? 'border border-orange-200 bg-orange-50 text-orange-700' : 'border border-emerald-200 bg-emerald-50 text-emerald-700'}`}>
            {status.type === 'error' ? <AlertCircle size={20} /> : <CheckCircle2 size={20} />}
            {status.text}
          </div>
        )}

        <section className="grid gap-6 xl:grid-cols-[430px_minmax(0,1fr)]">
          <aside className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="space-y-3 border-b border-slate-100 p-4">
              <label className="relative block">
                <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search name, email, subject, or message"
                  className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 pl-9 pr-3 text-sm font-bold outline-none transition focus:border-orange-500 focus:bg-white"
                />
              </label>
              <select
                value={filter}
                onChange={(event) => setFilter(event.target.value as typeof filter)}
                className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold outline-none focus:border-orange-500"
              >
                <option value="ALL">All messages</option>
                <option value="UNREAD">Unread</option>
                <option value="READ">Read</option>
              </select>
            </div>

            <div className="max-h-[760px] divide-y divide-slate-100 overflow-y-auto">
              {filteredMessages.map((message) => (
                <button
                  key={message.id}
                  onClick={() => void openMessage(message)}
                  className={`w-full px-4 py-4 text-left transition ${
                    selectedId === message.id
                      ? 'bg-orange-50'
                      : message.status === 'UNREAD'
                        ? 'bg-white hover:bg-orange-50/60'
                        : 'bg-slate-50/50 hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className={`truncate text-sm ${message.status === 'UNREAD' ? 'font-black' : 'font-bold'} text-[#0B1B3A]`}>{message.subject}</p>
                      <p className="mt-1 truncate text-xs font-bold text-slate-500">{message.name} | {message.email}</p>
                    </div>
                    <StatusBadge status={message.status} />
                  </div>
                  <p className="mt-2 line-clamp-2 text-xs font-semibold leading-5 text-slate-500">{message.message}</p>
                  <div className="mt-3 flex items-center justify-between gap-3 text-[11px] font-bold text-slate-400">
                    <span className="truncate">{message.organization || 'No organization'}</span>
                    <span>{new Date(message.createdAt).toLocaleDateString()}</span>
                  </div>
                </button>
              ))}

              {!messages.length && (
                <div className="px-4 py-16 text-center">
                  <Mail className="mx-auto mb-3 text-slate-300" size={40} />
                  <p className="text-sm font-black text-[#0B1B3A]">No contact messages yet.</p>
                </div>
              )}

              {messages.length > 0 && filteredMessages.length === 0 && (
                <div className="px-4 py-16 text-center text-sm font-bold text-slate-500">No contact messages match this filter.</div>
              )}
            </div>
          </aside>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm md:p-7">
            {selected ? (
              <div className="space-y-6">
                <div className="flex flex-col gap-4 border-b border-slate-100 pb-5 md:flex-row md:items-start md:justify-between">
                  <div>
                    <div className="mb-3 flex flex-wrap items-center gap-2">
                      <StatusBadge status={selected.status} />
                      <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-slate-500">
                        {new Date(selected.createdAt).toLocaleString()}
                      </span>
                    </div>
                    <h2 className="text-3xl font-black tracking-tight">{selected.subject}</h2>
                    <p className="mt-2 text-sm font-bold text-slate-500">
                      {selected.name} | {selected.email}
                    </p>
                    {selected.organization && (
                      <p className="mt-1 text-xs font-black uppercase tracking-widest text-orange-600">{selected.organization}</p>
                    )}
                  </div>
                  <a
                    href={`mailto:${selected.email}?subject=${encodeURIComponent(`Re: ${selected.subject}`)}`}
                    className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#0B1B3A] px-4 py-3 text-xs font-black uppercase tracking-widest text-white transition hover:bg-orange-500"
                  >
                    <Reply size={15} />
                    Reply by Email
                  </a>
                </div>

                <div>
                  <p className="mb-2 text-[10px] font-black uppercase tracking-widest text-slate-400">Full Message</p>
                  <div className="whitespace-pre-wrap rounded-2xl border border-slate-200 bg-slate-50 p-5 text-sm font-semibold leading-7 text-slate-700">
                    {selected.message}
                  </div>
                </div>

                <label className="block">
                  <span className="mb-2 block text-[10px] font-black uppercase tracking-widest text-slate-400">Admin Notes</span>
                  <textarea
                    rows={5}
                    value={adminNotes}
                    onChange={(event) => setAdminNotes(event.target.value)}
                    placeholder="Optional private notes for admin follow-up"
                    className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold leading-6 outline-none transition focus:border-orange-500 focus:bg-white"
                  />
                </label>

                <div className="grid gap-3 md:grid-cols-4">
                  <button onClick={() => void updateSelected('read')} disabled={status.type === 'loading'} className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 text-xs font-black uppercase tracking-widest text-white hover:bg-emerald-700 disabled:opacity-50">
                    <MailOpen size={15} /> Mark Read
                  </button>
                  <button onClick={() => void updateSelected('unread')} disabled={status.type === 'loading'} className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs font-black uppercase tracking-widest text-[#0B1B3A] hover:border-orange-300 hover:text-orange-600 disabled:opacity-50">
                    <Mail size={15} /> Mark Unread
                  </button>
                  <button onClick={() => void saveNotes()} disabled={status.type === 'loading'} className="rounded-xl bg-[#0B1B3A] px-4 py-3 text-xs font-black uppercase tracking-widest text-white hover:bg-orange-500 disabled:opacity-50">
                    Save Notes
                  </button>
                  <button onClick={() => void updateSelected('archive')} disabled={status.type === 'loading'} className="inline-flex items-center justify-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs font-black uppercase tracking-widest text-red-700 hover:bg-red-100 disabled:opacity-50">
                    <Archive size={15} /> Archive
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex min-h-[480px] flex-col items-center justify-center text-center">
                <Inbox className="mb-4 text-slate-300" size={52} />
                <p className="text-lg font-black text-[#0B1B3A]">No contact message selected.</p>
                <p className="mt-2 max-w-sm text-sm font-semibold text-slate-500">Select a message from the inbox to read the full details.</p>
              </div>
            )}
          </section>
        </section>
      </div>
    </main>
  );
}

function StatusBadge({ status }: { status: ContactMessageStatus }) {
  const classes = {
    UNREAD: 'border-orange-200 bg-orange-50 text-orange-700',
    READ: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  };

  return (
    <span className={`shrink-0 rounded-full border px-2.5 py-1 text-[9px] font-black uppercase tracking-widest ${classes[status]}`}>
      {status}
    </span>
  );
}
