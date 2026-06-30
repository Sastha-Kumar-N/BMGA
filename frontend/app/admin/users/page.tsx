'use client';

import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle, CheckCircle2, ShieldCheck, UsersRound } from 'lucide-react';
import { apiPath } from '../../lib/api-client';

type AdminUser = {
  id: string;
  email: string;
  name: string;
  affiliation: string;
  role: string;
  roleLabel?: string;
  createdAt: string;
  _count?: {
    organismUploads: number;
    blogPosts: number;
  };
};

const ROLE_OPTIONS = [
  { value: 'STUDENT', label: 'Normal User' },
  { value: 'CONTRIBUTOR', label: 'Contributor' },
  { value: 'MODERATOR', label: 'Moderator' },
  { value: 'ADMIN', label: 'Admin' },
];

const AFFILIATION_OPTIONS = [
  { value: 'RESEARCH', label: 'Research' },
  { value: 'ACADEMIC', label: 'Academic' },
  { value: 'INDUSTRY', label: 'Industry' },
];

export default function AdminUsersPage() {
  const { data: session } = useSession();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [message, setMessage] = useState<{ type: 'idle' | 'success' | 'error' | 'loading'; text: string }>({ type: 'idle', text: '' });

  const headers = useMemo(() => ({
    'Content-Type': 'application/json',
    Authorization: `Bearer ${session?.user?.accessToken || ''}`,
  }), [session?.user?.accessToken]);

  const load = useCallback(async () => {
    if (!session?.user?.accessToken) return;
    setMessage({ type: 'loading', text: 'Loading registered users...' });
    try {
      const response = await fetch(apiPath('/admin/users'), { headers, cache: 'no-store' });
      const data = response.ok ? await response.json() as AdminUser[] : [];
      setUsers(data);
      setMessage({ type: 'idle', text: '' });
    } catch (error) {
      console.error('User management load failed', error);
      setMessage({ type: 'error', text: 'Failed to load users' });
    }
  }, [headers, session?.user?.accessToken]);

  useEffect(() => {
    void load();
  }, [load]);

  const updateUser = async (user: AdminUser, changes: Partial<Pick<AdminUser, 'role' | 'affiliation' | 'name'>>) => {
    setMessage({ type: 'loading', text: 'Updating privileges...' });
    try {
      const response = await fetch(apiPath(`/admin/users/${user.id}`), {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ role: user.role, affiliation: user.affiliation, name: user.name, ...changes }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Failed to update user');
      setMessage({ type: 'success', text: 'User privileges updated' });
      await load();
    } catch (error) {
      setMessage({ type: 'error', text: error instanceof Error ? error.message : 'Failed to update user' });
    }
  };

  return (
    <main className="min-h-screen bg-[#f6f8fb] px-5 py-8 text-[#0B1B3A] md:px-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="flex flex-col gap-4 rounded-3xl bg-[#0B1B3A] p-7 text-white md:flex-row md:items-center md:justify-between">
          <div>
            <Link href="/admin/cockpit" className="text-xs font-black uppercase tracking-widest text-orange-300">Admin Cockpit</Link>
            <h1 className="mt-3 flex items-center gap-3 text-4xl font-black tracking-tight">
              <UsersRound className="text-orange-400" size={34} /> User Privileges
            </h1>
            <p className="mt-2 text-sm font-semibold text-slate-300">Assign roles and affiliations for every registered account.</p>
          </div>
          <ShieldCheck className="text-emerald-300" size={38} />
        </header>

        {message.type !== 'idle' && (
          <div className={`flex items-center gap-3 rounded-2xl p-4 text-sm font-bold ${message.type === 'error' ? 'border border-red-200 bg-red-50 text-red-700' : 'border border-emerald-200 bg-emerald-50 text-emerald-700'}`}>
            {message.type === 'error' ? <AlertCircle size={20} /> : <CheckCircle2 size={20} />}
            {message.text}
          </div>
        )}

        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-left">
              <thead className="bg-slate-50 text-[10px] font-black uppercase tracking-widest text-slate-400">
                <tr>
                  <th className="px-5 py-4">User</th>
                  <th className="px-5 py-4">Affiliation</th>
                  <th className="px-5 py-4">Role</th>
                  <th className="px-5 py-4">Submissions</th>
                  <th className="px-5 py-4">Joined</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {users.map((user) => (
                  <tr key={user.id}>
                    <td className="px-5 py-4">
                      <p className="font-black">{user.name}</p>
                      <p className="mt-1 font-mono text-xs font-bold text-slate-500">{user.email}</p>
                    </td>
                    <td className="px-5 py-4">
                      <select value={user.affiliation} onChange={(event) => updateUser(user, { affiliation: event.target.value })} className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold outline-none focus:border-orange-500">
                        {AFFILIATION_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                      </select>
                    </td>
                    <td className="px-5 py-4">
                      <select value={user.role} onChange={(event) => updateUser(user, { role: event.target.value })} className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold outline-none focus:border-orange-500">
                        {ROLE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                      </select>
                    </td>
                    <td className="px-5 py-4 text-sm font-bold text-slate-600">
                      {user._count?.organismUploads || 0} organisms | {user._count?.blogPosts || 0} posts
                    </td>
                    <td className="px-5 py-4 text-sm font-bold text-slate-500">{new Date(user.createdAt).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  );
}
