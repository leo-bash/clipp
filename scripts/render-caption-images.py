import json
import os
import sys

from PIL import Image, ImageDraw, ImageFont

output_directory = sys.argv[1]
captions_path = sys.argv[2]
font_path = "/System/Library/Fonts/Supplemental/Arial.ttf"
font = ImageFont.truetype(font_path, 58)

with open(captions_path, "r", encoding="utf-8") as handle:
    captions = json.load(handle)

for index, caption in enumerate(captions):
    image = Image.new("RGBA", (1080, 560), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    text = caption[2]
    max_width = 900
    words = text.split()
    lines = []
    current = ""
    for word in words:
        candidate = f"{current} {word}".strip()
        if draw.textbbox((0, 0), candidate, font=font)[2] <= max_width:
            current = candidate
        else:
            lines.append(current)
            current = word
    if current:
        lines.append(current)
    line_height = 72
    box_height = line_height * len(lines) + 52
    top = (560 - box_height) // 2
    draw.rounded_rectangle((44, top, 1036, top + box_height), radius=24, fill=(7, 16, 31, 224))
    draw.rounded_rectangle((44, top, 58, top + box_height), radius=7, fill=(255, 196, 61, 255))
    y = top + 26
    for line in lines:
        width = draw.textbbox((0, 0), line, font=font)[2]
        draw.text(((1080 - width) // 2, y), line, font=font, fill=(255, 255, 255, 255), stroke_width=1, stroke_fill=(7, 16, 31, 255))
        y += line_height
    image.save(os.path.join(output_directory, f"caption-{index:02d}.png"))
