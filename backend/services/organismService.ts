import { PrismaClient } from "@prisma/client";

export async function getOrganismById(prisma: PrismaClient, organismId: number) {
  return prisma.organism.findUnique({
    where: { id: organismId },
    include: {
      strains: {
        include: {
          assemblies: {
            orderBy: { createdAt: "desc" },
            take: 1,
          },
          _count: {
            select: {
              amrGenes: true,
              analysisRuns: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
      },
      _count: {
        select: {
          strains: true,
          toolRuns: true,
        },
      },
    },
  });
}
