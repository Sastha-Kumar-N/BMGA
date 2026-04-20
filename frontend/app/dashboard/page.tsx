'use client';

import React, { useState, useEffect } from 'react';
import { useSession, signOut } from "next-auth/react";
import { motion, AnimatePresence } from 'framer-motion';
import {
  LayoutDashboard, FlaskConical, Search, Activity,
  Database, Dna, Microscope, LogOut, RefreshCcw, 
  Box, ShieldAlert, GitBranch, Sparkles, MapPin, 
  Terminal, BarChart3, CheckCircle2, AlertTriangle,
  FileText, Cpu, Layers, Fingerprint, Filter
} from 'lucide-react';
import PlatformAnalytics from '../components/PlatformAnalytics';
// ─── HELPER COMPONENTS ────────────────────────────────────────────────────────

const StatCard = ({ title, value, icon: Icon, color }: any) => (
  <div className="bg-white p-6 rounded-[24px] border border-slate-200 shadow-sm flex items-center gap-4 hover:shadow-md transition">
    <div className={`p-4 rounded-2xl bg-${color}-500/10 text-${color}-500`}>
      <Icon size={28} />
    </div>
    <div>
      <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest">{title}</p>
      <p className="text-3xl font-black text-[#0B1B3A]">{value}</p>
    </div>
  </div>
);

const ToolCard = ({ title, icon: Icon, children }: any) => (
  <div className="bg-slate-900 rounded-[24px] p-6 text-white border border-slate-800 shadow-xl hover:border-orange-500/50 transition-all group relative overflow-hidden">
    <div className="absolute top-0 right-0 p-4 opacity-5 pointer-events-none transition-opacity group-hover:opacity-10">
      <Icon size={100} />
    </div>
    <div className="flex justify-between items-center mb-6 relative z-10">
      <div className="flex items-center gap-3">
        <div className="p-2 bg-orange-500/10 text-orange-500 rounded-lg group-hover:bg-orange-500 group-hover:text-white transition-colors">
          <Icon size={18} />
        </div>
        <span className="text-sm font-black uppercase tracking-tighter">{title}</span>
      </div>
    </div>
    <div className="space-y-3 relative z-10">{children}</div>
  </div>
);

const DataRow = ({ label, value, highlight = false, color = "text-white" }: any) => (
  <div className="flex justify-between items-center py-2 border-b border-white/5 last:border-0">
    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">{label}</span>
    <span className={`text-xs font-mono font-bold ${highlight ? 'bg-white/10 px-2 py-1 rounded' : ''} ${color}`}>
      {value !== null && value !== undefined ? value : 'N/A'}
    </span>
  </div>
);

// ─── MAIN DASHBOARD COMPONENT ──────────────────────────────────────────────────

