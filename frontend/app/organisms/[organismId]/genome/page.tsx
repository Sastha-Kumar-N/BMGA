import { notFound } from 'next/navigation';
import GenomeWorkspace from '../../../components/genome/GenomeWorkspace';

export default async function GenomeWorkspacePage({ params }: { params: Promise<{ organismId: string }> }) {
  const { organismId: rawOrganismId } = await params;
  const organismId = Number(rawOrganismId);
  if (!Number.isInteger(organismId) || organismId <= 0) notFound();
  return <GenomeWorkspace organismId={organismId} />;
}
