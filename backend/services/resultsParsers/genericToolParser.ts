import fs from "fs/promises";
import path from "path";
import { NormalizedToolParseResult, ToolParser, ToolResultTableData } from "./parserTypes";
import { normalizeToolName } from "./toolDefinitions";

const TABULAR_EXTENSIONS = new Set([".tsv", ".csv", ".txt", ".out"]);
const SUMMARY_FILES = new Set(["summary.json", "metrics.json", "multiqc_data.json"]);

function splitDelimitedLine(line: string, delimiter: string) {
  return line.split(delimiter).map((value) => value.trim());
}

function parseDelimitedTable(content: string, fileName: string): ToolResultTableData | null {
  const lines = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length < 2) {
    return null;
  }

  const delimiter = fileName.endsWith(".csv") ? "," : "\t";
  const columns = splitDelimitedLine(lines[0], delimiter);
  const rows = lines.slice(1).map((line) => {
    const values = splitDelimitedLine(line, delimiter);
    return columns.reduce<Record<string, string>>((row, column, index) => {
      row[column || `column_${index + 1}`] = values[index] || "";
      return row;
    }, {});
  });

  return {
    tableName: path.basename(fileName, path.extname(fileName)),
    columns,
    rows,
  };
}

async function readOptionalJson(filePath: string) {
  try {
    const content = await fs.readFile(filePath, "utf8");
    return JSON.parse(content) as Record<string, unknown>;
  } catch {
    return {};
  }
}

async function readOptionalText(filePath: string) {
  try {
    const content = await fs.readFile(filePath, "utf8");
    return content
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

function fileTypeFor(fileName: string) {
  const ext = path.extname(fileName).replace(".", "").toLowerCase();
  return ext || "raw";
}

export function createGenericToolParser(toolName: string): ToolParser {
  return async (toolDir: string): Promise<NormalizedToolParseResult> => {
    const entries = await fs.readdir(toolDir, { withFileTypes: true });
    const files = entries.filter((entry) => entry.isFile());
    const tables: ToolResultTableData[] = [];
    let summary: Record<string, unknown> = {};

    for (const file of files) {
      const ext = path.extname(file.name).toLowerCase();
      const filePath = path.join(toolDir, file.name);
      const lowerName = file.name.toLowerCase();

      if (SUMMARY_FILES.has(lowerName)) {
        summary = { ...summary, ...(await readOptionalJson(filePath)) };
        continue;
      }

      if (TABULAR_EXTENSIONS.has(ext)) {
        const content = await fs.readFile(filePath, "utf8");
        const parsed = parseDelimitedTable(content, file.name);
        if (parsed) {
          tables.push(parsed);
        }
      }
    }

    const warnings = await readOptionalText(path.join(toolDir, "warnings.log"));
    const errors = await readOptionalText(path.join(toolDir, "errors.log"));
    const versionLines = await readOptionalText(path.join(toolDir, "version.txt"));

    return {
      toolName: normalizeToolName(toolName),
      status: errors.length ? "warning" : "completed",
      version: versionLines[0],
      summary: {
        ...summary,
        parsed_table_count: tables.length,
        raw_file_count: files.length,
      },
      tables,
      files: files.map((file) => ({
        fileName: file.name,
        fileType: fileTypeFor(file.name),
        filePath: path.resolve(toolDir, file.name),
        description: `${toolName} raw output`,
      })),
      warnings,
      errors,
      finishedAt: new Date(),
    };
  };
}
