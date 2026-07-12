'use client';

import type { FormEvent } from 'react';
import { useState } from 'react';
import { Building2, Globe2, Mail, MapPin, Send } from 'lucide-react';
import { apiPath } from '../../lib/api-client';

const EMPTY_FORM = {
  name: '',
  email: '',
  organization: '',
  subject: '',
  message: '',
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type ContactStatus = {
  type: 'idle' | 'loading' | 'success' | 'error';
  text: string;
};

export default function HomeContact() {
  const [form, setForm] = useState(EMPTY_FORM);
  const [status, setStatus] = useState<ContactStatus>({ type: 'idle', text: '' });

  const updateField = (field: keyof typeof EMPTY_FORM, value: string) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const payload = Object.fromEntries(
      Object.entries(form).map(([key, value]) => [key, value.trim()]),
    ) as typeof EMPTY_FORM;

    if (!payload.name || !payload.email || !payload.subject || !payload.message) {
      setStatus({ type: 'error', text: 'Please fill in your name, email, subject, and message.' });
      return;
    }
    if (!EMAIL_PATTERN.test(payload.email)) {
      setStatus({ type: 'error', text: 'Please enter a valid email address.' });
      return;
    }

    setStatus({ type: 'loading', text: 'Sending your message...' });
    try {
      const response = await fetch(apiPath('/contact-messages'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || 'Message submission failed.');
      setForm(EMPTY_FORM);
      setStatus({ type: 'success', text: 'Message sent securely to the BMGA administration team.' });
    } catch (error) {
      setStatus({ type: 'error', text: error instanceof Error ? error.message : 'Message submission failed.' });
    }
  };

  const fieldClass = 'min-h-12 w-full border border-white/15 bg-[#102442] px-4 text-sm font-bold text-white outline-none transition placeholder:text-slate-500 focus:border-orange-400 focus:ring-2 focus:ring-orange-400/20';

  return (
    <section id="contact" className="scroll-mt-24 bg-[#07172f] px-4 py-20 text-white sm:px-6 lg:px-8 lg:py-24">
      <div className="mx-auto grid max-w-[1320px] gap-12 lg:grid-cols-[0.72fr_1.28fr] lg:gap-20">
        <div>
          <h2 className="text-3xl font-black leading-tight sm:text-4xl">Collaborate with BMGA</h2>
          <p className="mt-5 max-w-md text-base font-semibold leading-7 text-slate-300">
            Coordinate a data contribution, research partnership, training activity, or access request with the platform team.
          </p>
          <div className="mt-9 divide-y divide-white/10 border-y border-white/10">
            <ContactPoint icon={Globe2} label="Coverage" value="India atlas and global genomic surveillance" />
            <ContactPoint icon={Building2} label="Partnerships" value="Academic, research, public health, and industry collaborations" />
            <ContactPoint icon={MapPin} label="Data onboarding" value="Reviewed metadata, MAYA outputs, FASTA, and GFF3 references" />
          </div>
        </div>

        <form onSubmit={submit} className="border border-white/12 bg-[#0b1d39] p-5 shadow-2xl shadow-black/15 sm:p-7" noValidate>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Your name" required>
              <input value={form.name} onChange={(event) => updateField('name', event.target.value)} className={fieldClass} autoComplete="name" required />
            </Field>
            <Field label="Your email" required>
              <input value={form.email} onChange={(event) => updateField('email', event.target.value)} className={fieldClass} autoComplete="email" type="email" required />
            </Field>
            <Field label="Organization">
              <input value={form.organization} onChange={(event) => updateField('organization', event.target.value)} className={fieldClass} autoComplete="organization" />
            </Field>
            <Field label="Subject" required>
              <input value={form.subject} onChange={(event) => updateField('subject', event.target.value)} className={fieldClass} required />
            </Field>
            <Field label="Your message" required className="sm:col-span-2">
              <textarea value={form.message} onChange={(event) => updateField('message', event.target.value)} className={`${fieldClass} min-h-36 resize-y py-3`} required />
            </Field>
          </div>
          <div className="mt-5 flex flex-col gap-4 sm:flex-row sm:items-center">
            <button type="submit" disabled={status.type === 'loading'} className="inline-flex min-h-12 items-center justify-center gap-2 bg-orange-500 px-6 text-sm font-black text-white transition hover:bg-orange-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-300 disabled:cursor-not-allowed disabled:opacity-60">
              <Send size={17} /> {status.type === 'loading' ? 'Sending...' : 'Send message'}
            </button>
            <p aria-live="polite" className={`text-sm font-bold ${status.type === 'error' ? 'text-red-200' : status.type === 'success' ? 'text-emerald-300' : 'text-slate-300'}`}>
              {status.text}
            </p>
          </div>
        </form>
      </div>
    </section>
  );
}

function Field({ label, required, className = '', children }: { label: string; required?: boolean; className?: string; children: React.ReactNode }) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-2 block text-xs font-black uppercase text-slate-300">
        {label}{required && <span className="ml-1 text-orange-300" aria-hidden="true">*</span>}
      </span>
      {children}
    </label>
  );
}

function ContactPoint({ icon: Icon, label, value }: { icon: typeof Mail; label: string; value: string }) {
  return (
    <div className="flex gap-4 py-5">
      <Icon className="mt-0.5 shrink-0 text-orange-300" size={20} />
      <div>
        <p className="text-[11px] font-black uppercase text-slate-500">{label}</p>
        <p className="mt-1 text-sm font-bold leading-6 text-slate-200">{value}</p>
      </div>
    </div>
  );
}
