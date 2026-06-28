'use client';

import React, { useState, useRef, useEffect } from 'react';
import { 
  UploadCloud, ShieldCheck, Database, CheckCircle, AlertCircle, 
  FileText, Dna, Microscope, MapPin, Layers 
} from 'lucide-react';
import { useSession } from 'next-auth/react';
import { apiPath } from '../lib/api-client';

export default function UnifiedAdminDashboard() {
  const { data: session } = useSession();
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Tab State
  const [activeTab, setActiveTab] = useState<'organism' | 'strain' | 'ingest'>('strain');
  
  // Data State
  const [organisms, setOrganisms] = useState<any[]>([]);
  const [strains, setStrains] = useState<any[]>([]);
  
  // Fetch Data
  const fetchData = async () => {
    try {
      const [orgRes, strainRes] = await Promise.all([
        fetch(apiPath('/organisms')),
        fetch(apiPath('/strains'))
      ]);
      const orgData = await orgRes.json();
      const strainData = await strainRes.json();
      
      setOrganisms(orgData);
      setStrains(strainData);
      
      if (orgData.length > 0 && !strainForm.organismId) {
        setStrainForm(prev => ({ ...prev, organismId: orgData[0].id.toString() }));
      }
      if (strainData.length > 0 && !ingestForm.strainId) {
        setIngestForm(prev => ({ ...prev, strainId: strainData[0].id.toString() }));
      }
    } catch (err) {
      console.error("Failed to fetch admin data", err);
    }
  };

  useEffect(() => { fetchData(); }, []);

  // --- FORM STATES ---
  const [orgForm, setOrgForm] = useState({ scientificName: '', domain: 'Bacteria', genus: '', species: '', description: '' });
  const [strainForm, setStrainForm] = useState({ organismId: '', strainName: '', sourceType: 'Clinical', city: '', country: 'India', latitude: '', longitude: '' });
  const [ingestForm, setIngestForm] = useState({ strainId: '', toolName: 'Prokka' });
  
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<{type: 'idle'|'success'|'error'|'loading', message: string}>({type: 'idle', message: ''});

  const PIPELINE_TOOLS = ['Prokka', 'FastQC', 'Fastp', 'MultiQC', 'Spades', 'Quast', 'Busco', 'CheckM', 'Diamond', 'Abricate', 'MLST'];

  // --- HANDLERS ---
  const handleAddOrganism = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus({ type: 'loading', message: 'Registering species...' });
    try {
      const res = await fetch(apiPath('/organisms'), {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(orgForm)
      });
      if (!res.ok) throw new Error("Failed");
      setStatus({ type: 'success', message: `${orgForm.scientificName} added successfully!` });
      setOrgForm({ scientificName: '', domain: 'Bacteria', genus: '', species: '', description: '' });
      fetchData(); // Refresh lists
      setTimeout(() => setStatus({ type: 'idle', message: '' }), 3000);
    } catch (err) {
      setStatus({ type: 'error', message: 'Failed to add organism.' });
    }
  };

  const handleAddStrain = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus({ type: 'loading', message: 'Registering isolate...' });
    try {
      const res = await fetch(apiPath('/strains'), {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(strainForm)
      });
      if (!res.ok) throw new Error("Failed");
      setStatus({ type: 'success', message: `${strainForm.strainName} registered successfully!` });
      setStrainForm(prev => ({ ...prev, strainName: '', city: '', latitude: '', longitude: '' }));
      fetchData(); // Refresh lists
      setTimeout(() => setStatus({ type: 'idle', message: '' }), 3000);
    } catch (err) {
      setStatus({ type: 'error', message: 'Failed to add strain.' });
    }
  };

  const handleUpload = async () => {
    if (!file || !ingestForm.strainId) return;
    setStatus({ type: 'loading', message: 'Processing and ingesting data...' });

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const res = await fetch(apiPath('/upload-results'), {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ strainId: ingestForm.strainId, toolName: ingestForm.toolName, fileContent: event.target?.result })
        });
        if (!res.ok) throw new Error('Database rejection');
        setStatus({ type: 'success', message: 'Data ingested and linked successfully!' });
        setFile(null);
        setTimeout(() => setStatus({ type: 'idle', message: '' }), 4000);
      } catch (error) {
        setStatus({ type: 'error', message: 'Failed to ingest data.' });
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="min-h-screen bg-[#0B1B3A] text-slate-200 p-10 font-sans selection:bg-orange-500/30">
      <div className="max-w-4xl mx-auto">
        
        {/* Header */}
        <div className="mb-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-4xl font-black text-white tracking-tighter flex items-center gap-4">
              <Layers className="text-orange-500" size={36} />
              Platform Admin Center
            </h1>
            <p className="text-slate-400 mt-2 font-medium">Manage species taxonomy, isolate metadata, and pipeline ingestion.</p>
          </div>
          <div className="bg-emerald-500/10 border border-emerald-500/20 px-4 py-2 rounded-full flex items-center gap-2 text-emerald-400 self-start md:self-auto w-fit">
            <ShieldCheck size={18} />
            <span className="text-xs font-black uppercase tracking-widest">Admin Access Granted</span>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex gap-2 mb-8 bg-white/5 p-2 rounded-3xl border border-white/10 overflow-x-auto">
          {[
            { id: 'organism', icon: Microscope, label: '1. Add Species' },
            { id: 'strain', icon: Dna, label: '2. Register Isolate' },
            { id: 'ingest', icon: Database, label: '3. Ingest Data' }
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex-1 flex items-center justify-center gap-2 py-4 px-6 rounded-2xl font-black uppercase tracking-widest text-xs transition-all whitespace-nowrap ${
                activeTab === tab.id 
                  ? 'bg-orange-500 text-white shadow-lg shadow-orange-500/25' 
                  : 'text-slate-400 hover:text-white hover:bg-white/5'
              }`}
            >
              <tab.icon size={16} /> {tab.label}
            </button>
          ))}
        </div>

        {/* Main Content Card */}
        <div className="bg-white rounded-[40px] p-10 shadow-2xl text-[#0B1B3A] border-4 border-slate-50">
          
          {/* TAB 1: ORGANISM */}
          {activeTab === 'organism' && (
            <form onSubmit={handleAddOrganism} className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div className="mb-8 border-b border-slate-100 pb-6">
                <h2 className="text-2xl font-black">Global Species Registry</h2>
                <p className="text-slate-500 font-bold text-sm mt-1">Define a new microbial species before adding physical isolates.</p>
              </div>
              <div className="grid grid-cols-2 gap-6">
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Scientific Name</label>
                  <input required placeholder="e.g., Staphylococcus aureus" value={orgForm.scientificName} onChange={(e) => setOrgForm({...orgForm, scientificName: e.target.value})} className="w-full bg-slate-50 border-2 border-slate-200 rounded-2xl px-4 py-4 font-bold outline-none focus:border-orange-500 transition-colors" />
                </div>
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Taxonomic Domain</label>
                  <select value={orgForm.domain} onChange={(e) => setOrgForm({...orgForm, domain: e.target.value})} className="w-full bg-slate-50 border-2 border-slate-200 rounded-2xl px-4 py-4 font-bold outline-none focus:border-orange-500 transition-colors">
                    <option>Bacteria</option><option>Archaea</option><option>Eukaryota</option><option>Viruses</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Clinical Description</label>
                <textarea rows={3} placeholder="Brief clinical significance..." value={orgForm.description} onChange={(e) => setOrgForm({...orgForm, description: e.target.value})} className="w-full bg-slate-50 border-2 border-slate-200 rounded-2xl px-4 py-4 font-bold outline-none focus:border-orange-500 transition-colors" />
              </div>
              <button type="submit" className="w-full bg-[#0B1B3A] hover:bg-orange-500 text-white font-black uppercase tracking-widest py-5 rounded-2xl transition-all shadow-xl mt-4">Save Species to Database</button>
            </form>
          )}

          {/* TAB 2: STRAIN */}
          {activeTab === 'strain' && (
            <form onSubmit={handleAddStrain} className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div className="mb-8 border-b border-slate-100 pb-6">
                <h2 className="text-2xl font-black">Physical Isolate Registration</h2>
                <p className="text-slate-500 font-bold text-sm mt-1">Log the physical origin and metadata of a specific strain.</p>
              </div>
              <div className="grid grid-cols-2 gap-6">
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Parent Species</label>
                  <select required value={strainForm.organismId} onChange={(e) => setStrainForm({...strainForm, organismId: e.target.value})} className="w-full bg-slate-50 border-2 border-slate-200 rounded-2xl px-4 py-4 font-bold outline-none focus:border-orange-500 cursor-pointer">
                    {organisms.map(o => <option key={o.id} value={o.id}>{o.scientificName}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Strain Name</label>
                  <input required placeholder="e.g., MRSA-01" value={strainForm.strainName} onChange={(e) => setStrainForm({...strainForm, strainName: e.target.value})} className="w-full bg-slate-50 border-2 border-slate-200 rounded-2xl px-4 py-4 font-bold outline-none focus:border-orange-500" />
                </div>
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">City of Origin</label>
                  <input required placeholder="e.g., Mumbai" value={strainForm.city} onChange={(e) => setStrainForm({...strainForm, city: e.target.value})} className="w-full bg-slate-50 border-2 border-slate-200 rounded-2xl px-4 py-4 font-bold outline-none focus:border-orange-500" />
                </div>
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Source Type</label>
                  <select value={strainForm.sourceType} onChange={(e) => setStrainForm({...strainForm, sourceType: e.target.value})} className="w-full bg-slate-50 border-2 border-slate-200 rounded-2xl px-4 py-4 font-bold outline-none focus:border-orange-500">
                    <option>Clinical</option><option>Environmental</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Latitude</label>
                  <input required type="number" step="any" placeholder="19.0760" value={strainForm.latitude} onChange={(e) => setStrainForm({...strainForm, latitude: e.target.value})} className="w-full bg-slate-50 border-2 border-slate-200 rounded-2xl px-4 py-4 font-bold outline-none focus:border-orange-500" />
                </div>
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Longitude</label>
                  <input required type="number" step="any" placeholder="72.8777" value={strainForm.longitude} onChange={(e) => setStrainForm({...strainForm, longitude: e.target.value})} className="w-full bg-slate-50 border-2 border-slate-200 rounded-2xl px-4 py-4 font-bold outline-none focus:border-orange-500" />
                </div>
              </div>
              <button type="submit" className="w-full bg-[#0B1B3A] hover:bg-orange-500 text-white font-black uppercase tracking-widest py-5 rounded-2xl transition-all shadow-xl mt-4">Register Isolate</button>
            </form>
          )}

          {/* TAB 3: INGEST */}
          {activeTab === 'ingest' && (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
               <div className="mb-8 border-b border-slate-100 pb-6">
                <h2 className="text-2xl font-black">Pipeline File Ingestion</h2>
                <p className="text-slate-500 font-bold text-sm mt-1">Upload .tsv or .csv outputs from bioinformatics tools.</p>
              </div>
              <div className="grid grid-cols-2 gap-6 mb-4">
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Target Isolate</label>
                  <select value={ingestForm.strainId} onChange={(e) => setIngestForm({...ingestForm, strainId: e.target.value})} className="w-full bg-slate-50 border-2 border-slate-200 rounded-2xl px-4 py-4 font-bold text-sm outline-none focus:border-orange-500 cursor-pointer">
                    {strains.map(s => <option key={s.id} value={s.id}>{s.strainName} ({s.organism?.scientificName})</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Pipeline Tool</label>
                  <select value={ingestForm.toolName} onChange={(e) => setIngestForm({...ingestForm, toolName: e.target.value})} className="w-full bg-slate-50 border-2 border-slate-200 rounded-2xl px-4 py-4 font-bold text-sm outline-none focus:border-orange-500 cursor-pointer">
                    {PIPELINE_TOOLS.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
              </div>

              <div onClick={() => fileInputRef.current?.click()} className={`border-4 border-dashed rounded-3xl p-16 text-center cursor-pointer transition-all ${file ? 'border-orange-500 bg-orange-50' : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'}`}>
                <input type="file" ref={fileInputRef} className="hidden" accept=".tsv,.csv,.txt" onChange={(e) => e.target.files && setFile(e.target.files[0])} />
                {file ? (
                  <div className="flex flex-col items-center">
                    <div className="w-16 h-16 bg-orange-500 rounded-2xl flex items-center justify-center text-white mb-4 shadow-lg shadow-orange-500/30"><FileText size={32} /></div>
                    <p className="text-xl font-black text-[#0B1B3A] mb-1">{file.name}</p>
                    <p className="text-sm font-bold text-orange-500">{(file.size / 1024).toFixed(2)} KB • Ready</p>
                  </div>
                ) : (
                  <div className="flex flex-col items-center opacity-60">
                    <UploadCloud size={64} className="text-slate-400 mb-4" />
                    <p className="text-xl font-black text-[#0B1B3A] mb-2">Click or drag file to upload</p>
                  </div>
                )}
              </div>
              <button onClick={handleUpload} disabled={!file || status.type === 'loading'} className="w-full bg-[#0B1B3A] hover:bg-orange-500 text-white font-black uppercase tracking-widest py-5 rounded-2xl transition-all disabled:opacity-50 flex justify-center items-center gap-3 shadow-xl">
                {status.type === 'loading' ? <><div className="w-5 h-5 border-4 border-white/30 border-t-white rounded-full animate-spin" /> Processing...</> : 'Initialize Ingestion Pipeline'}
              </button>
            </div>
          )}

          {/* Global Status Banner */}
          {status.type !== 'idle' && status.type !== 'loading' && (
            <div className={`mt-6 p-4 rounded-2xl flex items-center gap-3 font-bold animate-in fade-in slide-in-from-bottom-2 ${status.type === 'success' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
              {status.type === 'success' ? <CheckCircle className="text-emerald-500" size={20} /> : <AlertCircle className="text-red-500" size={20} />}
              {status.message}
            </div>
          )}

        </div>
      </div>
    </div>
  );
} 
