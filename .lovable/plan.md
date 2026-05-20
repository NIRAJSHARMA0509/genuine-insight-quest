
## Goal
Replace the current single-table `universities` model with a proper **Organisation → Test → Level → Question/Objective** hierarchy, and add AI-generated reasoning + prep-mode feedback using Lovable AI (Gemini 2.5 Flash).

Existing universities/sessions will be **wiped** (you confirmed fresh start).

---

## 1. Data model (new tables)

```text
organisations
  ├── id, type ('university' | 'service_provider')
  ├── name, logo_url, website_url, description
  ├── custom_urls: jsonb [{ tag, url }]   ← free-form, optional
  └── (university extras) programme_name, intake_year
  └── (service_provider extras) nature_of_service

tests
  ├── id, organisation_id, slug (public URL)
  ├── name, purpose ('preparation' | 'assessment')
  ├── max_attempts (int, default 1)
  ├── attempts_context_note (auto-shown to candidate)
  ├── intro_message, closing_message
  ├── proctoring_enabled
  └── status ('draft' | 'live' | 'paused')

test_levels
  ├── id, test_id, order_index, name
  └── mode ('fixed' | 'clarifying' | 'reasoning')

questions
  ├── id, level_id, order_index
  ├── question_text
  ├── think_time_seconds (default 30, 0 = instant record)
  ├── answer_time_seconds (default 120)
  ├── max_follow_ups (clarifying only)
  └── ai_generated (bool — true for reasoning auto-gen)

question_rubrics            ← 1–10 example→score tiers per question
  ├── id, question_id, order_index
  ├── example_response (text)
  └── score (int)

objectives                  ← per level (reasoning mode) or per test
  ├── id, level_id, order_index
  ├── title, description, weight

objective_criteria          ← 1–10 "what I'm seeking" rows per objective
  ├── id, objective_id, order_index
  ├── criterion (text)
  └── score (int)

interview_sessions          (recreated)
  ├── + test_id, level_id, attempt_number
  ├── + previous_attempts_summary jsonb (for cross-attempt context)
  └── existing transcript/score/proctoring fields
```

All tables get permissive RLS to match current public-config pattern (admin auth is a later milestone you flagged).

## 2. Configuration UI flow

`/configure` becomes a list of **Organisations** with a "Configure new organisation" CTA. The wizard:

1. **Choose type** — University vs Service Provider (locked once chosen)
2. **Org details** — name, logo upload, website, description, custom URLs (Add row: tag + URL), plus type-specific fields. Logo upload uses existing `university-logos` bucket (renamed in UI to "Organisation logos").
3. **Tests list** under the org — "Create test"
4. **Test setup** — purpose (prep/assessment), max attempts, intro/closing, proctoring toggle
5. **Levels** — add 1..N levels; each level picks a **mode** (fixed / clarifying / reasoning)
6. **Per level**:
   - Fixed / Clarifying: add questions; each question → think_time, answer_time, and **1–10 rubric tiers** (example response + score)
   - Reasoning: add **objectives** (title + description + weight) with **1–10 criteria** (criterion + score); optional seed question count for AI to auto-generate at runtime
7. **Publish** → generates `/t/<org-slug>/<test-slug>` URL

## 3. Runtime (interview page)

- New route `/t/$orgSlug/$testSlug` (the current `/interview/$slug` stays as a redirect shim).
- Pulls test → levels → questions/objectives, walks levels in order.
- Per question:
  - Shows think-time countdown (highlighted, current behaviour).
  - If `think_time_seconds === 0` → instant recording.
  - After answer submit, if test purpose is **preparation** → calls a new server fn `generatePrepFeedback` (Gemini 2.5 Flash) that returns 2–4 sentence coaching feedback against the rubric/objectives and shows it before the next question.
- Reasoning levels: server fn `generateReasoningQuestion` builds the next question from the objectives + prior answers + previous attempts summary. Limited by an `ai_question_budget` on the level (default 5).
- On session complete, store transcript + rubric-based score report. Past attempts summary is fed to the next attempt's context.

## 4. AI server functions (Lovable AI Gateway, Gemini 2.5 Flash)

`src/lib/ai.functions.ts` exposes:
- `generateReasoningQuestion({ levelId, transcript, attemptHistory })` → `{ question_text }`
- `generatePrepFeedback({ questionId, answerTranscript })` → `{ feedback, suggested_score }`
- `scoreTranscript({ sessionId })` → uses rubrics + criteria to produce structured score per question/objective

All use `@ai-sdk/openai-compatible` + `createLovableAiGatewayProvider` with `LOVABLE_API_KEY` (already present in secrets) and `Output.object` for structured JSON.

## 5. ElevenLabs voice — keep as-is

No changes to `tts.functions.ts`. The new intro/closing/prep feedback all route through the same `synthesizeAlexVoice` path so the cloned voice plays everywhere.

## 6. Migration

- `DROP TABLE interview_sessions, universities CASCADE;`
- Create the new schema above with RLS + `updated_at` triggers reusing `set_updated_at()`.
- No data preserved.

## 7. Out of scope for this turn

- Admin auth / per-user permissions
- Candidate-side re-attempt enforcement UI (config stored + note shown, but enforcement is a follow-up)
- Detailed prep-mode "improve and retry this answer" loop (only post-answer feedback for now)
- Score report rendering improvements (basic JSON list of scores per question)

## 8. Build order

1. SQL migration (drop + recreate schema)
2. Types in `src/lib/types.ts`
3. New `/configure` UI (org list + wizard) — replaces existing configure page
4. New `/t/$org/$test` runtime route — replaces interview slug route
5. `ai.functions.ts` with the 3 server fns
6. Wire prep feedback + reasoning generation into the runtime
7. Smoke-test by configuring one university with a reasoning level and 3 objectives

This is roughly **8–10 file edits + 1 migration**. Once you approve, I'll start with the migration so it can be reviewed first.
