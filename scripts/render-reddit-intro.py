import sys
import textwrap
from pathlib import Path
from secrets import choice, randbelow

from PIL import Image, ImageDraw, ImageFont


output_directory = Path(sys.argv[1]).resolve()
hook = str(sys.argv[2]).strip()
title = str(sys.argv[3]).strip()
dark_theme = choice((False, True))
upvotes = 120 + randbelow(9_881)
comments = 12 + randbelow(689)

card_background = (35, 37, 39) if dark_theme else (255, 255, 255)
primary_text = (245, 247, 248) if dark_theme else (24, 32, 40)
secondary_text = (170, 183, 190) if dark_theme else (96, 113, 123)
shadow = (8, 10, 12) if dark_theme else (218, 222, 225)
reddit_orange = (255, 69, 0)
image = Image.new("RGBA", (1080, 1000), (0, 0, 0, 0))
draw = ImageDraw.Draw(image)


def load_font(size: int, bold: bool = False, emoji: bool = False):
    candidates = []
    if emoji:
        candidates.append("/System/Library/Fonts/Apple Color Emoji.ttc")
    candidates.extend([
        "/System/Library/Fonts/Supplemental/Arial Bold.ttf" if bold else "/System/Library/Fonts/Supplemental/Arial.ttf",
        "/System/Library/Fonts/Supplemental/Helvetica Bold.ttf" if bold else "/System/Library/Fonts/Supplemental/Helvetica.ttf",
    ])
    for candidate in candidates:
        if Path(candidate).exists():
            try:
                return ImageFont.truetype(candidate, size)
            except OSError:
                continue
    return ImageFont.load_default()


font_username = load_font(48, True)
font_title = load_font(54, True)
font_action = load_font(38)
font_share = load_font(38, True)

card_left, card_top, card_right, card_bottom = 32, 24, 1048, 976
draw.rounded_rectangle((card_left + 10, card_top + 16, card_right + 10, card_bottom + 16), radius=34, fill=shadow)
draw.rounded_rectangle((card_left, card_top, card_right, card_bottom), radius=34, fill=card_background)


def draw_reddit_avatar(center_x: int, center_y: int):
    draw.ellipse((center_x - 70, center_y - 70, center_x + 70, center_y + 70), fill=reddit_orange)
    draw.line((center_x + 18, center_y - 42, center_x + 34, center_y - 60), fill=(255, 255, 255), width=7)
    draw.ellipse((center_x + 26, center_y - 67, center_x + 47, center_y - 46), fill=(255, 255, 255))
    draw.ellipse((center_x - 48, center_y - 33, center_x + 48, center_y + 44), fill=(255, 255, 255))
    draw.ellipse((center_x - 26, center_y - 8, center_x - 10, center_y + 8), fill=reddit_orange)
    draw.ellipse((center_x + 10, center_y - 8, center_x + 26, center_y + 8), fill=reddit_orange)
    draw.arc((center_x - 29, center_y + 1, center_x + 29, center_y + 37), 15, 165, fill=reddit_orange, width=6)
    draw.ellipse((center_x - 69, center_y - 8, center_x - 51, center_y + 10), fill=(255, 255, 255))
    draw.ellipse((center_x + 51, center_y - 8, center_x + 69, center_y + 10), fill=(255, 255, 255))


avatar_center = (card_left + 108, card_top + 108)
draw_reddit_avatar(*avatar_center)
draw.text((card_left + 220, card_top + 61), "ScrollTales", font=font_username, fill=primary_text)

