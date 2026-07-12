import type { Metadata } from 'next';
import { BRAND_FULL_NAME } from '../lib/brand';

export const metadata: Metadata = {
  title: `Scientific Blog | ${BRAND_FULL_NAME}`,
  description: 'Approved BMGA research notes, platform updates, methods, and microbial genomics perspectives.',
};

export default function BlogLayout({ children }: { children: React.ReactNode }) {
  return children;
}
