import { describe, expect, it } from "vitest";
import { SAMPLE_LYRICS } from "./sample";
import {
  isChordToken,
  kindFromName,
  parseLyrics,
  shapeSlides,
  splitLongLine,
  splitSlideLines,
  suggestLayout,
  stripParentheticals,
} from "./parse";

function view(raw: string, layout: "phrase" | "couplet" | "written" = "phrase") {
  const result = parseLyrics(raw, layout);
  return {
    chordsRemoved: result.chordsRemoved,
    inventedStructure: result.inventedStructure,
    detected: result.detected,
    sections: result.sections.map((section) => ({
      name: section.name,
      kind: section.kind,
      slides: section.slides.map((slide) => ({
        lines: slide.lines,
        label: slide.label ?? null,
      })),
    })),
  };
}

describe("parseLyrics", () => {
  it("turns a chord chart into one slide per lyric line", () => {
    const parsed = view(SAMPLE_LYRICS);
    expect(parsed.chordsRemoved).toBeGreaterThan(0);
    expect(parsed.sections.map((section) => section.name)).toEqual(["Verse 1", "Verse 2", "Verse 3"]);
    expect(parsed.sections[0].slides.map((slide) => slide.lines)).toEqual([
      ["Amazing grace! How sweet the sound"],
      ["That saved a wretch like me!"],
      ["I once was lost, but now am found;"],
      ["Was blind, but now I see."],
    ]);
    const lines = parsed.sections.flatMap((section) => section.slides.flatMap((slide) => slide.lines));
    expect(lines.some((line) => /\bG7\b/.test(line))).toBe(false);
  });

  it("removes parenthetical asides and keeps section names", () => {
    const parsed = parseLyrics("[Chorus (x2)]\nWorthy is the Lamb (echo)\n(oh)\nThat was slain", "phrase");
    const shaped = shapeSlides(parsed.sections, { linesPerSlide: 1, stripParentheses: true });
    expect(shaped.parenthesesRemoved).toBe(2);
    expect(shaped.sections[0].name).toBe("Chorus (x2)");
    expect(shaped.sections[0].slides.map((slide) => slide.lines)).toEqual([
      ["Worthy is the Lamb"],
      ["That was slain"],
    ]);
  });

  it("groups a chosen number of lines on each slide", () => {
    const parsed = parseLyrics("[Verse 1]\nOne\nTwo\nThree\n\n[Chorus]\nAh\nOh", "phrase");
    const shaped = shapeSlides(parsed.sections, { linesPerSlide: 2, stripParentheses: false });
    expect(shaped.sections.map((section) => section.slides.map((slide) => slide.lines))).toEqual([
      [["One", "Two"], ["Three"]],
      [["Ah", "Oh"]],
    ]);
    expect(stripParentheticals("Grace (see verse 1 (NIV)).")).toBe("Grace.");
  });

  it("pairs lines in couplet layout", () => {
    const parsed = view("[Verse 1]\nAmazing grace! How sweet the sound\nThat saved a wretch like me!\nI once was lost, but now am found;", "couplet");
    expect(parsed.sections[0].slides.map((slide) => slide.lines)).toEqual([
      ["Amazing grace! How sweet the sound", "That saved a wretch like me!"],
      ["I once was lost, but now am found;"],
    ]);
  });

  it("keeps blank lines as slide breaks when asked", () => {
    const raw = "[Chorus]\nHow great\nThou art\n\nThen sings my soul";
    expect(suggestLayout(raw)).toBe("written");
    const parsed = view(raw, "written");
    expect(parsed.sections[0].slides.map((slide) => slide.lines)).toEqual([
      ["How great", "Thou art"],
      ["Then sings my soul"],
    ]);
  });

  it("does not treat the blank line before the next section as a slide break", () => {
    const raw = "[Verse 1]\nLine one\nLine two\n\n[Chorus]\nOh praise";
    expect(suggestLayout(raw)).toBe("phrase");
  });

  it("names repeated bare verses", () => {
    const parsed = view("[Verse]\nAlpha\n\n[Verse]\nBeta");
    expect(parsed.sections.map((section) => section.name)).toEqual(["Verse 1", "Verse 2"]);
    expect(parsed.sections[0].kind).toBe("verse");
  });

  it("keeps repeated choruses under the same name", () => {
    const parsed = view("[Chorus]\nOne\n\n[Chorus]\nOne");
    expect(parsed.sections.map((section) => section.name)).toEqual(["Chorus", "Chorus"]);
  });

  it("reads short section labels and leaves a bare chord line off the screen", () => {
    const parsed = view("[V1]\nAlpha\n\n[C]\nBeta\n\nC\nGamma");
    expect(parsed.sections.map((section) => section.name)).toEqual(["Verse 1", "Chorus"]);
    expect(parsed.sections.flatMap((section) => section.slides.flatMap((slide) => slide.lines))).toEqual([
      "Alpha",
      "Beta",
      "Gamma",
    ]);
  });

  it("strips inline chords without eating section labels", () => {
    const parsed = view("[Verse 1]\nAmazing [G]grace how [C]sweet\nAm I a soldier of the cross");
    expect(parsed.sections[0].slides.map((slide) => slide.lines[0])).toEqual([
      "Amazing grace how sweet",
      "Am I a soldier of the cross",
    ]);
  });

  it("pulls SongSelect metadata off the slides", () => {
    const raw = `Amazing Grace\nJohn Newton, Chris Tomlin\n\nVerse 1\nHow sweet the sound\n\nCCLI Song # 4768151\n© 2006 sixsteps Music | worshiptogether.com songs\nFor use solely with the SongSelect Terms of Use. All rights reserved. www.ccli.com\nCCLI License # 99999`;
    const parsed = view(raw);
    expect(parsed.detected).toMatchObject({
      title: "Amazing Grace",
      author: "John Newton, Chris Tomlin",
      ccli: "4768151",
      year: "2006",
      publisher: "sixsteps Music",
    });
    expect(parsed.sections).toEqual([
      {
        name: "Verse 1",
        kind: "verse",
        slides: [{ lines: ["How sweet the sound"], label: null }],
      },
    ]);
  });

  it("turns a headerless song into verses and says so", () => {
    const parsed = view("First line\nSecond line\n\nThird line");
    expect(parsed.inventedStructure).toBe(true);
    expect(parsed.sections.map((section) => section.name)).toEqual(["Verse 1", "Verse 2"]);
    expect(parsed.sections[1].slides[0].lines).toEqual(["Third line"]);
  });

  it("keeps a chorus marker with a repeat note off the audience slide", () => {
    const parsed = view("[Chorus x2]\nWorthy is the Lamb\nx2");
    expect(parsed.sections[0].name).toBe("Chorus (x2)");
    expect(parsed.sections[0].slides.map((slide) => slide.lines)).toEqual([["Worthy is the Lamb"]]);
  });

  it("makes an empty intro a blank hold", () => {
    const parsed = view("[Intro]\n\n[Verse 1]\nHoly");
    expect(parsed.sections[0]).toMatchObject({
      name: "Intro",
      kind: "intro",
      slides: [{ lines: [], label: "Intro" }],
    });
  });

  it("reads a chordpro chorus", () => {
    const parsed = view("{title: Great Is Thy Faithfulness}\n{start_of_chorus}\nMorning by morning\n{end_of_chorus}");
    expect(parsed.detected.title).toBe("Great Is Thy Faithfulness");
    expect(parsed.sections[0].name).toBe("Chorus");
    expect(parsed.sections[0].slides[0].lines).toEqual(["Morning by morning"]);
  });

  it("splits a run-on line without dropping words", () => {
    const original =
      "Amazing grace how sweet the sound that saved a wretch like me I once was lost but now am found was blind but now I see";
    const parts = splitLongLine(original);
    expect(parts.length).toBeGreaterThan(1);
    expect(parts.join(" ").replace(/\s+/g, " ")).toBe(original);
    for (const part of parts) expect(part.length).toBeLessThanOrEqual(44);
  });

  it("leaves a normal lyric line intact", () => {
    expect(splitLongLine("'Tis grace hath brought me safe thus far,")).toEqual([
      "'Tis grace hath brought me safe thus far,",
    ]);
  });

  it("straightens curly apostrophes", () => {
    const parsed = view("[Verse 1]\nAmazing grace\u2019s sound");
    expect(parsed.sections[0].slides[0].lines).toEqual(["Amazing grace's sound"]);
  });

  it("splits a slide at a pause", () => {
    expect(splitSlideLines(["Was blind, but now I see."])).toEqual([["Was blind,"], ["but now I see."]]);
  });
});

describe("chords and section colors", () => {
  it("recognizes chart tokens", () => {
    for (const token of ["G", "G7", "G/B", "F#m", "Bb", "Dsus4", "Cmaj7", "Em", "N.C."]) {
      expect(isChordToken(token)).toBe(true);
    }
    expect(isChordToken("Amazing")).toBe(false);
    expect(isChordToken("Jesus")).toBe(false);
  });

  it("colors pre-chorus separately from chorus", () => {
    expect(kindFromName("Pre-Chorus")).toBe("prechorus");
    expect(kindFromName("Chorus (x2)")).toBe("chorus");
    expect(kindFromName("Channel")).toBe("chorus");
  });
});
