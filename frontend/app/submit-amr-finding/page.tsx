import type { Metadata } from 'next';
import AmrSubmissionHub from '../components/amr/AmrSubmissionHub';
import { BRAND_FULL_NAME } from '../lib/brand';

export const metadata: Metadata = {
  title: `Submit AMR Finding | ${BRAND_FULL_NAME}`,
  description: 'Create a private AMR finding or publication submission for BMGA administrative review.',
  robots: { index: false, follow: false },
};

export default async function SubmitAmrFindingPage({ searchParams }: { searchParams: Promise<{ finding?: string | string[]; publication?: string | string[] }> }) {
  const params = await searchParams;
  const finding = Array.isArray(params.finding) ? params.finding[0] : params.finding;
  const publication = Array.isArray(params.publication) ? params.publication[0] : params.publication;
  return <AmrSubmissionHub initialFindingId={finding} initialPublicationId={publication} />;
}
