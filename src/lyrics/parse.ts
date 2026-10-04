export type LayoutMode = "phrase" | "couplet" | "written";

export type SectionKind =
  | "title"
  | "intro"
  | "verse"
  | "prechorus"
  | "chorus"
  | "postchorus"
  | "bridge"
  | "tag"
  | "ending"
  | "instrumental"
  | "vamp"
  | "other";

export type LyricSlide = {
  id: string;
  lines: string[];
  label?: string;
};

export type LyricSection = {
  id: string;
  name: string;
  kind: SectionKind;
  slides: LyricSlide[];
};

export type DetectedMeta = {
  title?: string;
  artist?: string;
  author?: string;
  ccli?: string;
  year?: string;
  publisher?: string;
};

export type ParseResult = {
  sections: LyricSection[];
  chordsRemoved: number;
  inventedStructure: boolean;
  detected: DetectedMeta;
};

export type Rgb = { r: number; g: number; b: number };

export const SECTION_STYLE: Record<SectionKind, { hex: string; rgb: Rgb }> = {
  title: { hex: "#d9d3c7", rgb: { r: 217, g: 211, b: 199 } },
  intro: { hex: "#a39b8d", rgb: { r: 163, g: 155, b: 141 } },
  verse: { hex: "#6ea2d4", rgb: { r: 110, g: 162, b: 212 } },
  prechorus: { hex: "#5eb8ad", rgb: { r: 94, g: 184, b: 173 } },
  chorus: { hex: "#e4a15a", rgb: { r: 228, g: 161, b: 90 } },
  postchorus: { hex: "#e4a15a", rgb: { r: 228, g: 161, b: 90 } },
  bridge: { hex: "#b792d6", rgb: { r: 183, g: 146, b: 214 } },
  tag: { hex: "#8fca8a", rgb: { r: 143, g: 202, b: 138 } },
  ending: { hex: "#8fca8a", rgb: { r: 143, g: 202, b: 138 } },
  instrumental: { hex: "#a39b8d", rgb: { r: 163, g: 155, b: 141 } },
  vamp: { hex: "#e07a6a", rgb: { r: 224, g: 122, b: 106 } },
  other: { hex: "#d9d3c7", rgb: { r: 217, g: 211, b: 199 } },
};

const MAX_LINE = 44;

