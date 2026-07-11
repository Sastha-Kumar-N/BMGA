import path from 'path';

export type UploadableGenomeReferenceKind = 'FASTA' | 'GFF3';

export type PreparedGenomeReference = {
  kind: 'FASTA' | 'FAI' | 'GFF3';
  fileName: string;
  contentType: string;
  content: string;
  validation: Record<string, unknown>;
};

const FASTA_EXTENSIONS = new Set(['.fa', '.fna', '.fasta']);
const GFF3_EXTENSIONS = new Set(['.gff', '.gff3']);
const NUCLEOTIDE_ALPHABET = /^[ACGTURYSWKMBDHVN.-]+$/;

export function prepareGenomeReference(options: {
  kind: UploadableGenomeReferenceKind;
  fileName: unknown;
  fileContent: unknown;
  maxBytes: number;
}): { files: PreparedGenomeReference[] } | { error: string } {
  const fileName = safeReferenceFileName(options.fileName);
  if (!fileName) return { error: 'A valid reference file name is required.' };
  if (typeof options.fileContent !== 'string' || !options.fileContent.trim()) {
    return { error: 'The reference file is empty.' };
  }
  if (Buffer.byteLength(options.fileContent, 'utf8') > options.maxBytes) {
    return { error: `Reference files must be ${Math.floor(options.maxBytes / 1024 / 1024)} MB or smaller.` };
  }
  if (options.fileContent.includes('\0')) return { error: 'Binary reference files are not accepted. Upload plain-text FASTA or GFF3.' };

  const extension = path.extname(fileName).toLowerCase();
  if (options.kind === 'FASTA') {
    if (!FASTA_EXTENSIONS.has(extension)) return { error: 'Reference FASTA must use .fa, .fna, or .fasta.' };
    return prepareFasta(fileName, options.fileContent);
  }
  if (!GFF3_EXTENSIONS.has(extension)) return { error: 'Genome annotation must use .gff or .gff3.' };
  return prepareGff3(fileName, options.fileContent);
}

function prepareFasta(fileName: string, input: string): { files: PreparedGenomeReference[] } | { error: string } {
  const lines = normalizeText(input).split('\n');
  const records: Array<{ header: string; id: string; sequence: string }> = [];
  let current: { header: string; id: string; sequenceParts: string[] } | null = null;
  const seenIds = new Set<string>();

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;
    if (line.startsWith('>')) {
      if (current) records.push({ header: current.header, id: current.id, sequence: current.sequenceParts.join('') });
      const header = line.slice(1).trim();
      const id = header.split(/\s+/)[0] || '';
      if (!/^[A-Za-z0-9_.:|+-]{1,180}$/.test(id)) return { error: 'Every FASTA record needs a safe, non-empty sequence identifier.' };
      if (seenIds.has(id)) return { error: `Duplicate FASTA sequence identifier: ${id}` };
      seenIds.add(id);
      current = { header: header.slice(0, 500), id, sequenceParts: [] };
      continue;
    }
    if (!current) return { error: 'FASTA sequence content must begin with a > header line.' };
    const sequence = line.replace(/\s+/g, '').toUpperCase();
    if (!NUCLEOTIDE_ALPHABET.test(sequence)) {
      return { error: `FASTA record ${current.id} contains characters outside the IUPAC nucleotide alphabet.` };
    }
    current.sequenceParts.push(sequence);
  }

  if (current) records.push({ header: current.header, id: current.id, sequence: current.sequenceParts.join('') });
  if (!records.length) return { error: 'No FASTA records were found.' };
  const emptyRecord = records.find((record) => !record.sequence.length);
  if (emptyRecord) return { error: `FASTA record ${emptyRecord.id} has no sequence.` };

  const wrapWidth = 80;
  let fasta = '';
  const faiLines: string[] = [];
  let byteOffset = 0;
  for (const record of records) {
    const headerLine = `>${record.header}\n`;
    fasta += headerLine;
    byteOffset += Buffer.byteLength(headerLine, 'utf8');
    const sequenceOffset = byteOffset;
    for (let index = 0; index < record.sequence.length; index += wrapWidth) {
      const line = `${record.sequence.slice(index, index + wrapWidth)}\n`;
      fasta += line;
      byteOffset += Buffer.byteLength(line, 'utf8');
    }
    const lineBases = Math.min(wrapWidth, record.sequence.length);
    faiLines.push(`${record.id}\t${record.sequence.length}\t${sequenceOffset}\t${lineBases}\t${lineBases + 1}`);
  }

  const totalBases = records.reduce((sum, record) => sum + record.sequence.length, 0);
  const validation = {
    sequenceCount: records.length,
    totalBases,
    referenceNames: records.map((record) => record.id).slice(0, 500),
    primaryReferenceName: records[0].id,
    normalizedLineWidth: wrapWidth,
  };

  return {
    files: [
      { kind: 'FASTA', fileName, contentType: 'text/plain; charset=utf-8', content: fasta, validation },
      { kind: 'FAI', fileName: `${fileName}.fai`, contentType: 'text/plain; charset=utf-8', content: `${faiLines.join('\n')}\n`, validation },
    ],
  };
}

function prepareGff3(fileName: string, input: string): { files: PreparedGenomeReference[] } | { error: string } {
  const lines = normalizeText(input).split('\n');
  let featureCount = 0;
  const referenceNames = new Set<string>();

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (!line || line.startsWith('#')) continue;
    const columns = line.split('\t');
    if (columns.length !== 9) return { error: `GFF3 line ${index + 1} must contain exactly 9 tab-delimited columns.` };
    const [seqid, , featureType, startRaw, endRaw] = columns;
    const start = Number(startRaw);
    const end = Number(endRaw);
    if (!seqid || !featureType || !Number.isInteger(start) || !Number.isInteger(end) || start < 1 || end < start) {
      return { error: `GFF3 line ${index + 1} contains an invalid reference, feature type, or coordinate range.` };
    }
    if (/[<>]/.test(line)) return { error: `GFF3 line ${index + 1} contains unsupported markup characters.` };
    referenceNames.add(seqid);
    featureCount += 1;
  }

  if (!featureCount) return { error: 'No GFF3 feature records were found.' };
  const normalized = `${lines.join('\n').trim()}\n`;
  return {
    files: [{
      kind: 'GFF3',
      fileName,
      contentType: 'text/gff3; charset=utf-8',
      content: normalized,
      validation: {
        featureCount,
        referenceNames: Array.from(referenceNames).slice(0, 500),
        declaresGff3: lines.some((line) => /^##gff-version\s+3\b/i.test(line)),
      },
    }],
  };
}

function normalizeText(input: string) {
  return input.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
}

function safeReferenceFileName(value: unknown) {
  if (typeof value !== 'string') return '';
  const baseName = path.basename(value.trim());
  if (!baseName || baseName.length > 240 || /[^A-Za-z0-9_.+-]/.test(baseName)) return '';
  return baseName;
}
