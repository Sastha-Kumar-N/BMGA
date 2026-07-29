import type { Metadata } from 'next';
import { Suspense } from 'react';
import AmrFindingsPortal from '../components/amr/AmrFindingsPortal';
import { BRAND_FULL_NAME } from '../lib/brand';

export const metadata: Metadata = {
  title: `AMR Findings of India | ${BRAND_FULL_NAME}`,
  description: 'Explore curated antimicrobial resistance findings from clinical, environmental, veterinary, food, agricultural, genomic, and One Health studies across India.',
  alternates: { canonical: '/amr-findings-india' },
};

export default function AmrFindingsIndiaPage() {
  return <main className="min-h-screen bg-[#f6f8fb] px-4 py-7 text-[#0B1B3A] sm:px-6 lg:px-8"><Suspense fallback={<div className="mx-auto h-[680px] max-w-[1540px] animate-pulse bg-slate-200" />}><AmrFindingsPortal /></Suspense></main>;
}