const CHORD_TOKEN =
  /^(?:[A-G](?:#|b)?(?:maj|min|m|dim|aug|sus|add)?(?:\d{1,2})?(?:sus\d|add\d|maj\d|m\d|b5|#5|b9|#9)?(?:\/[A-G](?:#|b)?)?|NC|N\.C\.)$/i;

const SHORT_LABEL: Record<string, string> = {
  pc: "Pre-Chorus",
  v: "Verse",
  c: "Chorus",
  b: "Bridge",
  e: "Ending",
  t: "Tag",
};

const DISPLAY_LABEL: Record<string, string> = {
  "pre-chorus": "Pre-Chorus",
  "pre chorus": "Pre-Chorus",
  prechorus: "Pre-Chorus",
  "post-chorus": "Post-Chorus",
  "post chorus": "Post-Chorus",
  postchorus: "Post-Chorus",
  chorus: "Chorus",
  refrain: "Refrain",
  hook: "Hook",
  verse: "Verse",
  bridge: "Bridge",
  tag: "Tag",
  outro: "Ending",
  ending: "Ending",
  coda: "Ending",
  intro: "Intro",
  instrumental: "Instrumental",
  interlude: "Interlude",
  vamp: "Vamp",
  channel: "Channel",
  breakdown: "Breakdown",
  spontaneous: "Spontaneous",
  turnaround: "Turnaround",
};

type HeaderMatch = { name: string; kind: SectionKind; firstLyric?: string };

type Block = {
  header: { name: string; kind: SectionKind } | null;
  repeat?: string;
  lines: string[];
};

export function newId(): string {
  return Math.random().toString(36).slice(2, 10);
}

export function kindFromName(name: string): SectionKind {
  const n = name.toLowerCase();
  if (/pre[-\s]?chorus/.test(n)) return "prechorus";
  if (/post[-\s]?chorus/.test(n)) return "postchorus";
  if (/\bchannel\b/.test(n)) return "chorus";
  if (/\b(chorus|refrain|hook)\b/.test(n)) return "chorus";
  if (/\bverse\b/.test(n)) return "verse";
  if (/\bbreakdown\b/.test(n)) return "bridge";
  if (/\bbridge\b/.test(n)) return "bridge";
  if (/\btag\b/.test(n)) return "tag";
  if (/\b(ending|outro|coda)\b/.test(n)) return "ending";
  if (/\bintro\b/.test(n)) return "intro";
  if (/\bturnaround\b/.test(n)) return "instrumental";
  if (/\b(instrumental|interlude)\b/.test(n)) return "instrumental";
  if (/\bvamp\b/.test(n)) return "vamp";
  if (/\btitle\b/.test(n)) return "title";
  return "other";
}

export function isChordToken(token: string): boolean {
  const cleaned = token.trim().replace(/^[([{|]+|[)\]}|]+$/g, "");
  if (!cleaned || cleaned === "|" || cleaned === "||" || cleaned === "%" || cleaned === "x" || cleaned === "-") {
    return false;
  }
  return CHORD_TOKEN.test(cleaned);
}

export function splitLongLine(line: string, max = MAX_LINE): string[] {
  const clean = line.replace(/\s+/g, " ").trim();
  if (!clean) return [];
  if (clean.length <= max) return [clean];

  const at = bestBreak(clean, max);
  if (at <= 0 || at >= clean.length) return [clean];

  const left = clean.slice(0, at).trim();
  const right = clean.slice(at).trim();
  if (!left || !right || left === clean || right === clean) return [clean];
  return [...splitLongLine(left, max), ...splitLongLine(right, max)];
}

export function stripParentheticals(line: string): string {
  let next = line;
  for (let guard = 0; guard < 6 && /\([^()]*\)/.test(next); guard += 1) {
    next = next.replace(/\s*\([^()]*\)/g, "");
  }
  return next.replace(/\s{2,}/g, " ").replace(/\s+([,.;!?])/g, "$1").trim();
}

export function shapeSlides(
  sections: LyricSection[],
  options: { linesPerSlide: number; stripParentheses: boolean },
): { sections: LyricSection[]; parenthesesRemoved: number } {
  const size = Math.max(1, Math.min(12, Math.floor(options.linesPerSlide) || 1));
  let parenthesesRemoved = 0;

  const shaped = sections
    .map((section) => {
      const lines = section.slides
        .flatMap((slide) => slide.lines)
        .map((line) => {
          const trimmed = line.trim();
          if (!options.stripParentheses) return trimmed;
          const stripped = stripParentheticals(trimmed);
          if (stripped !== trimmed) parenthesesRemoved += 1;
          return stripped;
        })
        .filter(Boolean);

      const slides: LyricSlide[] = [];
      for (let index = 0; index < lines.length; index += size) {
        slides.push({ id: newId(), lines: lines.slice(index, index + size) });
      }
      return { ...section, slides };
    })
    .filter((section) => section.slides.length > 0);

  return { sections: shaped, parenthesesRemoved };
}

export function splitSlideLines(lines: string[]): string[][] | null {
  const filled = lines.map((line) => line.trim()).filter(Boolean);
  if (filled.length > 1) return filled.map((line) => [line]);
  if (filled.length === 0) return null;

  const once = splitOnce(filled[0]);
  return once ? [[once[0]], [once[1]]] : null;
}

function splitOnce(line: string): [string, string] | null {
  const clean = line.replace(/\s+/g, " ").trim();
  const at = bestBreak(clean, Math.max(16, Math.round(clean.length * 0.62)));
  if (at > 0 && at < clean.length) {
    const left = clean.slice(0, at).trim();
    const right = clean.slice(at).trim();
    if (left && right) return [left, right];
  }
  const words = clean.split(/\s+/);
  if (words.length < 2) return null;
  const mid = Math.ceil(words.length / 2);
  return [words.slice(0, mid).join(" "), words.slice(mid).join(" ")];
}

export function suggestLayout(raw: string): LayoutMode {
  if (!raw.trim()) return "phrase";
  return hasManualBreaks(raw) ? "written" : "phrase";
}

export function parseLyrics(raw: string, layout: LayoutMode): ParseResult {
  const detected: DetectedMeta = {};
  let chordsRemoved = 0;
  const blocks: Block[] = [];
  let block: Block = { header: null, lines: [] };

  const flush = () => {
    const hasLyric = block.lines.some((line) => line.trim());
    if (block.header || hasLyric) blocks.push(block);
    block = { header: null, lines: [] };
  };

  for (const sourceLine of normalize(raw).split("\n")) {
    const line = sourceLine.trim();
    if (!line) {
      block.lines.push("");
      continue;
    }

    if (line.startsWith("#")) continue;

    const chordPro = readChordPro(line, detected);
    if (chordPro === "drop" || chordPro === "end") continue;
    if (chordPro) {
      flush();
      block = { header: { name: chordPro.name, kind: chordPro.kind }, lines: [] };
      if (chordPro.firstLyric) block.lines.push(chordPro.firstLyric);
      continue;
    }

    const header = matchHeader(line);
    if (header) {
      flush();
      block = { header: { name: header.name, kind: header.kind }, lines: [] };
      if (header.firstLyric) block.lines.push(header.firstLyric);
      continue;
    }

    if (readMeta(line, detected)) continue;

    const repeat = repeatNote(line);
    if (repeat) {
      if (block.header || block.lines.some((entry) => entry.trim())) block.repeat = repeat;
      continue;
    }

    if (isSeparator(line) || isTabLine(line) || isChordLine(line)) {
      if (isChordLine(line) || isTabLine(line)) {
        chordsRemoved += Math.max(1, chordTokenCount(line));
      }
      continue;
    }

    const lyric = cleanLyricText(line);
    const inline = countInlineChords(line);
    if (inline > 0) chordsRemoved += inline;
    if (!lyric) {
      chordsRemoved += 1;
      continue;
    }
    block.lines.push(lyric);
  }
  flush();

  let inventedStructure = false;
  if (blocks[0] && !blocks[0].header && blocks.slice(1).some((entry) => entry.header) && detected.ccli) {
    const content = blocks[0].lines.map((line) => line.trim()).filter(Boolean);
    if (content.length > 0 && content.length <= 3 && content.every((line) => line.length <= 70)) {
      if (!detected.title) detected.title = content[0];
      if (content[1] && !detected.author) detected.author = content[1];
      blocks.shift();
    }
  }

  const sections: LyricSection[] = [];
  for (const entry of blocks) {
    if (!entry.header && !entry.lines.some((line) => line.trim())) continue;

    if (!entry.header) {
      const stanzaLines = stanzas(entry.lines);
      if (stanzaLines.length === 0) continue;
      inventedStructure = true;
      stanzaLines.forEach((stanza, index) => {
        const name = stanzaLines.length === 1 ? "Lyrics" : `Verse ${index + 1}`;
        sections.push(sectionFromLines(name, stanza, layout, entry.repeat));
      });
      continue;
    }

    let name = entry.header.name;
    if (entry.repeat && !name.includes(entry.repeat)) name = `${name} (${entry.repeat})`;
    sections.push(sectionFromLines(name, entry.lines, layout));
  }

  numberBare(sections, "Verse");
  numberBare(sections, "Bridge");

  return { sections, chordsRemoved, inventedStructure, detected };
}

function sectionFromLines(name: string, lines: string[], layout: LayoutMode, repeat?: string): LyricSection {
  const kind = kindFromName(name);
  let label = name;
  if (repeat && !label.includes(repeat)) label = `${label} (${repeat})`;
  const slides: LyricSlide[] = applyLayout(lines, layout).map((slideLines) => ({
    id: newId(),
    lines: slideLines,
  }));

  if (slides.length === 0) {
    slides.push({ id: newId(), lines: [], label });
  }

  return { id: newId(), name: label, kind, slides };
}

function applyLayout(lines: string[], layout: LayoutMode): string[][] {
  const mode = layout === "written" && !sectionHasBreaks(lines) ? "phrase" : layout;

  if (mode === "written") {
    const groups: string[][] = [];
    let current: string[] = [];
    const flush = () => {
      if (current.length === 0) return;
      const visual = current.flatMap((line) => splitLongLine(line));
      for (let index = 0; index < visual.length; index += 4) {
        groups.push(visual.slice(index, index + 4));
      }
      current = [];
    };
    for (const line of lines) {
      if (!line.trim()) flush();
      else current.push(line);
    }
    flush();
    return groups;
  }

  const rows = lines.map((line) => line.trim()).filter(Boolean);
  if (mode === "phrase") {
    return rows.flatMap((row) => splitLongLine(row).map((part) => [part]));
  }

  const slides: string[][] = [];
  for (let index = 0; index < rows.length; index += 2) {
    const visual = rows.slice(index, index + 2).flatMap((row) => splitLongLine(row));
    if (visual.length <= 3) slides.push(visual);
    else visual.forEach((part) => slides.push([part]));
  }
  return slides;
}

function sectionHasBreaks(lines: string[]): boolean {
  let seen = false;
  let blankAfterContent = false;
  for (const line of lines) {
    if (!line.trim()) {
      if (seen) blankAfterContent = true;
      continue;
    }
    if (blankAfterContent) return true;
    seen = true;
  }
  return false;
}

function stanzas(lines: string[]): string[][] {
  const groups: string[][] = [];
  let current: string[] = [];
  for (const line of lines) {
    if (!line.trim()) {
      if (current.length) groups.push(current);
      current = [];
      continue;
    }
    current.push(line);
  }
  if (current.length) groups.push(current);
  return groups;
}

function numberBare(sections: LyricSection[], label: "Verse" | "Bridge") {
  const hasNumbered = sections.some((section) => new RegExp(`^${label}\\s+\\d`).test(section.name));
  if (hasNumbered) return;
  const group = sections.filter((section) => section.name.replace(/\s*\([^)]*\)$/, "") === label);
  if (group.length === 0) return;
  group.forEach((section, index) => {
    const suffix = section.name.slice(label.length);
    section.name = `${label} ${index + 1}${suffix}`;
  });
}

function hasManualBreaks(raw: string): boolean {
  let seenHeader = false;
  let seenLyric = false;
  let blankAfterLyric = false;
  for (const sourceLine of normalize(raw).split("\n")) {
    const line = sourceLine.trim();
    if (!line) {
      if (seenLyric) blankAfterLyric = true;
      continue;
    }
    if (matchHeader(line) || readChordPro(line, {}) ) {
      seenHeader = true;
      seenLyric = false;
      blankAfterLyric = false;
      continue;
    }
    if (readMeta(line, {}) || repeatNote(line) || isChordLine(line) || isTabLine(line) || isSeparator(line)) {
      continue;
    }
    if (seenHeader && seenLyric && blankAfterLyric) return true;
    seenLyric = true;
    blankAfterLyric = false;
  }
  return false;
}

function normalize(raw: string): string {
  return raw
    .replace(/^\uFEFF/, "")
    .replace(/\r\n?/g, "\n")
    .replace(/[\u2018\u2019\u2032\u0060]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/\u2026/g, "...")
    .replace(/\u00A0/g, " ");
}

function matchHeader(line: string): HeaderMatch | null {
  const trimmed = line.trim();
  const bracket = trimmed.match(/^\[([^[\]]+)\]$/);
  const paren = !bracket ? trimmed.match(/^\(([^()]+)\)$/) : null;
  const wrapped = Boolean(bracket || paren);
  const peeled = peelRepeat((bracket?.[1] ?? paren?.[1] ?? trimmed).trim());
  const inner = peeled.rest;
  if (!inner) return null;

  const short = inner.match(/^(pc|v|c|b|e|t)\s*(\d+)?$/i);
  if (short) {
    if (!wrapped && !short[2]) return null;
    const label = SHORT_LABEL[short[1].toLowerCase()];
    let name = `${label}${short[2] ? ` ${short[2]}` : ""}`;
    if (peeled.repeat) name += ` (${peeled.repeat})`;
    return { name, kind: kindFromName(name) };
  }

  const named = inner.match(
    /^(pre[-\s]?chorus|post[-\s]?chorus|chorus|refrain|hook|verse|bridge|tag|outro|ending|coda|intro|instrumental|interlude|vamp|channel|breakdown|spontaneous|turnaround)\s*(\d+)?(?:\s*[:.\-\u2013\u2014]\s*(.+))?$/i,
  );
  if (!named) return null;

  const label = DISPLAY_LABEL[named[1].toLowerCase().replace(/\s+/g, " ")] ?? named[1];
  let name = `${label}${named[2] ? ` ${named[2]}` : ""}`;
  if (peeled.repeat) name += ` (${peeled.repeat})`;
  const note = named[3]?.trim();
  if (note) {
    const noteIsLyric = !wrapped && (note.length > 20 || note.split(/\s+/).length > 3);
    if (noteIsLyric) return { name, kind: kindFromName(name), firstLyric: cleanLyricText(note) };
    name += ` (${note})`;
  }
  return { name, kind: kindFromName(name) };
}

function peelRepeat(inner: string): { rest: string; repeat?: string } {
  const match = inner.match(/^(.*?)(?:\s*[([]?(x\s*[2-9]|[2-9]\s*x)[)\]]?)\s*$/i);
  if (!match) return { rest: inner };
  const rest = match[1].trim().replace(/[\s:-]+$/g, "");
  if (!rest) return { rest: inner };
  const digits = match[2].match(/[2-9]/);
  return { rest, repeat: digits ? `x${digits[0]}` : undefined };
}

function repeatNote(line: string): string | null {
  const match = line.match(
    /^(?:[([]\s*)?(x\s*[2-9]|[2-9]\s*x|[2-9]\s*times|repeat(?:\s*[2-9]\s*times)?)(?:\s*[)\]])?$/i,
  );
  if (!match) return null;
  const digits = match[1].match(/[2-9]/);
  return digits ? `x${digits[0]}` : "repeat";
}

function readChordPro(line: string, detected: DetectedMeta): "drop" | "end" | HeaderMatch | null {
  if (!line.startsWith("{") || !line.endsWith("}")) return null;
  const inner = line.slice(1, -1).trim();
  if (!inner.includes(":") && matchHeader(inner)) return matchHeader(inner);

  const directive = inner.match(/^([a-z_]+)\s*:\s*(.*)$/i);
  const bare = inner.match(/^([a-z_]+)$/i);
  const key = (directive?.[1] ?? bare?.[1] ?? "").toLowerCase();
  const value = directive?.[2]?.trim() ?? "";
  if (!key) return null;

  if (key === "soc" || key === "start_of_chorus") return { name: "Chorus", kind: "chorus" };
  if (key === "sov" || key === "start_of_verse") {
    const name = value && /^\d+$/.test(value) ? `Verse ${value}` : "Verse";
    return { name, kind: "verse" };
  }
  if (key === "eoc" || key === "end_of_chorus" || key === "eov" || key === "end_of_verse") return "end";
  if ((key === "title" || key === "t") && value) {
    if (!detected.title) detected.title = value;
    return "drop";
  }
  if ((key === "artist" || key === "subtitle" || key === "st") && value) {
    if (key === "artist" && !detected.artist) detected.artist = value;
    return "drop";
  }
  if ((key === "composer" || key === "author" || key === "lyricist") && value) {
    if (!detected.author) detected.author = value;
    return "drop";
  }
  if ((key === "comment" || key === "c" || key === "comment_italic") && value) {
    return matchHeader(value) ?? "drop";
  }
  return "drop";
}

function readMeta(line: string, detected: DetectedMeta): boolean {
  if (/ccli\s+license/i.test(line)) return true;
  if (/songselect terms of use/i.test(line)) return true;
  if (/^all rights reserved\b/i.test(line)) return true;
  if (/^www\.ccli\.com\b/i.test(line)) return true;
  if (/^for use solely with\b/i.test(line)) return true;

  const songNumber = line.match(/\bccli(?:\s+song)?\s*#?\s*:?\s*(\d{4,8})\b/i);
  if (songNumber && line.length < 80) {
    if (!detected.ccli) detected.ccli = songNumber[1];
    return true;
  }

  const copyright = line.match(/^(?:©|\(c\)|copyright)\s*(\d{4})?\s*(.*)$/i);
  if (copyright) {
    if (copyright[1] && !detected.year) detected.year = copyright[1];
    const publisher = copyright[2]?.replace(/\s*[|].*$/, "").trim();
    if (publisher && !detected.publisher) detected.publisher = publisher;
    return true;
  }

  const credit = line.match(/^(?:words and music|words|music|written)\s+by\s+(.+)$/i);
  if (credit) {
    if (!detected.author) detected.author = credit[1].trim();
    return true;
  }

  return false;
}

function cleanLyricText(line: string): string {
  return stripInlineChords(line)
    .replace(/[{}\\]/g, "")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function stripInlineChords(line: string): string {
  return line
    .replace(/\[([^\]]+)\]/g, (full, inner: string) => (isChordToken(inner) ? "" : full))
    .replace(/\(([^)]+)\)/g, (full, inner: string) => (isChordToken(inner) ? "" : full));
}

function countInlineChords(line: string): number {
  const marks = line.match(/\[[^\]]+\]|\([^)]+\)/g) ?? [];
  return marks.filter((mark) => isChordToken(mark.slice(1, -1))).length;
}

