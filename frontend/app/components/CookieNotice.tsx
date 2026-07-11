'use client';

import Link from 'next/link';
import { Cookie, ShieldCheck, X } from 'lucide-react';
import { useEffect, useState } from 'react';

const COOKIE_NAME = 'bmga_cookie_notice';

export default function CookieNotice() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const acknowledged = document.cookie.split(';').some((entry) => entry.trim().startsWith(`${COOKIE_NAME}=`));
    const frame = window.requestAnimationFrame(() => setVisible(!acknowledged));
    return () => window.cancelAnimationFrame(frame);
  }, []);

  const acknowledge = () => {
    const secure = window.location.protocol === 'https:' ? '; Secure' : '';
    document.cookie = `${COOKIE_NAME}=essential; Max-Age=15552000; Path=/; SameSite=Lax${secure}`;
    setVisible(false);
  };

  if (!visible) return null;
  return (
    <section role="dialog" aria-modal="false" aria-labelledby="cookie-notice-title" className="fixed inset-x-4 bottom-4 z-[1000] mx-auto max-w-4xl border border-slate-300 bg-white p-5 text-[#0B1B3A] shadow-2xl md:p-6">
      <div className="flex items-start gap-4">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center bg-orange-50 text-orange-600"><Cookie size={22} /></span>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-4">
            <div><p className="text-[10px] font-black uppercase text-orange-600">Cookie & Privacy Notice</p><h2 id="cookie-notice-title" className="mt-1 text-lg font-black">Essential cookies only</h2></div>
            <button type="button" onClick={acknowledge} title="Dismiss cookie notice" aria-label="Dismiss cookie notice" className="inline-flex h-10 w-10 shrink-0 items-center justify-center border border-slate-200 text-slate-500 hover:border-orange-300 hover:text-orange-700"><X size={18} /></button>
          </div>
          <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">BMGA uses strictly necessary cookies for secure sign-in, session protection, and this notice preference. No advertising or analytics cookies are enabled by this implementation.</p>
          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
            <button type="button" onClick={acknowledge} className="inline-flex h-11 items-center justify-center gap-2 bg-[#0B1B3A] px-5 text-xs font-black uppercase text-white transition hover:bg-orange-500"><ShieldCheck size={16} /> Acknowledge</button>
            <Link href="/cookies" className="inline-flex h-11 items-center justify-center border border-slate-200 px-5 text-xs font-black uppercase text-slate-700 transition hover:border-orange-400 hover:text-orange-700">Read cookie notice</Link>
            <Link href="/privacy" className="inline-flex h-11 items-center justify-center px-4 text-xs font-black uppercase text-slate-500 hover:text-orange-700">Privacy & data use</Link>
          </div>
        </div>
      </div>
    </section>
  );
}
