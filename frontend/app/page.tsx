import type { Metadata } from 'next';
import HomePortal from './components/home/HomePortal';
import { BRAND_FULL_NAME } from './lib/brand';

export const metadata: Metadata = {
  title: `${BRAND_FULL_NAME} | Genomic Surveillance and Analysis`,
  description: 'Explore approved microbial genome records, India and global genomic surveillance, MAYA results, AMR evidence, JBrowse 2, IGV.js, NCBI BLAST+, and FAIR data access.',
};

export default function HomePage() {
  return <HomePortal />;
}
