import { ToolParser } from "./parserTypes";
import { TOOL_KEYS, normalizeToolName } from "./toolDefinitions";
import { parseAbricate } from "./abricate.parser";
import { parseAntismash } from "./antismash.parser";
import { parseBarrnap } from "./barrnap.parser";
import { parseBusco } from "./busco.parser";
import { parseCheckm } from "./checkm.parser";
import { parseDiamond } from "./diamond.parser";
import { parseFastp } from "./fastp.parser";
import { parseFastqc } from "./fastqc.parser";
import { parseFastqcTrimmed } from "./fastqc_trimmed.parser";
import { parseHmmer } from "./hmmer.parser";
import { parseIslandpath } from "./islandpath.parser";
import { parseJellyfish } from "./jellyfish.parser";
import { parseKofam } from "./kofam.parser";
import { parseMinced } from "./minced.parser";
import { parseRnlst } from "./rnlst.parser";
import { parseMultiqc } from "./multiqc.parser";
import { parseProkka } from "./prokka.parser";
import { parseQuast } from "./quast.parser";
import { parseSpades } from "./spades.parser";
import { parseTrf } from "./trf.parser";
import { parseTrnascan } from "./trnascan.parser";

export const parserRegistry: Record<string, ToolParser> = {
  abricate: parseAbricate,
  antismash: parseAntismash,
  barrnap: parseBarrnap,
  busco: parseBusco,
  checkm: parseCheckm,
  diamond: parseDiamond,
  fastp: parseFastp,
  fastqc: parseFastqc,
  fastqc_trimmed: parseFastqcTrimmed,
  hmmer: parseHmmer,
  islandpath: parseIslandpath,
  jellyfish: parseJellyfish,
  kofam: parseKofam,
  minced: parseMinced,
  rnlst: parseRnlst,
  multiqc: parseMultiqc,
  prokka: parseProkka,
  quast: parseQuast,
  spades: parseSpades,
  trf: parseTrf,
  trnascan: parseTrnascan,
};

export function getParser(toolName: string) {
  return parserRegistry[normalizeToolName(toolName)];
}

export function supportedToolKeys() {
  return TOOL_KEYS;
}
