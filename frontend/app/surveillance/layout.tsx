import type { Metadata } from 'next';
import SurveillanceShell from '../components/surveillance/SurveillanceShell';
import { BRAND_FULL_NAME } from '../lib/brand';

export const metadata: Metadata = {
  title: `Global Genomic Surveillance | ${BRAND_FULL_NAME}`,
  description: 'Database-backed global strain surveillance, MAYA pipeline status, AMR genomic signals, data quality, and evidence limitations within BMGA.',
};

export default function SurveillanceLayout({ children }: { children: React.ReactNode }) {
  return <SurveillanceShell>{children}</SurveillanceShell>;
}
