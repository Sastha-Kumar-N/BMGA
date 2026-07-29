'use client';

import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle, CheckCircle2, Plus, Power, Trash2, Wrench } from 'lucide-react';
import { apiPath } from '../../lib/api-client';

type CatalogTool = { id: string; key: string; label: string; category: string; description: string; active: boolean };
const emptyForm = { key: '', label: '', category: 'Pipeline', description: '' };

export default function AdminToolsPage() {
  const { data: session } = useSession();
  const [tools, setTools] = useState<CatalogTool[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const headers = useMemo(() => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${session?.user?.accessToken || ''}` }), [session?.user?.accessToken]);
  const load = useCallback(async () => {
    if (!session?.user?.accessToken) return;
    const response = await fetch(apiPath('/admin/tools'), { headers, cache: 'no-store' });
    const payload = await response.json().catch(() => ({})) as { tools?: CatalogTool[]; error?: string };
    if (!response.ok) throw new Error(payload.error || 'Unable to load tool catalog');
    setTools(payload.tools || []);
  }, [headers, session?.user?.accessToken]);
  useEffect(() => { void load().catch((error: unknown) => setNotice({ type: 'error', text: error instanceof Error ? error.message : 'Unable to load tool catalog' })); }, [load]);
  const create = async (event: React.FormEvent) => {
    event.preventDefault(); setBusy(true); setNotice(null);
    try {
      const response = await fetch(apiPath('/admin/tools'), { method: 'POST', headers, body: JSON.stringify(form) });
      const payload = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(payload.error || 'Unable to add tool');
      setForm(emptyForm); setNotice({ type: 'success', text: 'Tool added and enabled for future ingestion.' }); await load();
    } catch (error) { setNotice({ type: 'error', text: error instanceof Error ? error.message : 'Unable to add tool' }); } finally { setBusy(false); }
  };
  const changeActive = async (tool: CatalogTool, active: boolean) => {
    setBusy(true); setNotice(null);
    try {
      const response = await fetch(apiPath(`/admin/tools/${tool.id}`), { method: active ? 'PATCH' : 'DELETE', headers, body: active ? JSON.stringify({ active: true }) : undefined });
      const payload = await response.json().catch(() => ({})) as { error?: string; message?: string };
      if (!response.ok) throw new Error(payload.error || 'Unable to update tool');
      setNotice({ type: 'success', text: payload.message || (active ? 'Tool enabled.' : 'Tool retired.') }); await load();
    } catch (error) { setNotice({ type: 'error', text: error instanceof Error ? error.message : 'Unable to update tool' }); } finally { setBusy(false); }
  };
  const field = 'min-h-11 w-full border border-slate-300 bg-slate-50 px-3 py-2 text-sm font-semibold outline-none focus:border-orange-500 focus:bg-white';
  const label = 'mb-2 block text-[10px] font-black uppercase tracking-widest text-slate-500';
  return <main className="min-h-screen bg-[#f6f8fb] px-4 py-7 text-[#0B1B3A] sm:px-6 lg:px-8"><div className="mx-auto max-w-[1200px] space-y-6"><header className="border border-slate-200 bg-white p-7 shadow-sm"><Link href="/admin/cockpit" className="text-xs font-black uppercase tracking-widest text-orange-600">Admin Cockpit</Link><h1 className="mt-2 flex items-center gap-3 text-3xl font-black"><Wrench className="text-teal-700" size={31} /> Tool Catalog</h1><p className="mt-3 max-w-3xl text-sm font-semibold leading-6 text-slate-600">Register additional pipeline tools for future MAYA ingestion. Retiring a tool hides it from new choices without deleting existing result data.</p></header>{notice && <div className={`flex gap-3 border p-4 text-sm font-bold ${notice.type === 'error' ? 'border-red-200 bg-red-50 text-red-700' : 'border-emerald-200 bg-emerald-50 text-emerald-700'}`}>{notice.type === 'error' ? <AlertCircle size={19} /> : <CheckCircle2 size={19} />}{notice.text}</div>}<section className="grid gap-6 lg:grid-cols-[360px_minmax(0,1fr)]"><form onSubmit={create} className="h-fit border border-slate-200 bg-white p-5 shadow-sm"><h2 className="text-xl font-black">Add tool</h2><div className="mt-5 grid gap-4"><label><span className={label}>Tool key</span><input required placeholder="my_pipeline" value={form.key} onChange={(e) => setForm({ ...form, key: e.target.value })} className={field} /></label><label><span className={label}>Display name</span><input required value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} className={field} /></label><label><span className={label}>Category</span><input required value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className={field} /></label><label><span className={label}>Description</span><textarea required rows={4} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className={`${field} resize-y`} /></label><button disabled={busy} className="inline-flex min-h-12 items-center justify-center gap-2 bg-[#0B1B3A] px-4 text-sm font-black text-white hover:bg-orange-500 disabled:opacity-50"><Plus size={17} /> Add and enable</button></div></form><section className="overflow-hidden border border-slate-200 bg-white shadow-sm"><div className="border-b border-slate-200 p-5"><h2 className="text-xl font-black">Managed tools</h2></div><div className="divide-y divide-slate-100">{tools.map((tool) => <article key={tool.id} className={`flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between ${tool.active ? '' : 'bg-slate-50 opacity-70'}`}><div><div className="flex gap-2"><span className="bg-slate-100 px-2 py-1 text-[10px] font-black uppercase text-slate-600">{tool.category}</span><span className={`px-2 py-1 text-[10px] font-black uppercase ${tool.active ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>{tool.active ? 'Enabled' : 'Retired'}</span></div><h2 className="mt-3 text-lg font-black">{tool.label}</h2><p className="font-mono text-xs font-bold text-slate-500">{tool.key}</p><p className="mt-2 text-sm font-semibold text-slate-600">{tool.description}</p></div><div className="flex gap-2">{tool.active ? <button disabled={busy} onClick={() => void changeActive(tool, false)} className="inline-flex h-10 items-center gap-2 border border-red-200 bg-red-50 px-3 text-xs font-black text-red-700 hover:bg-red-100"><Trash2 size={15} /> Retire</button> : <button disabled={busy} onClick={() => void changeActive(tool, true)} className="inline-flex h-10 items-center gap-2 border border-teal-200 bg-teal-50 px-3 text-xs font-black text-teal-800 hover:bg-teal-100"><Power size={15} /> Enable</button>}</div></article>)}{!tools.length && <p className="p-8 text-sm font-bold text-slate-500">No custom tools are configured.</p>}</div></section></section></div></main>;
}
