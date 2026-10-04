import { ProPresenter6Builder, type IPro6BuilderOptions } from "propresenter-parser";
import { SECTION_STYLE, type LyricSection } from "../lyrics/parse";

export type ScreenPreset = "1080" | "720";

const SCREENS: Record<ScreenPreset, { width: number; height: number; padding: number }> = {
  "1080": { width: 1920, height: 1080, padding: 96 },
  "720": { width: 1280, height: 720, padding: 64 },
};

const Dissolve = 0 as NonNullable<IPro6BuilderOptions["transitions"]>["type"];

export function chooseFontSize(lines: string[], width: number, height: number, padding: number): number {
  const usable = Math.max(200, width - padding * 2);
  const longest = Math.max(8, ...lines.filter(Boolean).map((line) => line.length));
  const byWidth = Math.floor(usable / (longest * 0.52));
  const cap = height >= 1000 ? 96 : 64;
  return Math.max(40, Math.min(cap, byWidth));
}

export function screenGeometry(preset: ScreenPreset) {
  return SCREENS[preset];
}

export function buildProPresenterFile(input: {
  title: string;
  artist: string;
  author: string;
  ccli: string;
  year: string;
  publisher: string;
  fontName: string;
  screen: ScreenPreset;
  includeTitle: boolean;
  fontScale?: number;
  sections: LyricSection[];
}): string {
  const screen = SCREENS[input.screen];
  const lyricLines = input.sections.flatMap((section) => section.slides.flatMap((slide) => slide.lines));
  const scale = input.fontScale ?? 1;
  const fontSize = Math.max(
    24,
    Math.min(140, Math.round(chooseFontSize(lyricLines, screen.width, screen.height, screen.padding) * scale)),
  );
  const songNumber = /^\d{4,8}$/.test(input.ccli.trim()) ? input.ccli.trim() : undefined;
  const year = /^\d{4}$/.test(input.year.trim()) ? Number(input.year.trim()) : undefined;
  const title = input.title.trim();
  const artist = input.artist.trim();
  const showCopyright = Boolean(songNumber || year || input.publisher.trim() || input.author.trim());

  const slideGroups: IPro6BuilderOptions["slideGroups"] = [];
  if (input.includeTitle && title) {
    slideGroups.push({
      label: "Title",
      groupColor: SECTION_STYLE.title.rgb,
      slides: [
        {
          text: [title, artist].filter(Boolean).join("\n"),
          label: artist,
        },
      ],
    });
  }

  for (const section of input.sections) {
    slideGroups.push({
      label: section.name.trim() || "Section",
      groupColor: SECTION_STYLE[section.kind].rgb,
      slides: section.slides.map((slide) => ({
        text: slide.lines.join("\n"),
        label: slide.label ?? (slide.lines.length === 0 ? section.name : ""),
      })),
    });
  }

  if (slideGroups.length === 0) {
    throw new Error("Add some lyrics before downloading.");
  }

  const xml = ProPresenter6Builder({
    properties: {
      CCLISongTitle: title || "Untitled",
      CCLIArtistCredits: artist,
      CCLIAuthor: input.author.trim(),
      CCLICopyrightYear: year,
      CCLIDisplay: showCopyright,
      CCLIPublisher: input.publisher.trim(),
      CCLISongNumber: songNumber,
      category: "Song",
      notes: "",
      height: screen.height,
      width: screen.width,
    },
    slideTextFormatting: {
      fontName: sanitizeFont(input.fontName),
      textColor: { r: 255, g: 255, b: 255 },
      textSize: fontSize,
      textPadding: screen.padding,
      textShadow: {
        enabled: true,
        angle: 135,
        color: { r: 0, g: 0, b: 0 },
        length: 4,
        radius: 12,
      },
    },
    transitions: {
      duration: 0.5,
      type: Dissolve,
    },
    slideGroups,
  });

  return boldLyrics(xml);
}

function sanitizeFont(fontName: string): string {
  const cleaned = fontName.replace(/[^\w\s-]/g, "").trim();
  return cleaned || "Arial";
}

function boldLyrics(xml: string): string {
  return xml.replace(/(rvXMLIvarName="RTFData">\s*)([^<]+)/g, (_match, prefix: string, encoded: string) => {
    const rtf = decodeBase64(encoded.replace(/\s+/g, ""));
    if (!rtf.includes("\\fs") || rtf.includes("\\b")) return `${prefix}${encoded}`;
    return `${prefix}${encodeBase64(rtf.replace("\\fs", "\\b\\fs"))}`;
  });
}

function encodeBase64(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function decodeBase64(value: string): string {
  const binary = atob(value);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

export function plainSlideText(xml: string): string[] {
  const encoded = [...xml.matchAll(/rvXMLIvarName="PlainText">\s*([^<]+)/g)].map((match) =>
    decodeBase64(match[1].replace(/\s+/g, "")),
  );
  return encoded;
}
