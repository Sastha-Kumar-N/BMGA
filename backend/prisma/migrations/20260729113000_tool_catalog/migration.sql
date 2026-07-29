CREATE TABLE "ToolCatalogEntry" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ToolCatalogEntry_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ToolCatalogEntry_key_key" ON "ToolCatalogEntry"("key");
CREATE INDEX "ToolCatalogEntry_active_category_idx" ON "ToolCatalogEntry"("active", "category");

INSERT INTO "ToolCatalogEntry" ("id", "key", "label", "category", "description", "active", "updatedAt") VALUES
('bdc22b6c-2534-4c91-a9fd-2f20c0da0001', 'amrfinderplus', 'AMR Finder Plus', 'AMR', 'NCBI antimicrobial resistance gene and mutation detection', true, CURRENT_TIMESTAMP);
