import OrganismResultsPage from "../../../components/results/OrganismResultsPage";

type PageProps = {
  params: Promise<{ organismId: string }>;
};

export default async function Page({ params }: PageProps) {
  const { organismId } = await params;
  return <OrganismResultsPage organismId={organismId} />;
}
