import { useEffect, type CSSProperties } from "react";
import { SECTION_STYLE, type LyricSection } from "./lyrics/parse";

type FilmstripProps = {
  sections: LyricSection[];
  selectedKey: string | null;
  onSelect: (key: string) => void;
};

export function Filmstrip({ sections, selectedKey, onSelect }: FilmstripProps) {
  useEffect(() => {
    if (!selectedKey) return;
    const card = document.getElementById(`slide-${selectedKey}`);
    const strip = card?.closest(".filmstrip");
    if (!card || !strip) return;
    const delta = card.getBoundingClientRect().left - strip.getBoundingClientRect().left;
    const left = strip.scrollLeft + delta - strip.clientWidth / 2 + card.clientWidth / 2;
    strip.scrollTo({ left, behavior: "smooth" });
  }, [selectedKey]);

  if (sections.length === 0) return null;

  let number = 0;

  return (
    <div className="filmstrip" aria-label="Slides">
      {sections.map((section) => (
        <div key={section.id} className="group" style={{ "--group": SECTION_STYLE[section.kind].hex } as CSSProperties}>
          <p className="group-name">{section.name}</p>
          <div className="cards">
            {section.slides.map((slide) => {
              number += 1;
              const text = slide.lines.join("\n").trim();
              return (
                <button
                  key={slide.id}
                  type="button"
                  id={`slide-${slide.id}`}
                  className="card"
                  aria-pressed={selectedKey === slide.id}
                  onClick={() => onSelect(slide.id)}
                >
                  <span className="card-index">{number}</span>
                  {text || <span className="card-blank">New line</span>}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
