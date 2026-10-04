import { describe, expect, it } from "vitest";
import { buildProPresenterFile, chooseFontSize, plainSlideText } from "../export/propresenter";
import { parseLyrics } from "../lyrics/parse";
import { SAMPLE_LYRICS } from "../lyrics/sample";

describe("buildProPresenterFile", () => {
  it("writes a ProPresenter 6 song with the lyrics and none of the chords", () => {
    const parsed = parseLyrics(SAMPLE_LYRICS, "phrase");
    const xml = buildProPresenterFile({
      title: "Amazing Grace",
      artist: "",
      author: "John Newton",
      ccli: "",
      year: "1779",
      publisher: "Public Domain",
      fontName: "Arial",
      screen: "1080",
      includeTitle: true,
      sections: parsed.sections,
    });

    expect(xml).toContain("<RVPresentationDocument");
    expect(xml).toContain('name="Verse 1"');
    expect(xml).toContain('name="Title"');
    expect(xml).toContain('CCLISongTitle="Amazing Grace"');
    expect(xml).toContain('height="1080"');
    expect(xml).toContain('width="1920"');

    const slides = plainSlideText(xml);
    expect(slides[0]).toBe("Amazing Grace");
    expect(slides).toContain("Amazing grace! How sweet the sound");
    expect(slides.some((slide) => slide.includes("G7"))).toBe(false);
    expect(slides.filter((slide) => slide.length > 0)).toHaveLength(1 + 12);

    const rtf = decode(xml.match(/rvXMLIvarName="RTFData">\s*([^<]+)/)?.[1] ?? "");
    expect(rtf).toContain("\\b");
  });

  it("keeps an ampersand in the lyric text", () => {
    const parsed = parseLyrics("[Chorus]\nGrace & mercy", "phrase");
    const xml = buildProPresenterFile({
      title: "Grace",
      artist: "",
      author: "",
      ccli: "1234567",
      year: "",
      publisher: "",
      fontName: "Arial",
      screen: "720",
      includeTitle: false,
      sections: parsed.sections,
    });
    expect(plainSlideText(xml)).toContain("Grace & mercy");
    expect(xml).toContain('CCLISongNumber="1234567"');
    expect(xml).toContain('CCLIDisplay="true"');
  });

  it("uses a smaller font when a line is long", () => {
    const wide = chooseFontSize(["Amazing grace"], 1920, 1080, 96);
    const narrow = chooseFontSize(["Amazing grace how sweet the sound that saved a wretch"], 1920, 1080, 96);
    expect(narrow).toBeLessThan(wide);
    expect(wide).toBeLessThanOrEqual(96);
    expect(narrow).toBeGreaterThanOrEqual(40);
  });
});

function decode(value: string): string {
  const binary = atob(value.replace(/\s+/g, ""));
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}
