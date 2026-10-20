import json
import os
import re
import subprocess
import sys
from difflib import SequenceMatcher
from pathlib import Path

import numpy as np
from faster_whisper import WhisperModel


if len(sys.argv) != 5:
    raise SystemExit("Uso: transcribe-whisper-local.py AUDIO SCRIPT OUTPUT MODEL")

audio_path = Path(sys.argv[1]).resolve()
script_path = Path(sys.argv[2]).resolve()
output_path = Path(sys.argv[3]).resolve()
model_name = sys.argv[4]
language = os.environ.get("WHISPER_LANGUAGE", "en")
device = os.environ.get("WHISPER_DEVICE", "cpu")
compute_type = os.environ.get("WHISPER_COMPUTE_TYPE", "int8")


def tokenise(text: str) -> list[str]:
    return re.findall(r"[A-Za-z0-9]+(?:['’][A-Za-z0-9]+)*", text)


def normalise(text: str) -> str:
    return re.sub(r"[^a-z0-9]", "", text.lower().replace("’", "'"))


def read_whisper_words():
    model = WhisperModel(model_name, device=device, compute_type=compute_type)
    decoded = subprocess.run(
        ["ffmpeg", "-v", "error", "-i", str(audio_path), "-f", "s16le", "-ac", "1", "-ar", "16000", "-"],
        check=True,
        stdout=subprocess.PIPE,
    ).stdout
    audio = np.frombuffer(decoded, dtype=np.int16).astype(np.float32) / 32768.0
    segments, _ = model.transcribe(
        audio,
        language=language,
        word_timestamps=True,
        vad_filter=True,
        condition_on_previous_text=True,
        beam_size=5,
    )
    recognised = []
    for segment in segments:
        for word in segment.words or []:
            text = str(word.word or "").strip()
            if not text:
                continue
            recognised.append({
                "text": text,
                "start": max(0.0, float(word.start)),
                "end": max(0.0, float(word.end)),
            })
    return recognised


def interpolate_time(index: int, total: int, recognised: list[dict], anchors: dict[int, dict]) -> dict:
    if not recognised:
        raise RuntimeError("Whisper non ha restituito parole con timestamp")
    previous = max((value for value in anchors if value < index), default=None)
    following = min((value for value in anchors if value > index), default=None)
    if previous is not None and following is not None:
        left = anchors[previous]["end"]
        right = anchors[following]["start"]
        if right <= left:
            right = left + 0.08 * (following - previous)
        slot = (right - left) / (following - previous + 1)
        start = left + slot * (index - previous)
        end = start + slot
    elif following is not None:
        first_start = recognised[0]["start"]
        right = anchors[following]["start"]
        slot = max(0.06, (right - first_start) / (following + 1))
        start = first_start + slot * index
        end = start + slot
    else:
        last_end = recognised[-1]["end"]
        first_start = recognised[0]["start"]
        slot = max(0.06, (last_end - first_start) / max(total, 1))
        start = last_end - slot * (total - index)
        end = start + slot
    return {"start": max(0.0, start), "end": max(start + 0.04, end)}


def align_script_words(script_words: list[str], recognised: list[dict]) -> list[dict]:
    script_keys = [normalise(word) for word in script_words]
    recognised_keys = [normalise(word["text"]) for word in recognised]
    matcher = SequenceMatcher(None, script_keys, recognised_keys, autojunk=False)
    anchors: dict[int, dict] = {}
    for tag, script_start, script_end, recognised_start, recognised_end in matcher.get_opcodes():
        if tag != "equal":
            continue
        for offset in range(script_end - script_start):
            anchors[script_start + offset] = recognised[recognised_start + offset]

    aligned = []
    for index, text in enumerate(script_words):
        timing = anchors.get(index) or interpolate_time(index, len(script_words), recognised, anchors)
        aligned.append({
            "text": text,
            "start": round(float(timing["start"]), 4),
            "end": round(max(float(timing["start"]) + 0.04, float(timing["end"])), 4),
        })
    return aligned


script_text = script_path.read_text(encoding="utf-8").strip()
script_words = tokenise(script_text)
if not script_words:
    raise RuntimeError("Lo script del voice-over non contiene parole")

recognised_words = read_whisper_words()
aligned_words = align_script_words(script_words, recognised_words)
segments = [{
    "start": aligned_words[0]["start"],
    "end": aligned_words[-1]["end"],
    "text": " ".join(script_words),
    "words": aligned_words,
}]

output_path.parent.mkdir(parents=True, exist_ok=True)
output_path.write_text(json.dumps({
    "provider": "whisper-local",
    "model": model_name,
    "language": language,
    "segments": segments,
    "recognisedWordCount": len(recognised_words),
    "scriptWordCount": len(script_words),
}, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print(json.dumps({
    "provider": "whisper-local",
    "model": model_name,
    "recognisedWordCount": len(recognised_words),
    "scriptWordCount": len(script_words),
    "output": str(output_path),
}))
