import type { Metadata } from 'next';
import AmrPublicationsPortal from '../../components/amr/AmrPublicationsPortal';
import { BRAND_FULL_NAME } from '../../lib/brand';

export const metadata: Metadata = { title: `AMR Publications | ${BRAND_FULL_NAME}`, description: 'Published AMR literature records curated by Bharat Microbial Genome Atlas.' };

export default function AmrPublicationsPage() { return <AmrPublicationsPortal />; }
