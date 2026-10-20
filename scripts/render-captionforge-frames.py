import json
import os
import sys
from pathlib import Path
from typing import Optional

from PIL import Image, ImageDraw, ImageFont


output_directory = Path(sys.argv[1]).resolve()
segments_path = Path(sys.argv[2])
audio_duration = float(sys.argv[3])
caption_fps = float(sys.argv[4]) if len(sys.argv) > 4 else 60.0
frames_directory = output_directory / "caption-frames"
frames_directory.mkdir(parents=True, exist_ok=True)

font_path = "/System/Library/Fonts/Supplemental/Arial Black.ttf"
font_size = 92
stroke_width = 7
font_cache: dict[int, ImageFont.FreeTypeFont] = {}


def get_font(size: int) -> ImageFont.FreeTypeFont:
    safe_size = max(1, int(size))
    if safe_size not in font_cache:
        font_cache[safe_size] = ImageFont.truetype(font_path, safe_size)
    return font_cache[safe_size]


font = get_font(font_size)

with segments_path.open("r", encoding="utf-8") as handle:
    segments_payload = json.load(handle)
if isinstance(segments_payload, list):
    segments = segments_payload
elif isinstance(segments_payload, dict) and isinstance(segments_payload.get("segments"), list):
    segments = segments_payload["segments"]
else:
    raise ValueError("Il file dei segmenti deve contenere una lista oppure un oggetto con il campo 'segments'")


def wrap_words(words: list[str], draw: ImageDraw.ImageDraw, max_width: int, active_font: ImageFont.FreeTypeFont) -> list[list[str]]:
    lines: list[list[str]] = []
    current: list[str] = []
    for word in words:
        candidate = " ".join(current + [word])
        if current and draw.textbbox((0, 0), candidate, font=active_font)[2] > max_width:
            lines.append(current)
            current = [word]
        else:
            current.append(word)
    if current:
        lines.append(current)
    return lines


def render_frame(frame_index: int, words: list[str], active_index: Optional[int] = None, pop: bool = False, scale: float = 1.0) -> Path:
    image = Image.new("RGBA", (1080, 560), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    active_font = get_font(round(font_size * scale))
    active_stroke_width = max(1, round(stroke_width * scale))
    lines = wrap_words(words, draw, 900, active_font)

    word_index = 0
    line_height = max(1, round(104 * scale))
    total_height = line_height * len(lines)
    y = (560 - total_height) // 2
    for line in lines:
        widths = []
        for word in line:
            word_font = active_font
            widths.append(draw.textbbox((0, 0), word, font=word_font, stroke_width=active_stroke_width)[2])
            word_index += 1
        spaces = [draw.textbbox((0, 0), " ", font=active_font)[2]] * max(0, len(line) - 1)
        line_width = sum(widths) + sum(spaces)
        x = (1080 - line_width) // 2
        word_index -= len(line)
        for token_index, word in enumerate(line):
            word_font = active_font
            color = (255, 255, 255, 255)
            word_y = y
            draw.text(
                (x, word_y),
                word,
                font=word_font,
                fill=color,
                stroke_width=active_stroke_width,
                stroke_fill=(0, 0, 0, 255),
            )
            x += widths[token_index]
            if token_index < len(line) - 1:
                x += spaces[token_index]
            word_index += 1
        y += line_height

    frame_path = frames_directory / f"caption-{frame_index:04d}.png"
    image.save(frame_path)
    return frame_path


blank_path = frames_directory / "blank.png"
if not blank_path.exists():
    Image.new("RGBA", (1080, 560), (0, 0, 0, 0)).save(blank_path)

events: list[tuple[float, float, Path]] = []
frame_index = 0
cursor = 0.0
for segment in segments:
    start = float(segment["start"])
    end = float(segment["end"])
    if start > cursor:
        events.append((cursor, start, blank_path))

    words_data = segment.get("words") or []
    words = [str(word["text"]).strip() for word in words_data if str(word["text"]).strip()]
    if not words:
        words = str(segment.get("text", "")).strip().split()
        frame_path = render_frame(frame_index, words)
        frame_index += 1
        events.append((start, end, frame_path))
    else:
        for word_index, word in enumerate(words_data):
            word_start = max(start, float(word["start"]))
            next_start = end
            if word_index + 1 < len(words_data):
                next_start = min(end, float(words_data[word_index + 1]["start"]))
            if next_start <= word_start:
                continue
            pop_end = min(next_start, word_start + 0.14)
            pop_duration = max(0.01, pop_end - word_start)
            pop_frame_count = max(1, round(pop_duration * caption_fps))
            pop_scales = (0.86, 0.94, 1.02, 1.10, 1.14, 1.10, 1.04, 1.0)
            frame_duration = pop_duration / pop_frame_count
            for pop_frame_index in range(pop_frame_count):
                scale_index = min(len(pop_scales) - 1, round(pop_frame_index * (len(pop_scales) - 1) / max(1, pop_frame_count - 1)))
                pop_frame_path = render_frame(frame_index, [words[word_index]], 0, pop=True, scale=pop_scales[scale_index])
                frame_index += 1
                frame_start = word_start + pop_frame_index * frame_duration
                events.append((frame_start, frame_start + frame_duration, pop_frame_path))
            if next_start > pop_end:
                steady_frame_path = render_frame(frame_index, [words[word_index]], 0, pop=False)
                frame_index += 1
                events.append((pop_end, next_start, steady_frame_path))

    cursor = end

if cursor < audio_duration:
    events.append((cursor, audio_duration, blank_path))

list_path = output_directory / "caption-overlay.txt"
with list_path.open("w", encoding="utf-8") as handle:
    for start, end, frame_path in events:
        duration = max(0.01, end - start)
        handle.write(f"file '{frame_path}'\n")
        handle.write(f"duration {duration:.6f}\n")
    if events:
        handle.write(f"file '{events[-1][2]}'\n")

print(json.dumps({"frames": frame_index, "events": len(events), "list": str(list_path)}))
