'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle, BookOpenCheck, CheckCircle2, Home, LayoutDashboard, Save, XCircle } from 'lucide-react';
import { apiPath } from '../../../lib/api-client';
import { AuditTimeline, type AuditLogRecord } from '../../components/AuditTimeline';

type ReviewStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

type Person = {
  id: string;
  name?: string | null;
  email?: string | null;
  role?: string | null;
  affiliation?: string | null;
};

type BlogPost = {
  id: string;
  title: string;
  content: string;
  status: ReviewStatus;
  reviewNote?: string | null;
  createdAt: string;
  updatedAt: string;
  reviewedAt?: string | null;
  author?: Person | null;
  reviewedBy?: Person | null;
};

type BlogDetailResponse = {
  post: BlogPost;
  auditLogs: AuditLogRecord[];
};

export default function AdminBlogDetailPage() {
  const params = useParams<{ id: string }>();
  const { data: session } = useSession();
  const postId = params.id;
  const [detail, setDetail] = useState<BlogDetailResponse | null>(null);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [reviewNote, setReviewNote] = useState('');
  const [message, setMessage] = useState<{ type: 'idle' | 'loading' | 'success' | 'error'; text: string }>({ type: 'idle', text: '' });

  const headers = useMemo(() => ({
    'Content-Type': 'application/json',
    Authorization: `Bearer ${session?.user?.accessToken || ''}`,
  }), [session?.user?.accessToken]);

  const load = useCallback(async () => {
    if (!session?.user?.accessToken || !postId) return;
    setMessage({ type: 'loading', text: 'Loading blog submission detail...' });
    try {
      const response = await fetch(apiPath(`/admin/blog-posts/${postId}`), { headers, cache: 'no-store' });
      const data = await response.json().catch(() => ({})) as Partial<BlogDetailResponse> & { error?: string };
      if (!response.ok || !data.post) throw new Error(data.error || 'Failed to load blog submission');
      setDetail({ post: data.post, auditLogs: data.auditLogs || [] });
      setTitle(data.post.title || '');
      setContent(data.post.content || '');
      setReviewNote(data.post.reviewNote || '');
      setMessage({ type: 'idle', text: '' });
    } catch (error) {
      setMessage({ type: 'error', text: error instanceof Error ? error.message : 'Failed to load blog submission' });
    }
  }, [headers, postId, session?.user?.accessToken]);

  useEffect(() => {
    void load();
  }, [load]);

  const saveEdits = async () => {
    if (!detail) return;
    setMessage({ type: 'loading', text: 'Saving blog submission edits...' });
    try {
      const response = await fetch(apiPath(`/admin/blog-posts/${detail.post.id}`), {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ title, content, reviewNote }),
      });
      const data = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(data.error || 'Failed to save blog post');
      setMessage({ type: 'success', text: 'Blog post edits saved' });
      await load();
    } catch (error) {
      setMessage({ type: 'error', text: error instanceof Error ? error.message : 'Failed to save blog post' });
    }
  };

  const runAction = async (action: 'approve' | 'reject') => {
    if (!detail) return;
    setMessage({ type: 'loading', text: `${action === 'approve' ? 'Approving' : 'Rejecting'} blog post...` });
    try {
      const response = await fetch(apiPath(`/admin/blog-posts/${detail.post.id}/${action}`), {
        method: 'POST',
        headers,
        body: JSON.stringify({ reviewNote }),
      });
      const data = await response.json().catch(() => ({})) as { error?: string; message?: string };
      if (!response.ok) throw new Error(data.error || `Failed to ${action} blog post`);
      setMessage({ type: 'success', text: data.message || `Blog post ${action}d` });
      await load();
    } catch (error) {
      setMessage({ type: 'error', text: error instanceof Error ? error.message : `Failed to ${action} blog post` });
    }
  };

  const post = detail?.post;

  return (
    <main className="min-h-screen bg-[#f6f8fb] px-5 py-8 text-[#0B1B3A] md:px-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="rounded-3xl bg-[#0B1B3A] p-7 text-white shadow-xl md:p-9">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <Link href="/admin/blogs" className="text-xs font-black uppercase tracking-widest text-orange-300">Blog Approval Management</Link>
              <h1 className="mt-3 flex items-center gap-3 text-4xl font-black tracking-tight">
                <BookOpenCheck className="text-orange-400" size={36} /> Blog Submission Detail
              </h1>
              <p className="mt-2 max-w-3xl text-sm font-semibold leading-6 text-slate-300">
                Review, edit, approve, or reject submitted research notes before public publication.
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

        {message.type !== 'idle' && (
          <div className={`flex items-center gap-3 rounded-2xl p-4 text-sm font-bold ${message.type === 'error' ? 'border border-red-200 bg-red-50 text-red-700' : 'border border-emerald-200 bg-emerald-50 text-emerald-700'}`}>
            {message.type === 'error' ? <AlertCircle size={20} /> : <CheckCircle2 size={20} />}
            {message.text}
          </div>
        )}

        {post ? (
          <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
            <section className="space-y-6">
              <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <div className="border-b border-slate-100 pb-5">
                  <StatusBadge status={post.status} />
                  <h2 className="mt-3 text-3xl font-black tracking-tight">{post.title}</h2>
                  <p className="mt-2 text-sm font-bold text-slate-500">
                    By {post.author?.name || post.author?.email || 'Unknown author'} | Submitted {new Date(post.createdAt).toLocaleString()}
                  </p>
                </div>

                <div className="mt-6 grid gap-4 md:grid-cols-2">
                  <Info label="Author Email" value={post.author?.email || 'Not provided'} />
                  <Info label="Author Role" value={post.author?.role || 'Not provided'} />
                  <Info label="Reviewed By" value={post.reviewedBy?.name || post.reviewedBy?.email || 'Not reviewed'} />
                  <Info label="Reviewed" value={post.reviewedAt ? new Date(post.reviewedAt).toLocaleString() : 'Pending'} />
                  <Info label="Updated" value={new Date(post.updatedAt).toLocaleString()} />
                  <Info label="Content Length" value={`${post.content.length.toLocaleString()} characters`} />
                </div>

                <article className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-5">
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Submitted Content Preview</p>
                  <div className="mt-3 whitespace-pre-line text-sm font-semibold leading-7 text-slate-700">{post.content}</div>
                </article>
              </div>

              <AuditTimeline logs={detail.auditLogs} />
            </section>

            <aside className="space-y-6">
              <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <h2 className="text-xl font-black tracking-tight">Edit & Review</h2>
                <label className="mt-4 block">
                  <span className="mb-2 block text-[10px] font-black uppercase tracking-widest text-slate-400">Title</span>
                  <input value={title} onChange={(event) => setTitle(event.target.value)} className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm font-bold outline-none focus:border-orange-500 focus:bg-white" />
                </label>
                <label className="mt-4 block">
                  <span className="mb-2 block text-[10px] font-black uppercase tracking-widest text-slate-400">Content</span>
                  <textarea rows={12} value={content} onChange={(event) => setContent(event.target.value)} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm font-semibold leading-6 outline-none focus:border-orange-500 focus:bg-white" />
                </label>
                <label className="mt-4 block">
                  <span className="mb-2 block text-[10px] font-black uppercase tracking-widest text-slate-400">Review Note</span>
                  <textarea rows={4} value={reviewNote} onChange={(event) => setReviewNote(event.target.value)} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm font-bold outline-none focus:border-orange-500 focus:bg-white" />
                </label>

                <div className="mt-4 grid gap-3">
                  <button onClick={saveEdits} disabled={message.type === 'loading'} className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#0B1B3A] px-4 py-3 text-xs font-black uppercase tracking-widest text-white hover:bg-orange-500 disabled:opacity-50">
                    <Save size={15} /> Save Edits
                  </button>
                  <button onClick={() => runAction('approve')} disabled={message.type === 'loading'} className="rounded-xl bg-emerald-600 px-4 py-3 text-xs font-black uppercase tracking-widest text-white hover:bg-emerald-700 disabled:opacity-50">
                    Approve
                  </button>
                  <button onClick={() => runAction('reject')} disabled={message.type === 'loading'} className="inline-flex items-center justify-center gap-2 rounded-xl bg-red-600 px-4 py-3 text-xs font-black uppercase tracking-widest text-white hover:bg-red-700 disabled:opacity-50">
                    <XCircle size={15} /> Reject
                  </button>
                  <Link href="/admin/cockpit#delete-management" className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs font-black uppercase tracking-widest text-[#0B1B3A] hover:border-orange-300 hover:text-orange-600">
                    Delete Management
                  </Link>
                  <Link href={`/admin/blogs?selected=${post.id}`} className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-center text-xs font-black uppercase tracking-widest text-[#0B1B3A] hover:border-orange-300 hover:text-orange-600">
                    Open Review Queue
                  </Link>
                </div>
              </section>
            </aside>
          </div>
        ) : message.type !== 'loading' && (
          <div className="rounded-2xl border border-slate-200 bg-white px-5 py-16 text-center text-sm font-bold text-slate-500 shadow-sm">
            No blog submission found.
          </div>
        )}
      </div>
    </main>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
      <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">{label}</p>
      <p className="mt-1 break-words text-sm font-black text-[#0B1B3A]">{value}</p>
    </div>
  );
}

function StatusBadge({ status }: { status: ReviewStatus }) {
  const classes = {
    PENDING: 'border-amber-200 bg-amber-50 text-amber-700',
    APPROVED: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    REJECTED: 'border-red-200 bg-red-50 text-red-700',
  };
  return <span className={`inline-flex rounded-full border px-3 py-1.5 text-[10px] font-black uppercase tracking-widest ${classes[status]}`}>{status}</span>;
}
