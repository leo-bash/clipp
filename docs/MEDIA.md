# Media engine

`@shortfactory/storage` owns the storage contract. The local adapter copies objects below a configured root, rejects absolute or traversal keys, preserves per-object metadata, and exposes a retention cleanup hook that skips legal holds and preserved objects. A future S3-compatible adapter can implement the same contract.

`@shortfactory/video` keeps media work outside the API process. `FFmpegRenderer` probes the source, crops it to an even vertical canvas, applies an optional trim and ASS caption track, encodes H.264/AAC with a fast-start MP4 layout, and runs QC on the resulting file. Critical QC failures reject the render: wrong resolution, invalid duration, zero-byte output, non-H.264 video, missing required audio, or an oversized file.

The render worker imports the renderer and the container installs both `ffmpeg` and `ffprobe`. The Phase 5 acceptance test generates a landscape fixture and verifies a valid 1080x1920 MP4 with H.264 video and AAC audio.
