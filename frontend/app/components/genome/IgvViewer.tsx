'use client';

import { useEffect, useRef, useState } from 'react';
import type { Browser } from 'igv';
import igv from 'igv/dist/igv.esm.js';
import { AlertCircle, LoaderCircle } from 'lucide-react';
import { apiPath } from '../../lib/api-client';
import type { GenomeReferenceStrain } from './types';
import { referenceByKind } from './types';

export default function IgvViewer({ strain, organismName }: { strain: GenomeReferenceStrain; organismName: string }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const browserRef = useRef<Browser | null>(null);
  const [error, setError] = useState('');
  const fasta = referenceByKind(strain, 'FASTA');
  const fai = referenceByKind(strain, 'FAI');
  const gff3 = referenceByKind(strain, 'GFF3');

  useEffect(() => {
    if (!containerRef.current || !fasta || !fai) return;
    let cancelled = false;
    const container = containerRef.current;
    void igv.createBrowser(container, {
      reference: {
        id: `BMGA_${strain.id}`,
        name: `${organismName} ${strain.strainName}`,
        fastaURL: apiPath(fasta.accessUrl),
        indexURL: apiPath(fai.accessUrl),
        wholeGenomeView: true,
      },
      showNavigation: true,
      showSampleNames: false,
      tracks: gff3 ? [{
        name: `${strain.strainName} annotations`,
        type: 'annotation',
        format: 'gff3',
        url: apiPath(gff3.accessUrl),
        indexed: false,
        displayMode: 'EXPANDED',
        color: '#0f766e',
        height: 240,
      }] : [],
    }).then((browser) => {
      if (cancelled) igv.removeBrowser(browser);
      else browserRef.current = browser;
    }).catch(() => {
      if (!cancelled) setError('IGV.js could not initialize this approved reference. Verify the FASTA and index files.');
    });

    return () => {
      cancelled = true;
      if (browserRef.current) {
        igv.removeBrowser(browserRef.current);
        browserRef.current = null;
      }
      container.replaceChildren();
    };
  }, [fai, fasta, gff3, organismName, strain.id, strain.strainName]);

  if (error) return <div className="flex min-h-[420px] items-center justify-center border border-red-200 bg-red-50 p-6 text-sm font-bold text-red-700"><AlertCircle className="mr-3" size={20} />{error}</div>;
  return (
    <div className="relative min-h-[520px] border border-slate-200 bg-white p-3">
      <div className="pointer-events-none absolute right-4 top-4 z-10 inline-flex items-center gap-2 bg-white/90 px-3 py-2 text-[10px] font-black uppercase text-slate-500"><LoaderCircle size={13} /> IGV.js</div>
      <div ref={containerRef} aria-label={`IGV.js viewer for ${organismName} ${strain.strainName}`} />
    </div>
  );
}
