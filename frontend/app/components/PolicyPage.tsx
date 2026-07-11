import Link from 'next/link';
import { ArrowLeft, Home, ShieldCheck } from 'lucide-react';
import BrandLogo from './BrandLogo';

export default function PolicyPage({ eyebrow, title, summary, children }: { eyebrow: string; title: string; summary: string; children: React.ReactNode }) {
  return <main className="min-h-screen bg-[#f4f7fa] text-[#0B1B3A]"><header className="border-b border-slate-200 bg-white px-5 py-4 md:px-8"><div className="mx-auto flex max-w-5xl items-center justify-between gap-4"><BrandLogo /><Link href="/" className="inline-flex h-10 items-center gap-2 border border-slate-200 px-3 text-xs font-black uppercase text-slate-700 hover:border-orange-400 hover:text-orange-700"><Home size={15} />Home</Link></div></header><div className="mx-auto max-w-5xl px-5 py-10 md:px-8"><section className="bg-[#0B1B3A] p-7 text-white md:p-10"><p className="text-[10px] font-black uppercase text-orange-300">{eyebrow}</p><h1 className="mt-2 text-4xl font-black tracking-tight">{title}</h1><p className="mt-4 max-w-3xl text-sm font-semibold leading-7 text-slate-300">{summary}</p></section><article className="mt-6 space-y-7 border border-slate-200 bg-white p-6 shadow-sm md:p-9">{children}</article><Link href="/" className="mt-6 inline-flex items-center gap-2 text-xs font-black uppercase text-orange-700"><ArrowLeft size={15} />Return to BMGA</Link></div></main>;
}

export function PolicySection({ title, children }: { title: string; children: React.ReactNode }) { return <section><h2 className="flex items-center gap-2 text-xl font-black"><ShieldCheck className="text-orange-600" size={20} />{title}</h2><div className="mt-3 space-y-3 text-sm font-semibold leading-7 text-slate-600">{children}</div></section>; }

