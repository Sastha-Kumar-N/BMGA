'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { signOut, useSession } from "next-auth/react";
import {
  Activity,
  ArrowRight,
  Database,
  Dna,
  MapPin,
  RefreshCcw,
  Search,
  ShieldAlert,
  ShieldCheck,
  LogOut,
  Microscope,
  Globe2,
  ChevronRight,
  FlaskConical
} from 'lucide-react';

// ─── DYNAMIC MAP IMPORT ───────────────────────────────────────────────────────
// We pass the strains directly to the map so it can plot the latitude/longitude
const IndiaMap = dynamic(() => import('./components/IndiaMap'), { 
  ssr: false,
  loading: () => (
    <div className="h-[600px] w-full bg-white/5 animate-pulse rounded-[40px] flex items-center justify-center text-slate-500 border border-white/10 backdrop-blur-md">
      <div className="text-center">
        <Globe2 className="animate-spin-slow mx-auto mb-4 opacity-30 text-orange-500" size={48} />
        <p className="text-xs font-black uppercase tracking-widest text-orange-400">Initializing Geospatial Matrix...</p>
      </div>
    </div>
  )
});

// ─── TYPES (Aligned with new Prisma Schema) ──────────────────────────────────

type Organism = {
  id: number;
  scientificName: string;
  domain: string;
};

type Strain = {
  id: number;
  strainName: string;
  organismId: number;
  organism: Organism;
  city: string;
  country: string;
  latitude: number;
  longitude: number;
  gcContent: number;
  genomeSize: number;
  createdAt: string;
};

// ─── PAGE COMPONENT ───────────────────────────────────────────────────────────

