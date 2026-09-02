import { describe, expect, it } from "vitest";
import { createSubtitleCues, renderAss } from "./index.js";

describe("ASS subtitle presets", () => {
  it("wraps captions and keeps configured safe-zone margins", () => {
    const cues = createSubtitleCues([{ start: 0, end: 2, text: "one two three four five six seven eight" }], { maxWordsPerLine: 4 });
    expect(cues[0]?.text).toContain("one two three four\neight".replace("eight", "five"));
    expect(renderAss(cues, { preset: "dynamic", safeMargin: 200 })).toContain("Arial,70");
    expect(renderAss(cues, { preset: "dynamic", safeMargin: 200 })).toContain(",200,200,200,1");
  });
});
