## Problem

ElevenLabs' `eleven_turbo_v2_5` (and most TTS models) often mispronounce the `£` symbol — it gets read as "L", skipped, or read as "dollars" depending on context. Since these demos are for UK universities, amounts like `£9,535`, `£20k`, or `50p` need to be spoken naturally as "nine thousand five hundred thirty-five pounds", "twenty thousand pounds", "fifty pence".

Right now `src/lib/tts.functions.ts` sends the raw `text` straight to ElevenLabs with no preprocessing, so any `£` in the AI-generated question, intro, or closing is at the mercy of the model.

## Fix

Add a small `normalizeSpokenText()` helper in `src/lib/tts.functions.ts` and run every input through it before the ElevenLabs call. Keep it scoped to currency/units — no other behavior changes, no UI changes, no changes to the question-generation prompts.

### Transformations (in order)

1. **Pounds with amount** — `£1,234.56` → `1,234.56 pounds`, `£20` → `20 pounds`, `£1.5m` / `£1.5M` → `1.5 million pounds`, `£20k` / `£20K` → `20 thousand pounds`, `£1.2bn` → `1.2 billion pounds`.
2. **Bare £** (no number, e.g. "the £ is strong") → `the pound`.
3. **Pence** — standalone `50p` (when not part of a word) → `50 pence`. Only match when preceded by a digit and followed by a non-letter, so words like "top" or "1080p" are left alone (require a leading space/start and a digit immediately before the `p`, e.g. `\b(\d+)p\b` with a guard against common false positives — keep the regex conservative).
4. **GBP** — `GBP 500` or `500 GBP` → `500 pounds`.
5. **Per-year shorthand** — `£30k/year` or `£30k pa` → `30 thousand pounds per year`.

Apply the helper in `synthesizeAlexVoice` to `data.text` immediately before building the request body. Cap the resulting string at the existing 5000-char Zod limit (it can only get shorter or modestly longer; add a `.slice(0, 5000)` safety).

### Why server-side, not in the prompt

- Prompt-only fixes ("spell out £") are unreliable — the model still slips.
- All AI-generated text (`generateReasoningQuestion`, `generateClarifyingFollowUp`, `expandMessage`) funnels into the same `synthesizeAlexVoice` call, so one normalization point covers every voice surface.
- Cheap, deterministic, no extra latency, no API cost.

### Files touched

- `src/lib/tts.functions.ts` — add `normalizeSpokenText()` and call it once inside the handler. No signature change, no client-side change, no other files touched.

### Out of scope

- Other currencies ($ / €) — can add later if needed.
- Changing voice settings, model, or accent.
- Modifying the AI prompts themselves.