export default function HomePage() {
  const { data: session } = useSession();
  const router = useRouter();
  
  // State Management
  const [strains, setStrains] = useState<Strain[]>([]);
  const [summaryData, setSummaryData] = useState({ recentStrains: [], recentAmr: [] });
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');

  // 1. Initial Data Load from the new robust Backend
  useEffect(() => {
    async function initPlatform() {
      try {
        const [strainsRes, summaryRes] = await Promise.all([
          fetch('http://localhost:3001/api/strains'),
          fetch('http://localhost:3001/api/dashboard/summary')
        ]);
        
        if (strainsRes.ok) {
          const strainsData = await strainsRes.json();
          setStrains(strainsData);
        }
        
        if (summaryRes.ok) {
          const sumData = await summaryRes.json();
          setSummaryData(sumData);
        }
      } catch (err) {
        console.error("Platform initialization failed", err);
      } finally {
        setLoading(false);
      }
    }
    initPlatform();
  }, []);

  // 2. Defensive filtering for the Explorer Search
  const filteredStrains = useMemo(() => {
    if (!strains || strains.length === 0) return [];
    return strains.filter((s) => {
      const q = query.toLowerCase();
      const orgName = (s.organism?.scientificName || "Unknown").toLowerCase();
      const strainName = (s.strainName || "").toLowerCase();
      const location = (s.city || "").toLowerCase();
      return orgName.includes(q) || strainName.includes(q) || location.includes(q);
    });
  }, [strains, query]);

  // 3. Routing Guard
  const handleAnalyzeClick = () => {
    if (session) {
      router.push('/dashboard');
    } else {
      router.push('/login');
    }
  };

  return (
    <main className="min-h-screen bg-[#0B1B3A] text-white selection:bg-orange-500/30 font-sans">
      
      {/* ── NAVIGATION ────────────────────────────────────────────────────── */}
      <nav className="sticky top-0 z-50 border-b border-white/10 bg-[#0B1B3A]/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-4">
            <div className="bg-gradient-to-br from-orange-400 to-orange-600 p-2.5 rounded-xl shadow-lg shadow-orange-500/20">
              <Dna size={24} className="text-white" />
            </div>
            <div>
              <span className="block font-black text-2xl tracking-tighter leading-none italic">BMGA</span>
              <span className="text-[9px] text-slate-400 font-black uppercase tracking-widest">Bharat Microbial Genome Atlas</span>
            </div>
          </div>
          <div className="flex items-center gap-4">
            {session ? (
              <div className="flex items-center gap-4 bg-white/5 pl-6 pr-2 py-2 rounded-full border border-white/10">
                <div className="text-right">
                  <span className="block text-[9px] font-black text-orange-400 uppercase tracking-widest leading-none">Active Session</span>
                  <span className="text-sm font-bold text-white leading-none">Dr. {session.user?.name}</span>
                </div>
                <button 
                  onClick={() => signOut()} 
                  className="bg-red-500/20 text-red-400 p-2 rounded-full hover:bg-red-500 hover:text-white transition-colors"
                >
                  <LogOut size={16} />
                </button>
              </div>
            ) : (
              <Link 
                href="/login" 
                className="group flex items-center gap-3 rounded-full bg-white text-[#0B1B3A] px-8 py-3 text-sm font-black transition hover:bg-orange-500 hover:text-white shadow-lg shadow-white/10"
              >
                Researcher Login <ArrowRight size={16} className="transition-transform group-hover:translate-x-1" />
              </Link>
            )}
          </div>
        </div>
      </nav>

      {/* ── HERO & GEOSPATIAL MAP ─────────────────────────────────────────── */}
      <section className="relative overflow-hidden px-6 pt-16 pb-32">
        {/* Decorative background glow */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-orange-500/10 blur-[120px] rounded-full pointer-events-none" />

        <div className="mx-auto grid max-w-7xl gap-16 lg:grid-cols-12 items-center relative z-10">
          <div className="lg:col-span-5 space-y-10">
            <div className="inline-flex items-center gap-2 bg-white/5 border border-white/10 px-4 py-2 rounded-full text-orange-400">
              <Activity size={14} className="animate-pulse" />
              <span className="text-[10px] font-black uppercase tracking-widest">National Metagenomic Infrastructure</span>
            </div>
            
            <h1 className="text-6xl lg:text-7xl font-black leading-[0.9] tracking-tighter">
              Bharat Genome <br />
              <span className="italic text-transparent bg-clip-text bg-gradient-to-r from-orange-400 to-orange-600">Microbial</span> Atlas.
            </h1>
            
            <p className="text-lg text-slate-400 max-w-md font-medium leading-relaxed">
              An advanced geospatial intelligence platform for tracking, analyzing, and identifying clinical microbial isolates and AMR threats across India.
            </p>
            
            <div className="grid grid-cols-2 gap-6">
              <div className="bg-white/5 rounded-[24px] p-6 border border-white/10 backdrop-blur-sm">
                <Database className="text-blue-400 mb-3" size={24} />
                <div className="text-4xl font-black text-white mb-1">{strains.length}</div>
                <div className="text-[10px] font-black text-slate-400 tracking-widest uppercase">Genomes Indexed</div>
              </div>
              <div className="bg-white/5 rounded-[24px] p-6 border border-white/10 backdrop-blur-sm">
                <ShieldAlert className="text-red-400 mb-3" size={24} />
                <div className="text-4xl font-black text-white mb-1">{summaryData?.recentAmr?.length || 0}</div>
                <div className="text-[10px] font-black text-slate-400 tracking-widest uppercase">Active AMR Alerts</div>
              </div>
            </div>
          </div>
          
          <div className="lg:col-span-7">
            {/* FIXED: We pass the 'strains' state variable directly to the IndiaMap component */}
            <IndiaMap data={strains || []} />
          </div>
        </div>
      </section>

      {/* ── DATA EXPLORER ─────────────────────────────────────────────────── */}
      <section className="bg-slate-50 py-32 text-slate-900 rounded-t-[60px] relative z-20 shadow-2xl">
        <div className="mx-auto max-w-7xl px-6">
          <div className="mb-12 flex flex-col md:flex-row justify-between items-start md:items-end gap-6">
            <div>
              <h2 className="text-4xl font-black tracking-tighter text-[#0B1B3A] mb-2">Strain Registry</h2>
              <p className="text-slate-500 font-bold text-sm">Browse isolates to launch full 21-tool pipeline analytics.</p>
            </div>
            <div className="relative w-full md:w-96 group">
              <Search className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-orange-500 transition-colors" size={20} />
              <input 
                placeholder="Search by species, strain, or city..."
                className="w-full rounded-2xl border-2 border-slate-200 bg-white py-4 pl-14 pr-4 shadow-sm focus:border-orange-500 outline-none transition-all font-bold text-sm"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
          </div>

          {loading ? (
            <div className="flex flex-col items-center justify-center py-20">
               <RefreshCcw className="animate-spin text-orange-500 mb-4" size={40} />
               <p className="font-black text-xs text-slate-400 tracking-widest uppercase">Syncing Registry...</p>
            </div>
          ) : (
            <div className="overflow-hidden rounded-[40px] border border-slate-200 bg-white shadow-xl shadow-slate-200/50">
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead className="bg-slate-50/50 border-b border-slate-100">
                    <tr className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                      <th className="px-8 py-6">Organism & Strain</th>
                      <th className="px-8 py-6">Isolation Site</th>
                      <th className="px-8 py-6">GC Content</th>
                      <th className="px-8 py-6">Genome Size</th>
                      <th className="px-8 py-6 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {filteredStrains.map((strain) => (
                      <tr key={strain.id} className="group transition-colors hover:bg-orange-50">
                        <td className="px-8 py-6">
                           <div className="flex items-center gap-4">
                              <div className="w-10 h-10 rounded-full bg-blue-50 flex items-center justify-center text-blue-500 group-hover:bg-orange-100 group-hover:text-orange-500 transition-colors">
                                <FlaskConical size={18} />
                              </div>
                              <div>
                                <p className="font-black text-[#0B1B3A] italic text-base">{strain.organism?.scientificName || "Unknown Taxa"}</p>
                                <p className="text-xs font-mono font-bold text-orange-500">Strain: {strain.strainName}</p>
                              </div>
                           </div>
                        </td>
                        <td className="px-8 py-6">
                           <div className="flex items-center gap-2">
                             <MapPin size={14} className="text-slate-400" />
                             <span className="font-bold text-sm text-slate-700">{strain.city || "Unknown"}, {strain.country || "IN"}</span>
                           </div>
                        </td>
                        <td className="px-8 py-6 font-mono text-sm font-bold text-slate-600">{strain.gcContent ? `${strain.gcContent}%` : 'N/A'}</td>
                        <td className="px-8 py-6 font-mono text-sm font-bold text-slate-600">
                          {strain.genomeSize ? `${(strain.genomeSize / 1000000).toFixed(2)} Mb` : 'N/A'}
                        </td>
                        <td className="px-8 py-6 text-right">
                          <button 
                            onClick={handleAnalyzeClick}
                            className="inline-flex items-center gap-2 bg-[#0B1B3A] text-white px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider hover:bg-orange-500 transition-colors shadow-md"
                          >
                            Analyze <ChevronRight size={14} />
                          </button>
                        </td>
                      </tr>
                    ))}
                    {filteredStrains.length === 0 && (
                      <tr>
                        <td colSpan={5} className="px-8 py-20 text-center">
                           <Microscope size={48} className="mx-auto mb-4 text-slate-300" />
                           <p className="text-slate-500 font-bold">No strains found matching your search criteria.</p>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Tricolor Footer */}
      <div className="fixed bottom-0 w-full flex h-1.5 z-50">
        <div className="flex-1 bg-orange-500" />
        <div className="flex-1 bg-white" />
        <div className="flex-1 bg-[#138808]" />
      </div>
    </main>
  );
}