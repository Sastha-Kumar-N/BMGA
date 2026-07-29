'use client';

import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle, ChevronDown, ChevronUp, CheckCircle2, Pencil, Plus, RefreshCcw, Trash2, UsersRound } from 'lucide-react';
import { apiPath } from '../../lib/api-client';

type TeamSection = 'LEADERSHIP' | 'PLATFORM' | 'STUDENT';

type TeamMember = {
  id: string;
  section: TeamSection;
  name: string;
  title?: string | null;
  affiliation?: string | null;
  contribution?: string | null;
  email?: string | null;
  course?: string | null;
  portraitSrc?: string | null;
  displayOrder: number;
  active: boolean;
};

type FormState = {
  section: TeamSection;
  name: string;
  title: string;
  affiliation: string;
  contribution: string;
  email: string;
  course: string;
  portraitSrc: string;
  displayOrder: number;
};

const EMPTY_FORM: FormState = {
  section: 'STUDENT', name: '', title: '', affiliation: '', contribution: '', email: '', course: '', portraitSrc: '', displayOrder: 100,
};
const FIELD_CLASS = 'min-h-11 w-full border border-slate-300 bg-slate-50 px-3 py-2 text-sm font-semibold text-[#0B1B3A] outline-none transition focus:border-orange-500 focus:bg-white';

