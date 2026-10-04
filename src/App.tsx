import { useEffect, useMemo, useRef, useState } from "react";
import { buildProPresenterFile, chooseFontSize, screenGeometry } from "./export/propresenter";
import { Filmstrip } from "./Filmstrip";
import { kindFromName, newId, parseLyrics, shapeSlides, type LyricSection, type LyricSlide } from "./lyrics/parse";
import { locateSlide, presentSlides } from "./present";
import { Stage } from "./Stage";

const MIN_SCALE = 0.7;
const MAX_SCALE = 1.4;

export function App() {
  const [raw, setRaw] = useState("");
  const [songName, setSongName] = useState("");
  const [ready, setReady] = useState(false);
  const [beenReady, setBeenReady] = useState(false);
  const [override, setOverride] = useState<LyricSection[] | null>(null);
  const [past, setPast] = useState<LyricSection[][]>([]);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [fontScale, setFontScale] = useState(1);
  const [linesPerSlide, setLinesPerSlide] = useState(1);
  const [linesField, setLinesField] = useState("1");
  const [stripParentheses, setStripParentheses] = useState(false);
  const [downloadNote, setDownloadNote] = useState("");
  const [error, setError] = useState("");
  const gesture = useRef<LyricSection[] | null>(null);
  const indexRef = useRef(0);

  const parsed = useMemo(() => parseLyrics(raw, "phrase"), [raw]);
  const shaped = useMemo(
    () => shapeSlides(parsed.sections, { linesPerSlide, stripParentheses }),
    [parsed.sections, linesPerSlide, stripParentheses],
  );
  const sections = override ?? shaped.sections;
  const slides = useMemo(
    () => presentSlides({ sections, includeTitle: false, title: "", artist: "" }),
    [sections],
  );
  const selectedIndex = Math.max(0, slides.findIndex((slide) => slide.key === selectedKey));
  const selected = slides[selectedIndex] ?? null;
  const selectedText = selected?.lines.join("\n") ?? "";
  const geometry = screenGeometry("1080");
  const fontSize = chooseFontSize(
    sections.flatMap((section) => section.slides.flatMap((slide) => slide.lines)),
    geometry.width,
    geometry.height,
    geometry.padding,
  );
  const located = selected?.slideId ? locateSlide(sections, selected.slideId) : null;
  const atStart = !located || (located.sectionIndex === 0 && located.slideIndex === 0);
  const atEnd =
    !located ||
    (located.sectionIndex === sections.length - 1 &&
      located.slideIndex === located.section.slides.length - 1);

  if (selectedKey && slides.some((slide) => slide.key === selectedKey)) {
    indexRef.current = selectedIndex;
  }

  useEffect(() => {
    if (slides.length === 0) {
      setSelectedKey(null);
      return;
    }
    if (!selectedKey || !slides.some((slide) => slide.key === selectedKey)) {
      const index = Math.min(slides.length - 1, Math.max(0, indexRef.current));
      setSelectedKey(slides[index].key);
    }
  }, [slides, selectedKey]);

  useEffect(() => {
    setDraft(selectedText);
  }, [selected?.key, selectedText]);

  useEffect(() => {
    const active = document.activeElement;
    const editing = active?.id === "line-editor" || active?.id === "section-name";
    gesture.current = editing ? cloneSections(sections) : null;
  }, [selected?.key]);

  useEffect(() => {
    if (!ready) return;
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const tag = target?.tagName;
      const typing = tag === "INPUT" || tag === "TEXTAREA" || target?.isContentEditable;
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z" && !typing) {
        event.preventDefault();
        undo();
        return;
      }
      if (typing) return;
      if (event.key === "ArrowRight") {
        event.preventDefault();
        step(1);
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        step(-1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  function remember() {
    setPast((items) => [...items.slice(-29), cloneSections(sections)]);
  }

  function onEditFocus() {
    if (!gesture.current) gesture.current = cloneSections(sections);
  }

  function onEditBlur() {
    gesture.current = null;
  }

  function takeGesture() {
    const shot = gesture.current;
    if (!shot) return;
    gesture.current = null;
    setPast((items) => [...items.slice(-29), shot]);
  }

  function undo() {
    const previous = past[past.length - 1];
    if (!previous) return;
    gesture.current = cloneSections(previous);
    setOverride(previous);
    setPast((items) => items.slice(0, -1));
  }

  function step(direction: 1 | -1) {
    if (slides.length === 0) return;
    const next = Math.min(slides.length - 1, Math.max(0, selectedIndex + direction));
    setSelectedKey(slides[next].key);
  }

  function changeLines(next: number) {
    const size = Math.max(1, Math.min(12, Math.round(next) || 1));
    setLinesField(String(size));
    if (size === linesPerSlide) return;
    if (override) remember();
    setLinesPerSlide(size);
    setOverride(null);
    setDownloadNote("");
  }

  function toggleParentheses() {
    if (override) remember();
    setStripParentheses((current) => !current);
    setOverride(null);
    setDownloadNote("");
  }

  function bumpScale(delta: number) {
    setFontScale((current) => {
      const next = Math.round(Math.min(MAX_SCALE, Math.max(MIN_SCALE, current + delta)) * 10) / 10;
      return next;
    });
  }

  function makeSlides() {
    const result = parseLyrics(raw, "phrase");
    if (!raw.trim() || result.sections.length === 0) {
      setError("Paste the lyrics first.");
      return;
    }
    setOverride(null);
    setPast([]);
    setError("");
    setDownloadNote("");
    if (!songName.trim() && result.detected.title) setSongName(result.detected.title);
    setBeenReady(true);
    setReady(true);
  }

  function writeLine(value: string) {
    if (!located) return;
    takeGesture();
    setDraft(value);
    const next = cloneSections(sections);
    const section = next[located.sectionIndex];
    if (!section) return;
    section.slides[located.slideIndex].lines = value.split("\n");
    setOverride(next);
  }

  function onLinePaste(event: React.ClipboardEvent<HTMLInputElement>) {
    const text = event.clipboardData.getData("text");
    if (!/[\r\n]/.test(text) || !located) return;
    event.preventDefault();
    const input = event.currentTarget;
    const start = input.selectionStart ?? draft.length;
    const end = input.selectionEnd ?? draft.length;
    const merged = `${draft.slice(0, start)}${text}${draft.slice(end)}`;
    const lines = merged
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    if (lines.length === 0) {
      writeLine("");
      return;
    }
    if (lines.length === 1) {
      writeLine(lines[0]);
      return;
    }
    remember();
    const next = cloneSections(sections);
    const section = next[located.sectionIndex];
    section.slides[located.slideIndex].lines = [lines[0]];
    const created = lines.slice(1).map((line) => ({ id: newId(), lines: [line] }));
    section.slides.splice(located.slideIndex + 1, 0, ...created);
    setOverride(next);
    setDraft(lines[0]);
  }

  function addLine() {
    remember();
    const slide: LyricSlide = { id: newId(), lines: [""] };
    if (!located) {
      setOverride([{ id: newId(), name: "Verse 1", kind: "verse", slides: [slide] }]);
    } else {
      const next = cloneSections(sections);
      next[located.sectionIndex].slides.splice(located.slideIndex + 1, 0, slide);
      setOverride(next);
    }
    setSelectedKey(slide.id);
    window.setTimeout(() => document.getElementById("line-editor")?.focus(), 0);
  }

  function removeSlide() {
    if (!located || slides.length === 0) return;
    const neighbor = slides[selectedIndex + 1]?.key ?? slides[selectedIndex - 1]?.key ?? null;
    remember();
    const next = cloneSections(sections);
    next[located.sectionIndex].slides.splice(located.slideIndex, 1);
    if (next[located.sectionIndex].slides.length === 0) next.splice(located.sectionIndex, 1);
    setOverride(next);
    setSelectedKey(neighbor);
  }

  function moveSlide(direction: 1 | -1) {
    if (!located) return;
    if (direction < 0 && atStart) return;
    if (direction > 0 && atEnd) return;
    remember();
    const next = cloneSections(sections);
    const section = next[located.sectionIndex];
    const target = located.slideIndex + direction;
    if (target >= 0 && target < section.slides.length) {
      const [slide] = section.slides.splice(located.slideIndex, 1);
      section.slides.splice(target, 0, slide);
    } else if (direction < 0) {
      const [slide] = section.slides.splice(located.slideIndex, 1);
      next[located.sectionIndex - 1].slides.push(slide);
      if (section.slides.length === 0) next.splice(located.sectionIndex, 1);
    } else {
      const [slide] = section.slides.splice(located.slideIndex, 1);
      next[located.sectionIndex + 1].slides.unshift(slide);
      if (section.slides.length === 0) next.splice(located.sectionIndex, 1);
    }
    setOverride(next);
  }

  function renameSection(name: string) {
    if (!located) return;
    takeGesture();
    const next = cloneSections(sections);
    next[located.sectionIndex].name = name;
    next[located.sectionIndex].kind = kindFromName(name);
    setOverride(next);
  }

  function newSection() {
    if (!located || located.slideIndex === 0) return;
    remember();
    const next = cloneSections(sections);
    const section = next[located.sectionIndex];
    const moving = section.slides.splice(located.slideIndex);
    next.splice(located.sectionIndex + 1, 0, {
      id: newId(),
      name: "New section",
      kind: "other",
      slides: moving,
    });
    setOverride(next);
    window.setTimeout(() => {
      const field = document.getElementById("section-name") as HTMLInputElement | null;
      field?.focus();
      field?.select();
    }, 0);
  }

  function download() {
    try {
      const trimmed = sections
        .map((section) => ({
          ...section,
          name: section.name.trim() || "Section",
          slides: section.slides.map((slide) => ({
            ...slide,
            lines: slide.lines.map((line) => line.trim()).filter(Boolean),
          })),
        }))
        .filter((section) => section.slides.length > 0);
      const xml = buildProPresenterFile({
        title: songName,
        artist: "",
        author: "",
        ccli: "",
        year: "",
        publisher: "",
        fontName: "Arial",
        screen: "1080",
        includeTitle: false,
        fontScale,
        sections: trimmed,
      });
      const name = `${safeFileName(songName)}.pro6`;
      const blob = new Blob([xml], { type: "application/xml" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = name;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      setError("");
      setDownloadNote(name);
    } catch (caught) {
      setDownloadNote("");
      setError(caught instanceof Error ? caught.message : "Could not build the ProPresenter file.");
    }
  }

  if (!ready) {
    return (
      <div className="shell start-shell">
        <main className="start">
          <h1>Paste the lyrics.</h1>
          <SlideOptions
            linesField={linesField}
            linesPerSlide={linesPerSlide}
            stripParentheses={stripParentheses}
            onField={setLinesField}
            onLines={changeLines}
            onToggle={toggleParentheses}
          />
          <textarea
            className="start-box"
            value={raw}
            autoFocus
            spellCheck
            aria-label="Lyrics"
            placeholder="Paste lyrics here"
            onChange={(event) => {
              setRaw(event.target.value);
              if (error) setError("");
            }}
            onKeyDown={(event) => {
              if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
                event.preventDefault();
                makeSlides();
              }
            }}
          />
          <div className="start-actions">
            <button type="button" className="primary" onClick={makeSlides}>
              Make slides
            </button>
            {beenReady ? (
              <button type="button" className="ghost" onClick={() => setReady(true)}>
                Back to slides
              </button>
            ) : null}
          </div>
          {error ? <p className="error">{error}</p> : null}
        </main>
      </div>
    );
  }

  return (
    <div className="shell">
      <main className="result">
        <header className="topbar">
          <div className="brand-row">
            <p className="brand">Praise Slides</p>
            <button
              type="button"
              className="text-button"
              onClick={() => {
                setReady(false);
                setDownloadNote("");
                setError("");
              }}
            >
              Lyrics
            </button>
          </div>
          <input
            className="song-title"
            aria-label="Song name"
            value={songName}
            placeholder="Song name"
            autoComplete="off"
            onChange={(event) => setSongName(event.target.value)}
          />
          <button type="button" className="primary" onClick={download} disabled={sections.length === 0}>
            Download
          </button>
        </header>

        <Stage
          sectionName={selected?.sectionName ?? ""}
          kind={selected?.kind ?? "other"}
          lines={selected?.lines ?? []}
          fontFamily="Arial, Helvetica, sans-serif"
          fontRatio={(fontSize * fontScale) / geometry.height}
          index={selected ? selectedIndex : 0}
          total={slides.length}
          empty={!selected}
        />

        <div className="toolbar">
          <div className="cluster">
            <button type="button" className="icon-button" aria-label="Previous slide" onClick={() => step(-1)} disabled={atStart}>
              ←
            </button>
            <span className="count">
              {slides.length === 0 ? "0" : selectedIndex + 1} / {slides.length}
            </span>
            <button type="button" className="icon-button" aria-label="Next slide" onClick={() => step(1)} disabled={atEnd}>
              →
            </button>
          </div>
          <div className="cluster">
            <span className="size-label">Text</span>
            <button type="button" className="icon-button" aria-label="Smaller text" onClick={() => bumpScale(-0.1)} disabled={fontScale <= MIN_SCALE}>
              −
            </button>
            <span className="percent">{Math.round(fontScale * 100)}%</span>
            <button type="button" className="icon-button" aria-label="Larger text" onClick={() => bumpScale(0.1)} disabled={fontScale >= MAX_SCALE}>
              +
            </button>
            <button type="button" className="ghost" onClick={() => setFontScale(1)} disabled={fontScale === 1}>
              Fit
            </button>
            <button type="button" className="ghost" onClick={undo} disabled={past.length === 0}>
              Undo
            </button>
          </div>
        </div>

        <SlideOptions
          linesField={linesField}
          linesPerSlide={linesPerSlide}
          stripParentheses={stripParentheses}
          onField={setLinesField}
          onLines={changeLines}
          onToggle={toggleParentheses}
        />

        <Filmstrip sections={sections} selectedKey={selected?.key ?? selectedKey} onSelect={setSelectedKey} />

        <section className="editor" aria-label="Edit this slide">
          {located ? (
            <label className="section-field">
              Section
              <input
                id="section-name"
                className="section-input"
                value={located.section.name}
                spellCheck={false}
                onFocus={onEditFocus}
                onBlur={onEditBlur}
                onChange={(event) => renameSection(event.target.value)}
              />
            </label>
          ) : null}
          {located ? (
            linesPerSlide > 1 ? (
              <textarea
                id="line-editor"
                className="line-box"
                aria-label="This slide"
                value={draft}
                placeholder="Type the lines"
                rows={Math.min(8, Math.max(2, draft.split("\n").length))}
                spellCheck
                onFocus={onEditFocus}
                onBlur={onEditBlur}
                onChange={(event) => writeLine(event.target.value)}
              />
            ) : (
              <input
                id="line-editor"
                className="line-input"
                aria-label="This line"
                value={draft}
                placeholder="Type the line"
                spellCheck
                onFocus={onEditFocus}
                onBlur={onEditBlur}
                onChange={(event) => writeLine(event.target.value)}
                onPaste={onLinePaste}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    if (atEnd) addLine();
                    else step(1);
                  } else if (event.key === "Backspace" && draft === "" && slides.length > 1) {
                    event.preventDefault();
                    removeSlide();
                  }
                }}
              />
            )
          ) : (
            <p className="footnote">This song has no lines.</p>
          )}
          <div className="actions-row">
            <button type="button" className="ghost" onClick={addLine}>
              Add a line
            </button>
            <button type="button" className="ghost" onClick={newSection} disabled={!located || located.slideIndex === 0}>
              New section
            </button>
            <button type="button" className="ghost" onClick={() => moveSlide(-1)} disabled={atStart}>
              Move earlier
            </button>
            <button type="button" className="ghost" onClick={() => moveSlide(1)} disabled={atEnd}>
              Move later
            </button>
            <button type="button" className="text-button danger" onClick={removeSlide} disabled={!located}>
              Remove
            </button>
          </div>
        </section>

        {error ? <p className="error">{error}</p> : null}
        <p className="footnote">
          {downloadNote ? `Saved ${downloadNote}. ` : ""}
          {parsed.chordsRemoved > 0 ? "Chord names were left off. " : ""}
          {stripParentheses && shaped.parenthesesRemoved > 0 ? "Words in parentheses were left off. " : ""}
          Drag the file into your ProPresenter library. ProPresenter 6 and 7 both open it.
        </p>
      </main>
    </div>
  );
}

function SlideOptions({
  linesField,
  linesPerSlide,
  stripParentheses,
  onField,
  onLines,
  onToggle,
}: {
  linesField: string;
  linesPerSlide: number;
  stripParentheses: boolean;
  onField: (value: string) => void;
  onLines: (value: number) => void;
  onToggle: () => void;
}) {
  return (
    <div className="options">
      <div className="cluster">
        <span className="size-label">Lines per slide</span>
        <button
          type="button"
          className="icon-button"
          aria-label="Fewer lines per slide"
          onClick={() => onLines(linesPerSlide - 1)}
          disabled={linesPerSlide <= 1}
        >
          −
        </button>
        <input
          className="count-input"
          aria-label="Lines per slide"
          inputMode="numeric"
          value={linesField}
          onChange={(event) => onField(event.target.value.replace(/[^\d]/g, "").slice(0, 2))}
          onBlur={(event) => onLines(Number(event.currentTarget.value))}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              onLines(Number(event.currentTarget.value));
              event.currentTarget.blur();
            }
          }}
        />
        <button
          type="button"
          className="icon-button"
          aria-label="More lines per slide"
          onClick={() => onLines(linesPerSlide + 1)}
          disabled={linesPerSlide >= 12}
        >
          +
        </button>
      </div>
      <button type="button" className="ghost" aria-pressed={stripParentheses} onClick={onToggle}>
        Remove (parentheses)
      </button>
    </div>
  );
}

function cloneSections(sections: LyricSection[]): LyricSection[] {
  return sections.map((section) => ({
    ...section,
    slides: section.slides.map((slide) => ({ ...slide, lines: [...slide.lines] })),
  }));
}

function safeFileName(title: string): string {
  const cleaned = title.replace(/[<>:"/\\|?*]/g, "").replace(/\s+/g, " ").trim();
  return cleaned || "song";
}
