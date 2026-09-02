# AI pipeline

The light-worker pipeline is:

`candidate → transcript → analysis → content plan`

Transcription is represented by `TranscriptionProvider`. Results include language, full text, timestamped segments, confidence, model, media hash and measured cost. `CachedTranscriptionProvider` checks `mediaHash + language + model` before calling a provider, so retries do not pay twice for the same media/model combination.

Analysis receives metadata, the transcript, channel configuration and optional performance context. It never receives video binary. Analysis and content-plan responses are parsed with Zod at the provider boundary and the pipeline boundary. Provider wrappers retry at most the configured number of times and throw after the final invalid response.

The content plan includes hook, original script, title, description, hashtags, target duration and a machine-readable edit plan. Commentary plans can represent voiceover and source clips separately; rights remain a hard gate in the downstream render/publication flow.

`AiCostMeter` is the seam for budget reservations and cost logging. The local implementation records measurements in memory; production wiring can provide an adapter backed by `@shortfactory/cost-control`. TTS is optional and disabled explicitly with `DisabledTtsProvider` when no provider is configured.