export default function AdminAboutTeamPage() {
  const { data: session } = useSession();
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const headers = useMemo(() => ({
    'Content-Type': 'application/json',
    Authorization: `Bearer ${session?.user?.accessToken || ''}`,
  }), [session?.user?.accessToken]);

  const loadMembers = useCallback(async () => {
    if (!session?.user?.accessToken) return;
    setLoading(true);
    try {
      const response = await fetch(apiPath('/admin/about/team'), { headers, cache: 'no-store' });
      const data = await response.json().catch(() => ({})) as { members?: TeamMember[]; error?: string };
      if (!response.ok) throw new Error(data.error || 'Failed to load team members');
      setMembers(data.members || []);
    } catch (error) {
      setNotice({ type: 'error', text: error instanceof Error ? error.message : 'Failed to load team members' });
    } finally {
      setLoading(false);
    }
  }, [headers, session?.user?.accessToken]);

  useEffect(() => { void loadMembers(); }, [loadMembers]);

  const activeStudents = useMemo(() => members
    .filter((member) => member.active && member.section === 'STUDENT')
    .sort((left, right) => left.displayOrder - right.displayOrder || left.name.localeCompare(right.name)), [members]);

  const update = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((current) => ({ ...current, [key]: value }));
  const reset = () => { setForm(EMPTY_FORM); setEditingId(null); setNotice(null); };

  const startEdit = (member: TeamMember) => {
    setEditingId(member.id);
    setForm({
      section: member.section, name: member.name, title: member.title || '', affiliation: member.affiliation || '', contribution: member.contribution || '', email: member.email || '', course: member.course || '', portraitSrc: member.portraitSrc || '', displayOrder: member.displayOrder,
    });
    setNotice(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setNotice(null);
    try {
      const response = await fetch(apiPath(editingId ? `/admin/about/team/${editingId}` : '/admin/about/team'), {
        method: editingId ? 'PATCH' : 'POST', headers, body: JSON.stringify(form),
      });
      const data = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(data.error || 'Failed to save team member');
      setNotice({ type: 'success', text: editingId ? 'Team member updated.' : 'Team member added.' });
      reset();
      await loadMembers();
    } catch (error) {
      setNotice({ type: 'error', text: error instanceof Error ? error.message : 'Failed to save team member' });
    } finally {
      setSaving(false);
    }
  };

  const remove = async (member: TeamMember) => {
    if (!window.confirm(`Remove ${member.name} from the public About Us page? This keeps the audit record.`)) return;
    setSaving(true);
    setNotice(null);
    try {
      const response = await fetch(apiPath(`/admin/about/team/${member.id}`), { method: 'DELETE', headers });
      const data = await response.json().catch(() => ({})) as { error?: string; message?: string };
      if (!response.ok) throw new Error(data.error || 'Failed to remove team member');
      setNotice({ type: 'success', text: data.message || 'Team member removed.' });
      if (editingId === member.id) reset();
      await loadMembers();
    } catch (error) {
      setNotice({ type: 'error', text: error instanceof Error ? error.message : 'Failed to remove team member' });
    } finally {
      setSaving(false);
    }
  };

  const moveStudent = async (member: TeamMember, direction: -1 | 1) => {
    const index = activeStudents.findIndex((student) => student.id === member.id);
    const neighbor = activeStudents[index + direction];
    if (index < 0 || !neighbor) return;
    setSaving(true);
    setNotice(null);
    try {
      const responses = await Promise.all([
        fetch(apiPath(`/admin/about/team/${member.id}`), { method: 'PATCH', headers, body: JSON.stringify({ displayOrder: neighbor.displayOrder }) }),
        fetch(apiPath(`/admin/about/team/${neighbor.id}`), { method: 'PATCH', headers, body: JSON.stringify({ displayOrder: member.displayOrder }) }),
      ]);
      if (responses.some((response) => !response.ok)) throw new Error('Failed to reorder students');
      setNotice({ type: 'success', text: 'Student order updated.' });
      await loadMembers();
    } catch (error) {
      setNotice({ type: 'error', text: error instanceof Error ? error.message : 'Failed to reorder students' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <main className="min-h-screen bg-[#f6f8fb] px-4 py-7 text-[#0B1B3A] sm:px-6 lg:px-8">
      <div className="mx-auto max-w-[1400px] space-y-6">
        <header className="border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-col gap-5 border-l-4 border-teal-600 p-6 lg:flex-row lg:items-center lg:justify-between lg:p-8">
            <div><Link href="/admin/cockpit" className="text-xs font-black uppercase tracking-widest text-orange-600">Admin Cockpit</Link><h1 className="mt-2 flex items-center gap-3 text-3xl font-black sm:text-4xl"><UsersRound className="text-teal-700" size={32} /> About Us Team</h1><p className="mt-3 max-w-3xl text-sm font-semibold leading-6 text-slate-600">Manage the leadership, platform contributors, and student cards shown on the public About Us page.</p></div>
            <button type="button" onClick={() => void loadMembers()} className="inline-flex min-h-11 items-center justify-center gap-2 border border-slate-300 bg-white px-4 text-xs font-black uppercase tracking-widest hover:border-teal-500 hover:text-teal-800"><RefreshCcw size={15} /> Refresh</button>
          </div>
        </header>

        {notice && <div className={`flex items-center gap-3 border p-4 text-sm font-bold ${notice.type === 'error' ? 'border-red-200 bg-red-50 text-red-700' : 'border-emerald-200 bg-emerald-50 text-emerald-700'}`}>{notice.type === 'error' ? <AlertCircle size={19} /> : <CheckCircle2 size={19} />}{notice.text}</div>}

        <section className="grid gap-6 xl:grid-cols-[430px_minmax(0,1fr)]">
          <form onSubmit={save} className="h-fit border border-slate-200 bg-white p-5 shadow-sm md:p-6">
            <div className="flex items-center justify-between gap-4"><h2 className="text-xl font-black">{editingId ? 'Edit team member' : 'Add team member'}</h2>{editingId && <button type="button" onClick={reset} className="text-xs font-black uppercase text-slate-500 hover:text-orange-600">Cancel edit</button>}</div>
            <div className="mt-5 grid gap-4">
              <Field label="Section"><select value={form.section} onChange={(event) => update('section', event.target.value as TeamSection)} className={FIELD_CLASS}><option value="LEADERSHIP">Scientific leadership</option><option value="PLATFORM">Platform development</option><option value="STUDENT">Student</option></select></Field>
              <Field label="Name"><input required value={form.name} onChange={(event) => update('name', event.target.value)} className={FIELD_CLASS} /></Field>
              <Field label="Title or role"><input value={form.title} onChange={(event) => update('title', event.target.value)} className={FIELD_CLASS} /></Field>
              <Field label="Affiliation"><input value={form.affiliation} onChange={(event) => update('affiliation', event.target.value)} className={FIELD_CLASS} /></Field>
              <Field label="Course (students)"><input value={form.course} onChange={(event) => update('course', event.target.value)} className={FIELD_CLASS} /></Field>
              <Field label="Email"><input type="email" value={form.email} onChange={(event) => update('email', event.target.value)} className={FIELD_CLASS} /></Field>
              <Field label="Contribution"><textarea rows={5} value={form.contribution} onChange={(event) => update('contribution', event.target.value)} className={`${FIELD_CLASS} resize-y`} /></Field>
              <Field label="Portrait path"><input placeholder="/team/member-photo.png" value={form.portraitSrc} onChange={(event) => update('portraitSrc', event.target.value)} className={FIELD_CLASS} /><p className="mt-1 text-xs font-semibold leading-5 text-slate-500">Upload the image to `frontend/public/team`, then enter the public path.</p></Field>
              <Field label="Display order"><input type="number" min="0" max="10000" value={form.displayOrder} onChange={(event) => update('displayOrder', Number(event.target.value))} className={FIELD_CLASS} /></Field>
              <button disabled={saving} className="inline-flex min-h-12 items-center justify-center gap-2 bg-[#0B1B3A] px-5 text-sm font-black text-white hover:bg-orange-500 disabled:opacity-50"><Plus size={17} /> {editingId ? 'Save changes' : 'Add member'}</button>
            </div>
          </form>

          <section className="overflow-hidden border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-200 p-5"><h2 className="text-xl font-black">Published and removed members</h2><p className="mt-1 text-sm font-semibold text-slate-500">Removed members stay in this private list for auditability.</p></div>
            <div className="divide-y divide-slate-100">
              <div className="bg-slate-50 px-5 py-3 text-xs font-semibold leading-5 text-slate-500">Use the up/down controls on student entries to control their public About Us card order.</div>
              {loading ? <p className="p-8 text-sm font-bold text-slate-500">Loading team members...</p> : members.map((member) => <article key={member.id} className={`flex flex-col gap-4 p-5 md:flex-row md:items-start md:justify-between ${member.active ? '' : 'bg-slate-50 opacity-70'}`}><div className="min-w-0"><div className="flex flex-wrap gap-2"><span className="bg-slate-100 px-2 py-1 text-[10px] font-black uppercase text-slate-600">{member.section}</span>{!member.active && <span className="bg-red-50 px-2 py-1 text-[10px] font-black uppercase text-red-700">Removed</span>}</div><h3 className="mt-3 text-lg font-black">{member.name}</h3><p className="mt-1 text-sm font-bold text-slate-600">{member.title || member.course || 'No role supplied'}</p><p className="mt-1 text-sm font-semibold text-slate-500">{member.affiliation || 'No affiliation supplied'}</p>{member.contribution && <p className="mt-3 max-w-2xl whitespace-pre-wrap text-sm font-semibold leading-6 text-slate-600">{member.contribution}</p>}</div><div className="flex shrink-0 gap-2">{member.active && <><button type="button" onClick={() => startEdit(member)} className="inline-flex h-10 w-10 items-center justify-center border border-slate-300 text-slate-700 hover:border-teal-500 hover:text-teal-800" aria-label={`Edit ${member.name}`}><Pencil size={16} /></button><button type="button" disabled={saving} onClick={() => void remove(member)} className="inline-flex h-10 w-10 items-center justify-center border border-red-200 bg-red-50 text-red-700 hover:bg-red-100 disabled:opacity-50" aria-label={`Remove ${member.name}`}><Trash2 size={16} /></button></>}</div></article>) }
              {loading ? <p className="p-8 text-sm font-bold text-slate-500">Loading team members...</p> : members.map((member) => <article key={member.id} className={`flex flex-col gap-4 p-5 md:flex-row md:items-start md:justify-between ${member.active ? '' : 'bg-slate-50 opacity-70'}`}><div className="min-w-0"><div className="flex flex-wrap gap-2"><span className="bg-slate-100 px-2 py-1 text-[10px] font-black uppercase text-slate-600">{member.section}</span>{!member.active && <span className="bg-red-50 px-2 py-1 text-[10px] font-black uppercase text-red-700">Removed</span>}</div><h3 className="mt-3 text-lg font-black">{member.name}</h3><p className="mt-1 text-sm font-bold text-slate-600">{member.title || member.course || 'No role supplied'}</p><p className="mt-1 text-sm font-semibold text-slate-500">{member.affiliation || 'No affiliation supplied'}</p>{member.contribution && <p className="mt-3 max-w-2xl whitespace-pre-wrap text-sm font-semibold leading-6 text-slate-600">{member.contribution}</p>}</div><div className="flex shrink-0 gap-2">{member.active && <>{member.section === 'STUDENT' && <><button type="button" disabled={saving || activeStudents[0]?.id === member.id} onClick={() => void moveStudent(member, -1)} className="inline-flex h-10 w-10 items-center justify-center border border-slate-300 text-slate-700 hover:border-teal-500 hover:text-teal-800 disabled:opacity-30" aria-label={`Move ${member.name} up`}><ChevronUp size={16} /></button><button type="button" disabled={saving || activeStudents[activeStudents.length - 1]?.id === member.id} onClick={() => void moveStudent(member, 1)} className="inline-flex h-10 w-10 items-center justify-center border border-slate-300 text-slate-700 hover:border-teal-500 hover:text-teal-800 disabled:opacity-30" aria-label={`Move ${member.name} down`}><ChevronDown size={16} /></button></>}<button type="button" onClick={() => startEdit(member)} className="inline-flex h-10 w-10 items-center justify-center border border-slate-300 text-slate-700 hover:border-teal-500 hover:text-teal-800" aria-label={`Edit ${member.name}`}><Pencil size={16} /></button><button type="button" disabled={saving} onClick={() => void remove(member)} className="inline-flex h-10 w-10 items-center justify-center border border-red-200 bg-red-50 text-red-700 hover:bg-red-100 disabled:opacity-50" aria-label={`Remove ${member.name}`}><Trash2 size={16} /></button></>}</div></article>) }
              {!loading && !members.length && <p className="p-8 text-sm font-bold text-slate-500">No team members yet.</p>}
            </div>
          </section>
        </section>
      </div>
    </main>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="mb-2 block text-[10px] font-black uppercase tracking-widest text-slate-500">{label}</span>{children}</label>;
}
