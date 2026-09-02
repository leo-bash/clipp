# Pipeline

The intended pipeline is candidate → analysis → plan → TTS → render → QC → review → schedule → publish → analytics. Queue names and worker boundaries are explicit: discovery, ingestion, transcription, analysis, planning, tts, render, qc, review, publish, analytics and cleanup. The dedicated TTS consumer uses the deterministic cached adapter in local mode and defers when no configured provider is available; it never calls a paid provider implicitly.
