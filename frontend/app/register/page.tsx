'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { signIn } from 'next-auth/react';
import { useState } from 'react';
import { AlertCircle, CheckCircle2, UserPlus } from 'lucide-react';
import { apiPath } from '../lib/api-client';
import { BRAND_FULL_NAME } from '../lib/brand';
import BrandLogo from '../components/BrandLogo';

const AFFILIATIONS = [
  { value: 'RESEARCH', label: 'Research' },
  { value: 'ACADEMIC', label: 'Academic' },
  { value: 'INDUSTRY', label: 'Industry' },
];

export default function RegisterPage() {
  const router = useRouter();
  const [form, setForm] = useState({
    name: '',
    email: '',
    password: '',
    affiliation: 'RESEARCH',
  });
  const [status, setStatus] = useState<{ type: 'idle' | 'loading' | 'success' | 'error'; message: string }>({ type: 'idle', message: '' });

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setStatus({ type: 'loading', message: 'Creating your BMGA account...' });

    try {
      const response = await fetch(apiPath('/auth/register'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.error || 'Registration failed');
      }

      setStatus({ type: 'success', message: 'Account created. Signing you in...' });
      const login = await signIn('credentials', {
        email: form.email,
        password: form.password,
        redirect: false,
      });

      router.push(login?.ok ? '/account' : '/login');
    } catch (error) {
      setStatus({ type: 'error', message: error instanceof Error ? error.message : 'Registration failed' });
    }
  };

  return (
    <main className="min-h-screen bg-[#f6f8fb] px-5 py-10 text-[#0B1B3A]">
      <div className="mx-auto grid min-h-[calc(100vh-5rem)] max-w-6xl items-center gap-10 lg:grid-cols-[0.95fr_1.05fr]">
        <section>
          <Link href="/" className="inline-flex min-w-0 items-center gap-3" aria-label={`${BRAND_FULL_NAME} home`}>
            <BrandLogo size="sm" />
          </Link>
          <h1 className="mt-8 max-w-xl text-5xl font-black leading-tight tracking-tight md:text-6xl">
            Create a verified organism data account.
          </h1>
          <p className="mt-5 max-w-2xl text-base font-semibold leading-7 text-slate-600">
            Submit organism metadata and MAYA-ready records into a protected review queue. Public release happens only after admin verification.
          </p>
          <div className="mt-8 grid gap-3 text-sm font-bold text-slate-600 sm:grid-cols-3">
            <span className="rounded-2xl border border-slate-200 bg-white p-4">Hashed passwords</span>
            <span className="rounded-2xl border border-slate-200 bg-white p-4">Unique email accounts</span>
            <span className="rounded-2xl border border-slate-200 bg-white p-4">Pending approval workflow</span>
          </div>
        </section>

        <form onSubmit={submit} className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-2xl shadow-slate-200/70 md:p-9">
          <div className="mb-7 flex items-center gap-4">
            <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-orange-500 text-white shadow-lg shadow-orange-500/25">
              <UserPlus size={26} />
            </span>
            <div>
              <h2 className="text-2xl font-black tracking-tight">Register</h2>
              <p className="text-sm font-bold text-slate-500">Normal user access is created by default.</p>
            </div>
          </div>

          <div className="space-y-5">
            <Field label="Name" value={form.name} onChange={(value) => setForm({ ...form, name: value })} autoComplete="name" required />
            <Field label="Email" type="email" value={form.email} onChange={(value) => setForm({ ...form, email: value })} autoComplete="email" required />
            <Field label="Password" type="password" value={form.password} onChange={(value) => setForm({ ...form, password: value })} autoComplete="new-password" required />
            <label className="block">
              <span className="mb-2 block text-[10px] font-black uppercase tracking-widest text-slate-400">Affiliation</span>
              <select
                value={form.affiliation}
                onChange={(event) => setForm({ ...form, affiliation: event.target.value })}
                className="h-12 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 text-sm font-bold outline-none transition focus:border-orange-500 focus:bg-white"
              >
                {AFFILIATIONS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
              </select>
            </label>
          </div>

          <p className="mt-4 text-xs font-semibold leading-5 text-slate-500">
            Passwords must be at least 10 characters and include uppercase, lowercase, number, and symbol characters.
          </p>

          {status.type !== 'idle' && (
            <div className={`mt-5 flex items-center gap-3 rounded-xl p-3 text-sm font-bold ${status.type === 'error' ? 'border border-red-200 bg-red-50 text-red-700' : 'border border-emerald-200 bg-emerald-50 text-emerald-700'}`}>
              {status.type === 'error' ? <AlertCircle size={18} /> : <CheckCircle2 size={18} />}
              {status.message}
            </div>
          )}

          <button
            type="submit"
            disabled={status.type === 'loading'}
            className="mt-7 w-full rounded-xl bg-[#0B1B3A] py-4 text-sm font-black uppercase tracking-widest text-white shadow-xl transition hover:bg-orange-500 disabled:opacity-60"
          >
            {status.type === 'loading' ? 'Creating Account...' : 'Create Account'}
          </button>

          <p className="mt-5 text-center text-sm font-semibold text-slate-500">
            Already registered? <Link href="/login" className="font-black text-orange-600">Sign in</Link>
          </p>
        </form>
      </div>
    </main>
  );
}

function Field({ label, value, onChange, type = 'text', autoComplete, required = false }: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  autoComplete?: string;
  required?: boolean;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-[10px] font-black uppercase tracking-widest text-slate-400">{label}</span>
      <input
        required={required}
        type={type}
        autoComplete={autoComplete}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-12 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 text-sm font-bold outline-none transition focus:border-orange-500 focus:bg-white"
      />
    </label>
  );
}
