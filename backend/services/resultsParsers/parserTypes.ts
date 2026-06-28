export type NormalizedStatus = "completed" | "failed" | "pending" | "not_available" | "warning" | "partial";

export type ToolResultTableData = {
  tableName: string;
  columns: string[];
  rows: Record<string, unknown>[];
};

export type ToolOutputFileData = {
  fileName: string;
  fileType?: string;
  filePath: string;
  description?: string;
};

export type NormalizedToolParseResult = {
  toolName: string;
  status: NormalizedStatus;
  version?: string;
  summary: Record<string, unknown>;
  tables: ToolResultTableData[];
  files: ToolOutputFileData[];
  warnings: string[];
  errors: string[];
  startedAt?: Date;
  finishedAt?: Date;
};

export type ToolParser = (toolDir: string) => Promise<NormalizedToolParseResult>;
