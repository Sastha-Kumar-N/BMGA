'use client';

import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { useMemo, useState } from 'react';
import { AlertCircle, CheckCircle2, PenLine } from 'lucide-react';
import { apiPath } from '../../lib/api-client';

export default function CreateBlogPostPage() {
  const { data: session, status: sessionStatus } = useSession();
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [status, setStatus] = useState<{ type: 'idle' | 'loading' | 'success' | 'error'; message: string }>({ type: 'idle', message: '' });

  const headers = useMemo(() => ({
    'Content-Type': 'application/json',
    Authorization: `Bearer ${session?.user?.accessToken || ''}`,
  }), [session?.user?.accessToken]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setStatus({ type: 'loading', message: 'Sending post for review...' });

    try {
      const response = await fetch(apiPath('/blog-posts'), {
        method: 'POST',
        headers,
        body: JSON.stringify({ title, content }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.error || 'Failed to submit blog post');
      }
      setTitle('');
      setContent('');
      setStatus({ type: 'success', message: 'Blog post submitted. It will appear publicly only after admin approval.' });
    } catch (error) {
      setStatus({ type: 'error', message: error instanceof Error ? error.message : 'Failed to submit blog post' });
    }
  };

  if (sessionStatus === 'loading') {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#f6f8fb] text-xs font-black uppercase tracking-widest text-orange-600">
        Checking contributor access
      </main>
    );
  }

  if (!['CONTRIBUTOR', 'MODERATOR', 'ADMIN'].includes(session?.user?.role || '')) {
    return (
      <main className="min-h-screen bg-[#f6f8fb] px-5 py-8 text-[#0B1B3A] md:px-8">
        <div className="mx-auto max-w-2xl rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-xl shadow-slate-200/60">
          <PenLine className="mx-auto mb-4 text-orange-500" size={42} />
          <h1 className="text-3xl font-black tracking-tight">Contributor Access Required</h1>
          <p className="mt-3 text-sm font-semibold leading-6 text-slate-600">
            Blog submission is available to Contributor, Moderator, and Admin accounts. You can still read approved BMGA posts.
          </p>
          <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center">
            <Link href="/blog" className="rounded-xl bg-[#0B1B3A] px-5 py-3 text-xs font-black uppercase tracking-widest text-white">Open Blog</Link>
            <Link href="/account" className="rounded-xl border border-slate-200 px-5 py-3 text-xs font-black uppercase tracking-widest text-[#0B1B3A]">Account</Link>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#f6f8fb] px-5 py-8 text-[#0B1B3A] md:px-8">
      <div className="mx-auto max-w-4xl">
        <div className="mb-7">
          <Link href="/account" className="text-xs font-black uppercase tracking-widest text-orange-600">Account Dashboard</Link>
          <h1 className="mt-2 flex items-center gap-3 text-4xl font-black tracking-tight">
            <PenLine className="text-orange-500" size={34} /> Create Blog Post
          </h1>
          <p className="mt-2 max-w-2xl text-sm font-semibold leading-6 text-slate-600">
            Draft a BMGA research note, project update, or organism data commentary for review.
          </p>
        </div>

        <form onSubmit={submit} className="space-y-5 rounded-3xl border border-slate-200 bg-white p-6 shadow-xl shadow-slate-200/60 md:p-8">
          <label className="block">
            <span className="mb-2 block text-[10px] font-black uppercase tracking-widest text-slate-400">Title</span>
            <input
              required
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              className="h-12 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 text-sm font-bold outline-none transition focus:border-orange-500 focus:bg-white"
            />
          </label>
          <label className="block">
            <span className="mb-2 block text-[10px] font-black uppercase tracking-widest text-slate-400">Content</span>
            <textarea
              required
              rows={14}
              value={content}
              onChange={(event) => setContent(event.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm font-semibold leading-7 outline-none transition focus:border-orange-500 focus:bg-white"
            />
          </label>

          {status.type !== 'idle' && (
            <div className={`flex items-center gap-3 rounded-2xl p-4 text-sm font-bold ${status.type === 'error' ? 'border border-red-200 bg-red-50 text-red-700' : 'border border-emerald-200 bg-emerald-50 text-emerald-700'}`}>
              {status.type === 'error' ? <AlertCircle size={20} /> : <CheckCircle2 size={20} />}
              {status.message}
            </div>
          )}

          <button type="submit" disabled={status.type === 'loading'} className="w-full rounded-2xl bg-[#0B1B3A] py-5 text-sm font-black uppercase tracking-widest text-white shadow-xl transition hover:bg-orange-500 disabled:opacity-60">
            {status.type === 'loading' ? 'Submitting...' : 'Submit Blog for Review'}
          </button>
        </form>
      </div>
    </main>
  );
}
