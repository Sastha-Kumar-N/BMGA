export type ToolStatus = "completed" | "failed" | "pending" | "not_available" | "warning" | "partial";

export type ToolDefinition = {
  key: string;
  label: string;
  category: string;
  description: string;
};

export type ToolResultTableData = {
  tableName: string;
  columns: string[];
  rows: Record<string, unknown>[];
};

export type ToolResultFile = {
  id?: number;
  fileName: string;
  fileType?: string | null;
  description?: string | null;
  downloadPath?: string;
};

export type ToolResult = {
  toolName: string;
  displayName: string;
  category: string;
  description: string;
  status: ToolStatus;
  version?: string | null;
  runDate?: string | null;
  summary: Record<string, unknown>;
  tables: ToolResultTableData[];
  files: ToolResultFile[];
  warnings: unknown[];
  errors: unknown[];
};

export type OrganismResultsResponse = {
  organism: {
    id: number;
    name: string;
    displayName?: string | null;
    taxonomyId?: number | null;
    strain?: string | null;
    source?: string | null;
    assembly_accession?: string | null;
    biosample?: string | null;
    strains: Array<{
      id: number;
      strainName: string;
      assemblyAccession?: string | null;
      biosampleAccession?: string | null;
      sourceType?: string | null;
      city?: string | null;
      country?: string | null;
    }>;
  };
  summary: Record<string, unknown>;
  tools: Record<string, ToolResult>;
  toolOrder: string[];
  toolDefinitions: ToolDefinition[];
};
