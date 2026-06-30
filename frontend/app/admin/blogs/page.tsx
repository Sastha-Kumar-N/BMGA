'use client';

import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle, BookOpenCheck, CheckCircle2, Trash2, XCircle } from 'lucide-react';
import { apiPath } from '../../lib/api-client';

type ReviewStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

type AdminBlogPost = {
  id: string;
  title: string;
  content: string;
  status: ReviewStatus;
  reviewNote?: string | null;
  createdAt: string;
  author?: {
    name?: string | null;
    email?: string | null;
  } | null;
};

export default function AdminBlogsPage() {
  const { data: session } = useSession();
  const [posts, setPosts] = useState<AdminBlogPost[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [filter, setFilter] = useState<'ALL' | ReviewStatus>('PENDING');
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [reviewNote, setReviewNote] = useState('');
  const [message, setMessage] = useState<{ type: 'idle' | 'loading' | 'success' | 'error'; text: string }>({ type: 'idle', text: '' });

  const headers = useMemo(() => ({
    'Content-Type': 'application/json',
    Authorization: `Bearer ${session?.user?.accessToken || ''}`,
  }), [session?.user?.accessToken]);

  const selectPost = useCallback((post: AdminBlogPost) => {
    setSelectedId(post.id);
    setTitle(post.title || '');
    setContent(post.content || '');
    setReviewNote(post.reviewNote || '');
  }, []);

  const load = useCallback(async () => {
    if (!session?.user?.accessToken) return;
    setMessage({ type: 'loading', text: 'Loading blog posts...' });
    try {
      const response = await fetch(apiPath('/admin/blog-posts'), { headers, cache: 'no-store' });
      const data = response.ok ? await response.json() as AdminBlogPost[] : [];
      setPosts(data);
      const first = data.find((item) => item.status === 'PENDING') || data[0];
      if (first) selectPost(first);
      setMessage({ type: 'idle', text: '' });
    } catch (error) {
      console.error('Blog review load failed', error);
      setMessage({ type: 'error', text: 'Failed to load blog posts' });
    }
  }, [headers, selectPost, session?.user?.accessToken]);

  useEffect(() => {
    void load();
  }, [load]);

  const selected = posts.find((post) => post.id === selectedId);
  const filteredPosts = filter === 'ALL' ? posts : posts.filter((post) => post.status === filter);

  const saveEdits = async () => {
    if (!selected) return;
    setMessage({ type: 'loading', text: 'Saving blog edits...' });
    try {
      const response = await fetch(apiPath(`/admin/blog-posts/${selected.id}`), {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ title, content, reviewNote }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Failed to update blog post');
      setMessage({ type: 'success', text: 'Blog post updated' });
      await load();
    } catch (error) {
      setMessage({ type: 'error', text: error instanceof Error ? error.message : 'Failed to update blog post' });
    }
  };

  const runAction = async (action: 'approve' | 'reject' | 'delete') => {
    if (!selected) return;
    setMessage({ type: 'loading', text: `${action === 'delete' ? 'Deleting' : action === 'approve' ? 'Approving' : 'Rejecting'} blog post...` });
    try {
      const response = await fetch(apiPath(`/admin/blog-posts/${selected.id}${action === 'delete' ? '' : `/${action}`}`), {
        method: action === 'delete' ? 'DELETE' : 'POST',
        headers,
        body: action === 'delete' ? undefined : JSON.stringify({ reviewNote }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || `Failed to ${action} blog post`);
      setMessage({ type: 'success', text: data.message || `Blog post ${action}d` });
      await load();
    } catch (error) {
      setMessage({ type: 'error', text: error instanceof Error ? error.message : `Failed to ${action} blog post` });
    }
  };

  return (
    <main className="min-h-screen bg-[#f6f8fb] px-5 py-8 text-[#0B1B3A] md:px-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="rounded-3xl bg-[#0B1B3A] p-7 text-white">
          <Link href="/admin/cockpit" className="text-xs font-black uppercase tracking-widest text-orange-300">Admin Cockpit</Link>
          <h1 className="mt-3 flex items-center gap-3 text-4xl font-black tracking-tight">
            <BookOpenCheck className="text-orange-400" size={34} /> Blog Approval Management
          </h1>
          <p className="mt-2 max-w-3xl text-sm font-semibold leading-6 text-slate-300">
            Only approved posts are visible on the public BMGA blog.
          </p>
        </header>

        {message.type !== 'idle' && (
          <div className={`flex items-center gap-3 rounded-2xl p-4 text-sm font-bold ${message.type === 'error' ? 'border border-red-200 bg-red-50 text-red-700' : 'border border-emerald-200 bg-emerald-50 text-emerald-700'}`}>
            {message.type === 'error' ? <AlertCircle size={20} /> : <CheckCircle2 size={20} />}
            {message.text}
          </div>
        )}

        <section className="grid gap-6 xl:grid-cols-[390px_minmax(0,1fr)]">
          <aside className="rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-100 p-4">
              <select value={filter} onChange={(event) => setFilter(event.target.value as typeof filter)} className="h-11 w-full rounded-xl border border-slate-200 px-3 text-sm font-bold outline-none focus:border-orange-500">
                <option value="ALL">All blog posts</option>
                <option value="PENDING">Pending</option>
                <option value="APPROVED">Approved</option>
                <option value="REJECTED">Rejected</option>
              </select>
            </div>
            <div className="max-h-[720px] divide-y divide-slate-100 overflow-y-auto">
              {filteredPosts.map((post) => (
                <button key={post.id} onClick={() => selectPost(post)} className={`w-full px-4 py-4 text-left transition ${selectedId === post.id ? 'bg-orange-50' : 'hover:bg-slate-50'}`}>
                  <div className="flex items-center justify-between gap-3">
                    <p className="truncate text-sm font-black">{post.title}</p>
                    <StatusBadge status={post.status} />
                  </div>
                  <p className="mt-1 text-[11px] font-semibold text-slate-400">{post.author?.email || 'Unknown author'}</p>
                </button>
              ))}
            </div>
          </aside>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm md:p-7">
            {selected ? (
              <div className="space-y-5">
                <div className="flex flex-col gap-3 border-b border-slate-100 pb-5 md:flex-row md:items-center md:justify-between">
                  <div>
                    <h2 className="text-2xl font-black tracking-tight">Review Blog Post</h2>
                    <p className="mt-1 text-sm font-bold text-slate-500">Submitted {new Date(selected.createdAt).toLocaleString()}</p>
                  </div>
                  <StatusBadge status={selected.status} />
                </div>

                <label className="block">
                  <span className="mb-2 block text-[10px] font-black uppercase tracking-widest text-slate-400">Title</span>
                  <input value={title} onChange={(event) => setTitle(event.target.value)} className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm font-bold outline-none focus:border-orange-500 focus:bg-white" />
                </label>
                <label className="block">
                  <span className="mb-2 block text-[10px] font-black uppercase tracking-widest text-slate-400">Content</span>
                  <textarea rows={15} value={content} onChange={(event) => setContent(event.target.value)} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm font-semibold leading-7 outline-none focus:border-orange-500 focus:bg-white" />
                </label>
                <label className="block">
                  <span className="mb-2 block text-[10px] font-black uppercase tracking-widest text-slate-400">Review Note</span>
                  <textarea rows={3} value={reviewNote} onChange={(event) => setReviewNote(event.target.value)} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm font-bold outline-none focus:border-orange-500 focus:bg-white" />
                </label>

                <div className="grid gap-3 md:grid-cols-4">
                  <button onClick={saveEdits} disabled={message.type === 'loading'} className="rounded-xl bg-[#0B1B3A] px-4 py-3 text-xs font-black uppercase tracking-widest text-white hover:bg-orange-500 disabled:opacity-50">
                    Save Edits
                  </button>
                  <button onClick={() => runAction('approve')} disabled={message.type === 'loading'} className="rounded-xl bg-emerald-600 px-4 py-3 text-xs font-black uppercase tracking-widest text-white hover:bg-emerald-700 disabled:opacity-50">
                    Approve
                  </button>
                  <button onClick={() => runAction('reject')} disabled={message.type === 'loading'} className="inline-flex items-center justify-center gap-2 rounded-xl bg-red-600 px-4 py-3 text-xs font-black uppercase tracking-widest text-white hover:bg-red-700 disabled:opacity-50">
                    <XCircle size={15} /> Reject
                  </button>
                  <button onClick={() => runAction('delete')} disabled={message.type === 'loading'} className="inline-flex items-center justify-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs font-black uppercase tracking-widest text-red-700 hover:bg-red-100 disabled:opacity-50">
                    <Trash2 size={15} /> Delete
                  </button>
                </div>
              </div>
            ) : (
              <div className="py-24 text-center text-sm font-bold text-slate-500">No blog post selected.</div>
            )}
          </section>
        </section>
      </div>
    </main>
  );
}

function StatusBadge({ status }: { status: ReviewStatus }) {
  const classes = {
    PENDING: 'border-amber-200 bg-amber-50 text-amber-700',
    APPROVED: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    REJECTED: 'border-red-200 bg-red-50 text-red-700',
  };
  return <span className={`rounded-full border px-2.5 py-1 text-[9px] font-black uppercase tracking-widest ${classes[status]}`}>{status}</span>;
}