function isChordLine(line: string): boolean {
  const tokens = line
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token && token !== "|" && token !== "/" && token !== "-" && token !== "x" && token !== "%");
  if (tokens.length === 0) return false;
  return tokens.every((token) => isChordToken(token));
}

function chordTokenCount(line: string): number {
  return line.split(/\s+/).filter((token) => isChordToken(token)).length;
}

function isTabLine(line: string): boolean {
  return /\|[-—|0-9hpb/\\]{3,}/.test(line) || /^[eBGDAE]\|/.test(line);
}

function isSeparator(line: string): boolean {
  return /^[-*_=~.]{3,}$/.test(line);
}

function bestBreak(line: string, max: number): number {
  const candidates: { at: number; rank: number }[] = [];
  const add = (pattern: RegExp, rank: number, keepMatch: boolean) => {
    for (const match of line.matchAll(pattern)) {
      if (match.index === undefined) continue;
      const at = keepMatch ? match.index + match[0].length : match.index;
      if (at >= 8 && line.length - at >= 6) candidates.push({ at, rank });
    }
  };

  add(/[.!?]["']?\s+/g, 0, true);
  add(/[;:]\s+/g, 1, true);
  add(/,\s+/g, 2, true);
  add(/\s+(?:—|–|-)\s+/g, 2, false);
  add(/\s+(?:and|but|so|yet|or|when|with|through|than|because|until)\s+/gi, 3, false);

  const target = Math.min(max, Math.round(line.length * 0.58));
  const near = candidates.filter((candidate) => candidate.at <= max + 8);
  const pool = near.length > 0 ? near : candidates;
  if (pool.length > 0) {
    pool.sort((a, b) => a.rank - b.rank || Math.abs(a.at - target) - Math.abs(b.at - target));
    return pool[0].at;
  }

  const space = line.lastIndexOf(" ", max);
  return space >= 8 ? space : -1;
}
