import type { LyricSection, SectionKind } from "./lyrics/parse";

export type PresentSlide = {
  key: string;
  sectionName: string;
  kind: SectionKind;
  lines: string[];
  label?: string;
  sectionId?: string;
  slideId?: string;
};

export function presentSlides(input: {
  sections: LyricSection[];
  includeTitle: boolean;
  title: string;
  artist: string;
}): PresentSlide[] {
  const slides: PresentSlide[] = [];
  const title = input.title.trim();
  if (input.includeTitle && title) {
    slides.push({
      key: "title",
      sectionName: "Title",
      kind: "title",
      lines: [title, input.artist.trim()].filter(Boolean),
    });
  }

  for (const section of input.sections) {
    for (const slide of section.slides) {
      slides.push({
        key: slide.id,
        sectionName: section.name,
        kind: section.kind,
        lines: slide.lines,
        label: slide.label,
        sectionId: section.id,
        slideId: slide.id,
      });
    }
  }
  return slides;
}

export function locateSlide(sections: LyricSection[], slideId: string) {
  for (let sectionIndex = 0; sectionIndex < sections.length; sectionIndex += 1) {
    const section = sections[sectionIndex];
    const slideIndex = section.slides.findIndex((slide) => slide.id === slideId);
    if (slideIndex >= 0) {
      return { section, slide: section.slides[slideIndex], sectionIndex, slideIndex };
    }
  }
  return null;
}