export default function Dashboard() {
  const { data: session, status } = useSession();

  // State Management
  const [strainsList, setStrainsList] = useState([]);
  const [summaryData, setSummaryData] = useState({ recentStrains: [], recentAmr: [] });
  const [selectedStrainId, setSelectedStrainId] = useState<string>("");
  const [strainData, setStrainData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'details' | 'results'>('results');

  // Fetch Initial Data
  useEffect(() => {
    fetch('http://localhost:3001/api/strains').then(res => res.json()).then(setStrainsList).catch(console.error);
    fetch('http://localhost:3001/api/dashboard/summary').then(res => res.json()).then(setSummaryData).catch(console.error);
  }, []);

  // Deep Fetch specific strain
  useEffect(() => {
    if (!selectedStrainId) {
      setStrainData(null);
      return;
    }
    setLoading(true);
    fetch(`http://localhost:3001/api/strains/${selectedStrainId}`)
      .then(res => res.json())
      .then(data => {
        setStrainData(data);
        setLoading(false);
      })
      .catch(err => {
        console.error(err);
        setLoading(false);
      });
  }, [selectedStrainId]);

  if (status === "loading") return <div className="flex min-h-screen items-center justify-center bg-[#0B1B3A] text-orange-500 font-black italic">BGMGA NODE SYNCING...</div>;

  return (
    <div className="flex min-h-screen bg-slate-50 text-slate-900 font-sans selection:bg-orange-500/30">
      
      {/* ── SIDEBAR ── */}
      <aside className="w-64 bg-[#0B1B3A] text-white p-6 sticky top-0 h-screen hidden lg:flex flex-col border-r border-white/5">
        <div className="mb-10 flex items-center gap-3 cursor-pointer" onClick={() => setSelectedStrainId("")}>
          <div className="bg-gradient-to-br from-orange-400 to-orange-600 p-2 rounded-xl shadow-lg shadow-orange-500/20">
            <Dna size={22} className="text-white" />
          </div>
          <div>
             <span className="font-black text-xl tracking-tighter italic leading-none block">BGMGA</span>
             <span className="text-[8px] text-orange-300 font-black uppercase tracking-widest">Platform v2.0</span>
          </div>
        </div>
        <nav className="space-y-2 flex-1">
          <button onClick={() => setSelectedStrainId("")} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-bold text-sm transition-all ${!selectedStrainId ? 'bg-orange-500 shadow-lg text-white' : 'text-slate-400 hover:bg-white/5 hover:text-white'}`}>
            <LayoutDashboard size={18} /> Global Overview
          </button>
          <button className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-slate-400 hover:bg-white/5 hover:text-white transition-all font-bold text-sm">
            <Microscope size={18} /> Sequence Lab
          </button>
          <button className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-slate-400 hover:bg-white/5 hover:text-white transition-all font-bold text-sm">
            <BarChart3 size={18} /> Pangenome Atlas
          </button>
        </nav>
        <div className="mt-auto pt-6 border-t border-white/10">
          <div className="flex items-center justify-between bg-white/5 p-4 rounded-2xl border border-white/5">
            <div className="overflow-hidden">
              <p className="text-[9px] text-slate-500 font-black uppercase">Active Session</p>
              <p className="text-sm font-black truncate text-white">{session?.user?.name || "Dr. Aris"}</p>
            </div>
            <button onClick={() => signOut()} className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-500/10 rounded-xl transition-all"><LogOut size={16} /></button>
          </div>
        </div>
      </aside>

      {/* ── MAIN AREA ── */}
      <main className="flex-1 p-8 lg:p-10 overflow-y-auto">
        <div className="max-w-7xl mx-auto space-y-10">
          
          {/* Header & Search */}
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
            <div>
              <h1 className="text-4xl lg:text-5xl font-black tracking-tighter text-[#0B1B3A]">
                {selectedStrainId ? "Genome Workspace" : "Bio-Analytics Hub"}
              </h1>
              <p className="text-slate-500 font-bold text-sm mt-1">Sivasakthi Science Foundation • AI Gen-Labs</p>
            </div>
            
            <div className="relative w-full md:w-96 group">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-orange-500 transition-colors" size={20} />
              <select 
                className="w-full pl-12 pr-10 py-4 bg-white border-2 border-slate-200 rounded-2xl shadow-xl shadow-slate-200/50 focus:border-orange-500 outline-none transition-all cursor-pointer appearance-none text-sm font-black text-[#0B1B3A]"
                value={selectedStrainId}
                onChange={(e) => setSelectedStrainId(e.target.value)}
              >
                <option value="">Search Genomics Database...</option>
                {strainsList?.map((s: any) => (
                  <option key={s.id} value={s.id}>{s.strainName} — {s.organism?.scientificName}</option>
                ))}
              </select>
            </div>
          </div>

          <AnimatePresence mode="wait">
            {!selectedStrainId ? (
              
              /* ── VIEW 1: WELCOME DASHBOARD ── */
              <motion.div key="overview" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} className="space-y-8">
                
                {/* Stats Row */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <StatCard title="Total Genomes Indexed" value={strainsList?.length || 0} icon={Database} color="blue" />
                  <StatCard title="Recent AMR Alerts" value={summaryData?.recentAmr?.length || 0} icon={ShieldAlert} color="red" />
                  <StatCard title="Pipeline Status" value="Active" icon={Activity} color="emerald" />
                </div>

                <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
                  {/* Table: Recent Submissions */}
                  <div className="bg-white p-8 rounded-[32px] border border-slate-200 shadow-sm hover:shadow-lg transition-shadow">
                    <h3 className="text-xl font-black text-[#0B1B3A] mb-6 flex items-center gap-3 tracking-tighter">
                      <RefreshCcw size={22} className="text-orange-500" /> Recent Ingestions
                    </h3>
                    <div className="overflow-x-auto">
                      <table className="w-full text-left">
                        <thead>
                          <tr className="text-[10px] font-black text-slate-400 uppercase border-b border-slate-100">
                            <th className="pb-4">Organism</th>
                            <th className="pb-4">Strain</th>
                            <th className="pb-4">Location</th>
                          </tr>
                        </thead>
                        <tbody className="text-sm font-bold text-slate-700">
                          {summaryData?.recentStrains?.map((s: any) => (
                            <tr key={s.id} className="border-b border-slate-50 hover:bg-slate-50 transition cursor-pointer" onClick={() => setSelectedStrainId(s.id.toString())}>
                              <td className="py-4 italic text-[#0B1B3A]">{s.organism?.scientificName}</td>
                              <td className="py-4 font-mono text-orange-500">{s.strainName}</td>
                              <td className="py-4 text-xs">{s.city || 'Unknown'}</td>
                            </tr>
                          ))}
                          {summaryData?.recentStrains?.length === 0 && (
                            <tr><td colSpan={3} className="py-8 text-center text-slate-400 text-xs font-bold">No strains found in database.</td></tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Table: AMR Highlights */}
                  <div className="bg-white p-8 rounded-[32px] border border-slate-200 shadow-sm hover:shadow-lg transition-shadow">
                    <h3 className="text-xl font-black text-[#0B1B3A] mb-6 flex items-center gap-3 tracking-tighter">
                      <ShieldAlert size={22} className="text-red-500" /> Critical AMR Alerts
                    </h3>
                    <div className="space-y-4">
                      {summaryData?.recentAmr?.map((gene: any) => (
                        <div key={gene.id} className="flex justify-between items-center p-5 bg-red-50 rounded-[20px] border border-red-100 group hover:scale-[1.02] transition-transform shadow-sm">
                          <div className="flex items-center gap-4">
                             <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-red-500 to-red-600 flex items-center justify-center text-white font-black shadow-inner shadow-white/20">
                               <AlertTriangle size={20} />
                             </div>
                             <div>
                                <p className="font-black text-red-800 text-lg leading-none mb-1">{gene.geneSymbol}</p>
                                <p className="text-[10px] font-black text-red-500 uppercase tracking-wider">{gene.drugClass || 'Unknown Class'}</p>
                             </div>
                          </div>
                          <div className="text-right cursor-pointer" onClick={() => setSelectedStrainId(gene.strainId.toString())}>
                             <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Found In</p>
                             <p className="text-sm font-mono font-bold text-[#0B1B3A] bg-white px-3 py-1 rounded-lg border border-red-100">{gene.strain?.strainName}</p>
                          </div>
                        </div>
                      ))}
                      {summaryData?.recentAmr?.length === 0 && (
                        <div className="p-10 text-center text-emerald-500 border-2 border-dashed border-emerald-100 rounded-3xl bg-emerald-50">
                          <CheckCircle2 size={32} className="mx-auto mb-3 opacity-50" />
                          <p className="font-bold text-sm">No critical AMR genes detected recently.</p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
                <PlatformAnalytics strains={strainsList} />
              </motion.div>

            ) : (

              /* ── VIEW 2: DEEP ANALYSIS (THE 20+ TOOLS) ── */
              <motion.div key="analysis" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="grid grid-cols-1 xl:grid-cols-12 gap-8">
                
                {/* Left Panel: Strain Identity (Sticky) */}
                <div className="xl:col-span-4 sticky top-10 h-fit">
                  {loading ? (
                    <div className="h-[500px] bg-slate-200 animate-pulse rounded-[40px]" />
                  ) : strainData && (
                    <div className="bg-[#0B1B3A] text-white p-10 rounded-[40px] shadow-2xl relative overflow-hidden border border-white/10">
                      <div className="absolute -top-10 -right-10 opacity-5 rotate-12"><Dna size={250} /></div>
                      
                      <div className="relative z-10">
                        <div className="inline-flex items-center gap-2 bg-orange-500/20 text-orange-400 px-3 py-1.5 rounded-full mb-6 border border-orange-500/20">
                          <Fingerprint size={12} />
                          <span className="text-[9px] font-black uppercase tracking-widest">Active Profile</span>
                        </div>
                        
                        <h2 className="text-5xl font-black italic tracking-tighter mb-2 leading-none text-transparent bg-clip-text bg-gradient-to-r from-white to-slate-400">
                          {strainData.strainName}
                        </h2>
                        <p className="text-slate-300 text-sm font-bold border-b border-white/10 pb-8 mb-8">{strainData.organism?.scientificName}</p>
                        
                        <div className="space-y-6">
                           <div className="flex items-center gap-4 bg-white/5 p-4 rounded-2xl">
                              <MapPin className="text-blue-400" size={20} />
                              <div><p className="text-[9px] text-slate-400 font-black uppercase tracking-widest mb-1">Isolation Source</p><p className="font-bold text-sm">{strainData.city || 'Unknown'}, {strainData.country || 'Unknown'}</p></div>
                           </div>
                           <div className="flex items-center gap-4 bg-white/5 p-4 rounded-2xl">
                              <Activity className="text-orange-400" size={20} />
                              <div><p className="text-[9px] text-slate-400 font-black uppercase tracking-widest mb-1">Genomic GC Content</p><p className="font-black text-lg text-orange-400">{strainData.gcContent}%</p></div>
                           </div>
                           <div className="flex items-center gap-4 bg-white/5 p-4 rounded-2xl">
                              <Database className="text-emerald-400" size={20} />
                              <div><p className="text-[9px] text-slate-400 font-black uppercase tracking-widest mb-1">NCBI Taxonomy</p><p className="font-mono text-sm text-emerald-400">TXID_{strainData.organism?.taxonomyId || "N/A"}</p></div>
                           </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Right Panel: Tool Results Workspace */}
                <div className="xl:col-span-8">
                  <div className="bg-white rounded-[40px] border border-slate-200 overflow-hidden shadow-xl shadow-slate-200/50 min-h-[600px]">
                    
                    {/* Tabs */}
                    <div className="flex border-b border-slate-100">
                      <button onClick={() => setActiveTab('results')} className={`flex-1 py-6 text-xs font-black tracking-widest transition-all ${activeTab === 'results' ? 'bg-orange-50 text-orange-600 border-b-2 border-orange-500' : 'text-slate-400 hover:bg-slate-50'}`}>
                        <span className="flex items-center justify-center gap-2"><Cpu size={16} /> PIPELINE ANALYTICS</span>
                      </button>
                      <button onClick={() => setActiveTab('details')} className={`flex-1 py-6 text-xs font-black tracking-widest transition-all ${activeTab === 'details' ? 'bg-orange-50 text-orange-600 border-b-2 border-orange-500' : 'text-slate-400 hover:bg-slate-50'}`}>
                         <span className="flex items-center justify-center gap-2"><Layers size={16} /> TAXONOMY METADATA</span>
                      </button>
                    </div>

                    <div className="p-8 lg:p-10 bg-slate-50/50 h-full">
                      {loading ? (
                         <div className="flex flex-col items-center justify-center py-32"><RefreshCcw className="animate-spin text-orange-500 mb-6" size={40} /><p className="font-black text-xs text-slate-400 tracking-widest uppercase">Querying Relational Tables...</p></div>
                      ) : activeTab === 'results' && strainData?.analysisRuns?.length > 0 ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                          
                          {/* ── THE 20 TOOLS GRID RENDERING ── */}
                          {strainData.analysisRuns.map((run: any) => (
                            <React.Fragment key={run.id}>
                              
                              {/* 1. FastQC */}
                              {run.fastqc && (
                                <ToolCard title="FastQC" icon={Activity}>
                                  <DataRow label="Total Reads" value={run.fastqc.totalReads?.toLocaleString()} color="text-blue-400" />
                                  <DataRow label="GC Content" value={`${run.fastqc.gcContent}%`} />
                                  <DataRow label="Q30 Rate" value={`${run.fastqc.q30Rate}%`} color="text-emerald-400" />
                                  <DataRow label="Duplication" value={`${run.fastqc.duplicationRate}%`} />
                                  <DataRow label="Adapter Content" value={run.fastqc.adapterContentStatus} highlight color="text-emerald-400" />
                                </ToolCard>
                              )}

                              {/* 2. Fastp */}
                              {run.fastp && (
                                <ToolCard title="Fastp" icon={Filter}>
                                  <DataRow label="Reads Before" value={run.fastp.readsBeforeFiltering?.toLocaleString()} />
                                  <DataRow label="Reads After" value={run.fastp.readsAfterFiltering?.toLocaleString()} color="text-emerald-400" />
                                  <DataRow label="Q30 Rate" value={`${run.fastp.q30Rate}%`} />
                                  <DataRow label="Duplication" value={`${run.fastp.duplicationRate}%`} />
                                </ToolCard>
                              )}

                              {/* 3. MultiQC */}
                              {run.multiqc && (
                                <ToolCard title="MultiQC" icon={Layers}>
                                  <DataRow label="Samples" value={run.multiqc.samplesAnalysed} />
                                  <DataRow label="Avg Length" value={`${run.multiqc.avgSequenceLengthBp} bp`} />
                                  <DataRow label="Dups R1" value={`${run.multiqc.duplicatesR1}%`} />
                                  <DataRow label="Failed Modules" value={run.multiqc.failedModules} color={run.multiqc.failedModules > 0 ? "text-red-400" : "text-emerald-400"} />
                                </ToolCard>
                              )}

                              {/* 4. SPAdes */}
                              {run.spades && (
                                <ToolCard title="SPAdes Assembly" icon={Box}>
                                  <DataRow label="Contigs" value={run.spades.totalContigs} />
                                  <DataRow label="Largest Contig" value={`${run.spades.largestContigKb} kb`} />
                                  <DataRow label="N50" value={`${run.spades.n50Kb} kb`} color="text-blue-400" />
                                  <DataRow label="Total Length" value={`${run.spades.totalLengthMb} Mb`} />
                                  <DataRow label="Coverage" value={`${run.spades.coverageX}x`} highlight color="text-orange-400" />
                                </ToolCard>
                              )}

                              {/* 5. QUAST */}
                              {run.quast && (
                                <ToolCard title="QUAST Validation" icon={CheckCircle2}>
                                  <DataRow label="N50" value={`${run.quast.n50Kb} kb`} />
                                  <DataRow label="L50" value={run.quast.l50} />
                                  <DataRow label="Genome Fraction" value={`${run.quast.genomeFraction}%`} color="text-emerald-400" />
                                  <DataRow label="Mismatches /100kb" value={run.quast.mismatchesPer100Kb} />
                                </ToolCard>
                              )}

                              {/* 6. BUSCO */}
                              {run.busco && (
                                <ToolCard title="BUSCO" icon={Target}>
                                  <DataRow label="Complete" value={`${run.busco.completePercent}%`} color="text-emerald-400" highlight />
                                  <DataRow label="Single Copy" value={`${run.busco.singleCopyPercent}%`} />
                                  <DataRow label="Fragmented" value={`${run.busco.fragmentedPercent}%`} color="text-red-400" />
                                  <DataRow label="Lineage" value={run.busco.lineage} />
                                </ToolCard>
                              )}

                              {/* 7. CheckM */}
                              {run.checkm && (
                                <ToolCard title="CheckM" icon={CheckCircle2}>
                                  <DataRow label="Completeness" value={`${run.checkm.completeness}%`} color="text-emerald-400" />
                                  <DataRow label="Contamination" value={`${run.checkm.contamination}%`} color="text-red-400" />
                                  <DataRow label="Marker Genes" value={run.checkm.markerGenes} />
                                  <DataRow label="Lineage" value={run.checkm.lineage} />
                                </ToolCard>
                              )}

                              {/* 8. Prokka */}
                              {run.prokka && (
                                <ToolCard title="Prokka Annotation" icon={Terminal}>
                                  <DataRow label="CDS" value={run.prokka.cdsCount?.toLocaleString()} color="text-emerald-400" highlight />
                                  <DataRow label="rRNA Genes" value={run.prokka.rrnaGenes} />
                                  <DataRow label="tRNA Genes" value={run.prokka.trnaGenes} />
                                  <DataRow label="Coding Density" value={`${run.prokka.codingDensity}%`} />
                                </ToolCard>
                              )}

                              {/* 9. DIAMOND */}
                              {run.diamond && (
                                <ToolCard title="DIAMOND" icon={Search}>
                                  <DataRow label="Queries Aligned" value={run.diamond.queriesAligned?.toLocaleString()} />
                                  <DataRow label="Aligned %" value={`${run.diamond.percentAligned}%`} color="text-blue-400" />
                                  <DataRow label="Database" value={run.diamond.databaseName} />
                                  <DataRow label="Avg Identity" value={`${run.diamond.avgIdentity}%`} />
                                </ToolCard>
                              )}

                              {/* 10. KofamKOALA */}
                              {run.kofamkoala && (
                                <ToolCard title="KofamKOALA" icon={Network}>
                                  <DataRow label="Genes Annotated" value={run.kofamkoala.genesAnnotated?.toLocaleString()} />
                                  <DataRow label="KEGG Pathways" value={run.kofamkoala.keggPathways} color="text-purple-400" />
                                  <DataRow label="KO Coverage" value={`${run.kofamkoala.koCoverage}%`} />
                                  <DataRow label="Top Pathway" value={run.kofamkoala.topPathway} />
                                </ToolCard>
                              )}

                              {/* 11. ABRicate */}
                              {run.abricate && (
                                <ToolCard title="ABRicate (AMR)" icon={ShieldAlert}>
                                  <DataRow label="Genes Found" value={run.abricate.genesFound} highlight color="text-red-400" />
                                  <DataRow label="Top Hit" value={run.abricate.topHit} color="text-orange-400" />
                                  <DataRow label="Min Coverage" value={`${run.abricate.minCoverage}%`} />
                                  <DataRow label="Min Identity" value={`${run.abricate.minIdentity}%`} />
                                </ToolCard>
                              )}

                              {/* 12. MLST */}
                              {run.mlst && (
                                <ToolCard title="MLST Typing" icon={GitBranch}>
                                  <DataRow label="ST Type" value={run.mlst.sequenceType} highlight color="text-orange-400" />
                                  <DataRow label="Scheme" value={run.mlst.scheme} />
                                  <DataRow label="Alleles Matched" value={run.mlst.allelesMatched} />
                                  <DataRow label="Confidence" value={`${run.mlst.confidence}%`} color="text-emerald-400" />
                                </ToolCard>
                              )}

                              {/* 13. IslandPath */}
                              {run.islandPath && (
                                <ToolCard title="IslandPath" icon={MapPin}>
                                  <DataRow label="GIs Detected" value={run.islandPath.gisDetected} />
                                  <DataRow label="Total Length" value={`${run.islandPath.totalGiLengthKb} kb`} />
                                  <DataRow label="AMR Island" value={run.islandPath.amrIsland ? "YES" : "NO"} color={run.islandPath.amrIsland ? "text-red-400" : "text-slate-400"} />
                                  <DataRow label="AMR Gene" value={run.islandPath.amrGene} />
                                </ToolCard>
                              )}

                              {/* 14. tRNAscan-SE */}
                              {run.trnascan && (
                                <ToolCard title="tRNAscan-SE" icon={Dna}>
                                  <DataRow label="tRNAs Found" value={run.trnascan.trnasFound} color="text-emerald-400" />
                                  <DataRow label="Amino Acids" value={run.trnascan.aminoAcidTypes} />
                                  <DataRow label="Anticodons" value={run.trnascan.anticodons} />
                                  <DataRow label="Model Type" value={run.trnascan.modelType} />
                                </ToolCard>
                              )}

                              {/* 15. HMMER */}
                              {run.hmmer && (
                                <ToolCard title="HMMER Domains" icon={Search}>
                                  <DataRow label="Domains Found" value={run.hmmer.domainsFound?.toLocaleString()} />
                                  <DataRow label="Pfam Hits" value={run.hmmer.pfamHits?.toLocaleString()} color="text-purple-400" />
                                  <DataRow label="Avg E-Value" value={run.hmmer.avgEvalue} />
                                  <DataRow label="Novel Domains" value={run.hmmer.novelDomains} />
                                </ToolCard>
                              )}

                              {/* 16. MinCED */}
                              {run.minced && (
                                <ToolCard title="MinCED (CRISPR)" icon={Layers}>
                                  <DataRow label="CRISPR Arrays" value={run.minced.crisprArrays} highlight color="text-blue-400" />
                                  <DataRow label="Total Spacers" value={run.minced.totalSpacers} />
                                  <DataRow label="Phage Matches" value={run.minced.phageMatches} color="text-orange-400" />
                                  <DataRow label="Repeat Length" value={`${run.minced.repeatLengthBp} bp`} />
                                </ToolCard>
                              )}

                              {/* 17. Jellyfish */}
                              {run.jellyfish && (
                                <ToolCard title="Jellyfish (k-mers)" icon={Activity}>
                                  <DataRow label="k-mer Size" value={run.jellyfish.kmerSize} />
                                  <DataRow label="Distinct k-mers" value={`${run.jellyfish.distinctKmersMillion}M`} />
                                  <DataRow label="Total k-mers" value={`${run.jellyfish.totalKmersBillion}B`} color="text-blue-400" />
                                  <DataRow label="Repeat Content" value={`${run.jellyfish.repeatContent}%`} />
                                </ToolCard>
                              )}

                              {/* 18. TRF */}
                              {run.trf && (
                                <ToolCard title="Tandem Repeats Finder" icon={GitBranch}>
                                  <DataRow label="Tandem Repeats" value={run.trf.tandemRepeats} />
                                  <DataRow label="Total Length" value={`${run.trf.totalLengthKb} kb`} />
                                  <DataRow label="Max Copy" value={`${run.trf.maxCopy}x`} color="text-orange-400" />
                                  <DataRow label="Avg Period" value={`${run.trf.avgPeriodSizeBp} bp`} />
                                </ToolCard>
                              )}

                              {/* 19. Barrnap */}
                              {run.barrnap && (
                                <ToolCard title="Barrnap (rRNA)" icon={Dna}>
                                  <DataRow label="Total rRNA" value={run.barrnap.totalRrna} color="text-emerald-400" highlight />
                                  <DataRow label="16S" value={run.barrnap.rrna16S} />
                                  <DataRow label="23S" value={run.barrnap.rrna23S} />
                                  <DataRow label="Taxonomy" value={run.barrnap.taxonomy} />
                                </ToolCard>
                              )}

                              {/* 20. antiSMASH */}
                              {run.antismash && (
                                <ToolCard title="antiSMASH BGCs" icon={Sparkles}>
                                  <DataRow label="BGC Regions" value={run.antismash.bgcRegions} highlight color="text-purple-400" />
                                  <DataRow label="BGC Types" value={run.antismash.bgcTypes} />
                                  <DataRow label="Novel BGCs" value={run.antismash.novelBgcs} />
                                  <DataRow label="MIBiG Matches" value={run.antismash.mibigMatches} />
                                </ToolCard>
                              )}

                            </React.Fragment>
                          ))}
                        </div>
                      ) : activeTab === 'details' ? (
                        <div className="bg-white p-10 rounded-3xl border border-slate-200 shadow-sm">
                           <h4 className="text-2xl font-black text-[#0B1B3A] mb-6 flex items-center gap-3"><FileText size={24} className="text-orange-500"/> Species Classification & Notes</h4>
                           <p className="text-slate-600 leading-relaxed text-base">{strainData?.organism?.description || "Awaiting taxonomic profile description from Bharat Genome Database."}</p>
                           
                           <div className="grid grid-cols-2 gap-6 mt-10">
                              <div className="p-6 bg-slate-50 rounded-2xl border border-slate-100 hover:border-orange-500/30 transition-colors">
                                 <p className="text-[10px] font-black uppercase text-slate-400 mb-2 tracking-widest">Taxonomic Domain</p>
                                 <p className="font-bold text-lg text-[#0B1B3A]">{strainData?.organism?.domain || "Bacteria"}</p>
                              </div>
                              <div className="p-6 bg-slate-50 rounded-2xl border border-slate-100 hover:border-orange-500/30 transition-colors">
                                 <p className="text-[10px] font-black uppercase text-slate-400 mb-2 tracking-widest">Taxonomic Phylum</p>
                                 <p className="font-bold text-lg text-[#0B1B3A]">{strainData?.organism?.phylum || "Unknown"}</p>
                              </div>
                           </div>
                        </div>
                      ) : (
                        <div className="flex flex-col items-center justify-center py-32 text-slate-300">
                           <Microscope size={80} className="mb-6 opacity-20" />
                           <p className="font-black text-sm uppercase tracking-widest">No Pipeline Analytics Found</p>
                           <p className="text-xs font-bold mt-2 text-slate-400">Ingest data to populate this workspace.</p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </main>

      {/* Tricolor Footer */}
      <div className="fixed bottom-0 w-full flex h-1.5 z-50">
        <div className="flex-1 bg-orange-500" />
        <div className="flex-1 bg-white" />
        <div className="flex-1 bg-[#138808]" />
      </div>
    </div>
  );
}

// Minimal placeholder icons for ones not imported natively from lucide-react above
function Target(props: any) { return <Activity {...props} />; }
function Network(props: any) { return <Database {...props} />; }