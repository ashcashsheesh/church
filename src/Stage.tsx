import { SECTION_STYLE, type SectionKind } from "./lyrics/parse";

type StageProps = {
  sectionName: string;
  kind: SectionKind;
  lines: string[];
  fontFamily: string;
  fontRatio: number;
  index: number;
  total: number;
  empty: boolean;
};

export function Stage({ sectionName, kind, lines, fontFamily, fontRatio, index, total, empty }: StageProps) {
  const color = SECTION_STYLE[kind].hex;
  const text = lines.map((line) => line.trim());
  const blank = !empty && text.every((line) => !line);

  return (
    <div
      className="stage"
      style={{ "--font-ratio": String(fontRatio), "--section": color } as React.CSSProperties}
    >
      {empty ? (
        <div className="stage-empty">
          <p className="stage-hold">No lines yet</p>
        </div>
      ) : (
        <div key={`${sectionName}-${index}-${lines.join("|")}`} className="stage-lyric">
          <p className="stage-kicker">{sectionName}</p>
          {blank ? (
            <p className="stage-hold">New line</p>
          ) : (
            <p className="stage-lines" style={{ fontFamily }}>
              {text.map((line, lineIndex) => (
                <span key={`${lineIndex}-${line}`}>{line || "\u00a0"}</span>
              ))}
            </p>
          )}
          <p className="stage-count">
            {index + 1} <span>of</span> {total}
          </p>
        </div>
      )}
    </div>
  );
}