def draw_badge_row(start_x: int, center_y: int):
    colors = [(63, 136, 197), (18, 156, 124), (235, 185, 35), (210, 139, 51), (144, 105, 196), (170, 177, 184), (226, 173, 45), (41, 133, 194), (150, 150, 150), (241, 136, 39)]
    for index, color in enumerate(colors):
        x = start_x + index * 42
        draw.ellipse((x, center_y - 16, x + 30, center_y + 14), fill=color, outline=(80, 88, 94), width=2)
        cx, cy = x + 15, center_y - 1
        if index % 5 == 0:
            draw.polygon([(cx, cy - 9), (cx + 3, cy - 3), (cx + 10, cy - 3), (cx + 5, cy + 2), (cx + 7, cy + 9), (cx, cy + 5), (cx - 7, cy + 9), (cx - 5, cy + 2), (cx - 10, cy - 3), (cx - 3, cy - 3)], fill=(255, 255, 255))
        elif index % 5 == 1:
            draw.ellipse((cx - 7, cy - 7, cx + 7, cy + 7), outline=(255, 255, 255), width=3)
            draw.line((cx, cy - 5, cx, cy + 5), fill=(255, 255, 255), width=2)
            draw.line((cx - 5, cy, cx + 5, cy), fill=(255, 255, 255), width=2)
        elif index % 5 == 2:
            draw.polygon([(cx, cy - 9), (cx + 8, cy - 3), (cx + 5, cy + 8), (cx, cy + 12), (cx - 5, cy + 8), (cx - 8, cy - 3)], fill=(255, 255, 255))
            draw.line((cx - 4, cy + 1, cx - 1, cy + 4), fill=color, width=2)
            draw.line((cx - 1, cy + 4, cx + 5, cy - 4), fill=color, width=2)
        elif index % 5 == 3:
            draw.rectangle((cx - 7, cy - 5, cx + 7, cy + 7), fill=(255, 255, 255))
            draw.polygon([(cx - 9, cy - 5), (cx, cy - 12), (cx + 9, cy - 5)], fill=(255, 255, 255))
            draw.line((cx - 4, cy - 1, cx + 4, cy - 1), fill=color, width=2)
        else:
            draw.ellipse((cx - 8, cy - 8, cx + 8, cy + 8), outline=(255, 255, 255), width=3)
            draw.ellipse((cx - 2, cy - 2, cx + 2, cy + 2), fill=(255, 255, 255))


draw_badge_row(card_left + 220, card_top + 145)

wrapped = textwrap.wrap(hook or title or "Create your custom Reddit story", width=36) or ["Create your custom Reddit story"]
draw.multiline_text((card_left + 50, card_top + 255), "\n".join(wrapped), font=font_title, fill=primary_text, spacing=8)


def draw_up_arrow(x: int, y: int):
    draw.line((x, y + 42, x, y - 10), fill=secondary_text, width=7)
    draw.line((x, y - 10, x - 22, y + 13), fill=secondary_text, width=7)
    draw.line((x, y - 10, x + 22, y + 13), fill=secondary_text, width=7)


def draw_comment_icon(x: int, y: int):
    draw.rounded_rectangle((x - 30, y - 26, x + 30, y + 28), radius=28, outline=secondary_text, width=6)
    draw.line((x - 18, y + 25, x - 31, y + 43), fill=secondary_text, width=6)


def draw_share_icon(x: int, y: int):
    draw.line((x - 33, y + 22, x + 25, y - 18), fill=secondary_text, width=7)
    draw.line((x + 25, y - 18, x + 7, y - 20), fill=secondary_text, width=7)
    draw.line((x + 25, y - 18, x + 18, y), fill=secondary_text, width=7)
    draw.arc((x - 42, y - 13, x + 15, y + 52), 80, 265, fill=secondary_text, width=7)


action_y = card_bottom - 86
draw_up_arrow(card_left + 86, action_y)
draw.text((card_left + 132, action_y - 25), f"{upvotes:,}", font=font_action, fill=secondary_text)
draw_comment_icon(card_left + 310, action_y + 2)
draw.text((card_left + 358, action_y - 25), f"{comments:,}", font=font_action, fill=secondary_text)
draw_share_icon(card_right - 210, action_y - 2)
draw.text((card_right - 160, action_y - 25), "Share", font=font_share, fill=secondary_text)

output_directory.mkdir(parents=True, exist_ok=True)
image.save(output_directory / "reddit-intro.png")
