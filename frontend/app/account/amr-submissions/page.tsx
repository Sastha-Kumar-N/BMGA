import type { Metadata } from 'next';
import { AmrSubmissionDashboard } from '../../components/amr/AmrSubmissionHub';
import { BRAND_FULL_NAME } from '../../lib/brand';

export const metadata: Metadata = {
  title: `My AMR Submissions | ${BRAND_FULL_NAME}`,
  robots: { index: false, follow: false },
};

export default function MyAmrSubmissionsPage() {
  return <AmrSubmissionDashboard />;
}
