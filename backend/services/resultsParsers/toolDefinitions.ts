export type ToolDefinition = {
  key: string;
  label: string;
  category: string;
  description: string;
};

export const TOOL_DEFINITIONS: ToolDefinition[] = [
  { key: "abricate", label: "ABRicate", category: "AMR", description: "AMR, virulence, and plasmid database hits" },
  { key: "antismash", label: "antiSMASH", category: "BGC", description: "Biosynthetic gene cluster predictions" },
  { key: "barrnap", label: "Barrnap", category: "Annotation", description: "rRNA gene predictions" },
  { key: "busco", label: "BUSCO", category: "Quality", description: "Single-copy ortholog completeness" },
  { key: "checkm", label: "CheckM", category: "Quality", description: "Genome completeness and contamination" },
  { key: "diamond", label: "DIAMOND", category: "Annotation", description: "Protein similarity search hits" },
  { key: "fastp", label: "fastp", category: "QC", description: "Read filtering and trimming summary" },
  { key: "fastqc", label: "FastQC", category: "QC", description: "Raw read quality modules" },
  { key: "fastqc_trimmed", label: "FastQC Trimmed", category: "QC", description: "Trimmed read quality modules" },
  { key: "hmmer", label: "HMMER", category: "Domains", description: "Profile/domain search hits" },
  { key: "islandpath", label: "IslandPath", category: "Mobile Elements", description: "Genomic island predictions" },
  { key: "jellyfish", label: "Jellyfish", category: "K-mers", description: "K-mer statistics" },
  { key: "kofam", label: "KofamKOALA", category: "Pathways", description: "KEGG orthology assignments" },
  { key: "minced", label: "MinCED", category: "CRISPR", description: "CRISPR array predictions" },
  { key: "rnlst", label: "rMLST", category: "Typing", description: "Ribosomal MLST marker profile" },
  { key: "multiqc", label: "MultiQC", category: "QC", description: "Integrated QC summary" },
  { key: "prokka", label: "Prokka", category: "Annotation", description: "Genome annotation summary and features" },
  { key: "quast", label: "QUAST", category: "Assembly", description: "Assembly quality metrics" },
  { key: "spades", label: "SPAdes", category: "Assembly", description: "Assembly run summary" },
  { key: "trf", label: "TRF", category: "Repeats", description: "Tandem repeat predictions" },
  { key: "trnascan", label: "tRNAscan-SE", category: "Annotation", description: "tRNA predictions" },
];

export const TOOL_KEYS = TOOL_DEFINITIONS.map((tool) => tool.key);

export function normalizeToolName(toolName: string) {
  const key = toolName.toLowerCase().replace(/[-\s.]+/g, "_");

  if (key === "jellyfish") return "jellyfish";
  if (key === "kofamkoala" || key === "kofam_koala" || key === "kofam") return "kofam";
  if (key === "island_path") return "islandpath";
  if (key === "trnascan_se" || key === "trnascanse") return "trnascan";
  if (key === "rmlst" || key === "rn_lsts") return "rnlst";
  if (key === "antismash") return "antismash";

  return key;
}

export function getToolDefinition(toolName: string) {
  const normalized = normalizeToolName(toolName);
  return TOOL_DEFINITIONS.find((tool) => tool.key === normalized);
}
