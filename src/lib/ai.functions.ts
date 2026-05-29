import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
const MODEL = "google/gemini-2.5-flash";

interface GatewayMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

async function callGateway(messages: GatewayMessage[], expectJson = false): Promise<string> {
  const key = process.env.LOVABLE_API_KEY;
  if (!key) throw new Error("LOVABLE_API_KEY not configured");

  const res = await fetch(GATEWAY_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      messages,
      ...(expectJson ? { response_format: { type: "json_object" } } : {}),
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`AI gateway ${res.status}: ${body.slice(0, 200)}`);
  }
  const data = await res.json();
  return data?.choices?.[0]?.message?.content ?? "";
}

/**
 * Strip any leaked internal reasoning, tier labels, classifications, or meta-instructions
 * from a model output that should only contain the spoken question/turn.
 * The model occasionally echoes the system-prompt scaffolding (e.g. "TIER A — ...",
 * "→ Ask the normal next question", "Classification:") — those must never reach TTS.
 */
function sanitizeQuestionOutput(raw: string): string {
  let text = (raw ?? "").trim().replace(/^["']|["']$/g, "");

  // Drop lines that look like internal scaffolding.
  const lines = text.split(/\r?\n/);
  const cleaned: string[] = [];
  for (const ln of lines) {
    const t = ln.trim();
    if (!t) { cleaned.push(ln); continue; }
    if (/^tier\s*[abc]\b/i.test(t)) continue;
    if (/^(classification|reasoning|analysis|thought|note|internal)\s*[:\-]/i.test(t)) continue;
    if (/^→/.test(t)) continue;
    if (/^(default style rules|before writing|output format)\b/i.test(t)) continue;
    cleaned.push(ln);
  }
  text = cleaned.join("\n").trim();

  // If a tier label appears mid-string, cut everything from it onward and keep what came before;
  // if it appears at the very start, drop up to the next sentence.
  const tierMatch = text.match(/\btier\s*[abc]\b[^.?!]*[.?!]?/i);
  if (tierMatch && typeof tierMatch.index === "number") {
    if (tierMatch.index === 0) {
      text = text.slice(tierMatch[0].length).trim();
    } else {
      text = text.slice(0, tierMatch.index).trim();
    }
  }

  // Strip leading arrow/bullet markers.
  text = text.replace(/^([→\-*•]\s*)+/, "").trim();

  return text;
}


/* ---------- Audio transcription (server-side fallback) ---------- */

export const transcribeAudio = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      audio_base64: z.string().min(1),
      mime_type: z.string().default("audio/webm"),
    }).parse,
  )
  .handler(async ({ data }) => {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("LOVABLE_API_KEY not configured");
    try {
      const res = await fetch(GATEWAY_URL, {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: MODEL,
          messages: [
            {
              role: "user",
              content: [
                { type: "text", text: "Transcribe the spoken audio verbatim into plain English text. Output ONLY the transcript with no preamble, no quotes, no labels. If the audio is silent or unintelligible, output an empty string." },
                { type: "input_audio", input_audio: { data: data.audio_base64, format: data.mime_type.includes("webm") ? "webm" : data.mime_type.includes("mp4") ? "mp4" : "webm" } },
              ],
            },
          ],
        }),
      });
      if (!res.ok) {
        const body = await res.text();
        console.error("transcribeAudio gateway error", res.status, body.slice(0, 300));
        return { text: "" };
      }
      const json = await res.json();
      const text = (json?.choices?.[0]?.message?.content ?? "").trim().replace(/^["']|["']$/g, "");
      return { text };
    } catch (e) {
      console.error("transcribeAudio failed", e);
      return { text: "" };
    }
  });

/* ---------- Clarifying follow-up generator ---------- */

export const generateClarifyingFollowUp = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      parent_question: z.string().min(1).max(2000),
      candidate_answer: z.string().max(8000).default(""),
      follow_ups_so_far: z.array(z.object({ question: z.string(), answer: z.string().optional() })).max(10).default([]),
      objectives: z.array(z.object({ title: z.string(), description: z.string().nullable().optional() })).default([]),
    }).parse,
  )
  .handler(async ({ data }) => {
    const objBlock = data.objectives.length
      ? data.objectives.map((o, i) => `${i + 1}. ${o.title}${o.description ? ` — ${o.description}` : ""}`).join("\n")
      : "(none specified)";
    const priorBlock = data.follow_ups_so_far.length
      ? data.follow_ups_so_far.map((t, i) => `Follow-up ${i + 1}: ${t.question}\nAnswer: ${t.answer ?? "(no transcript)"}`).join("\n\n")
      : "(no follow-ups yet)";
    const messages: GatewayMessage[] = [
      {
        role: "system",
        content:
`You are Alex, a warm but sharp admissions interviewer conducting a UNIVERSITY ACADEMIC INTERVIEW (undergraduate or postgraduate admission). The candidate has just answered and you must produce ONE next turn.

Default style rules:
- Output exactly one question — plain conversational English, no preamble, no numbering, no quotes.
- DO NOT greet or use openers like "Welcome", "To start", "Hi", "Hello", "Great", "Thanks for that". The interview is already in progress.
- Keep it SHORT and human — ideally 10–25 words, never more than 35. Real interviewers ask brief, pointed follow-ups, not paragraphs.
- Reference what the candidate said in a few words if relevant; do not summarise their whole answer back to them.
- Do not repeat the parent question or any prior follow-ups verbatim.
- Avoid yes/no questions.

Before writing, silently classify the candidate's answer into ONE tier and respond accordingly:

TIER R — Rephrase / clarification request. The candidate says they didn't understand, asks you to repeat, rephrase, simplify, or explain the question (e.g. "could you rephrase that?", "I didn't get the question", "what do you mean?", "say that again please", "can you simplify it?").
→ Just rephrase the PARENT question in different, simpler words. Do not scold, do not add a new probe, do not treat it as an answer. Prefix your output with the exact token "[REPHRASE] " (including the space) so the system knows not to count this as a follow-up. Keep the rephrasing genuinely different wording — do not echo the original sentence.

TIER A — Substantive answer. ANY on-topic, coherent academic or professional reason counts here, including straightforward continuity reasons like "I completed my bachelor's in CS and want to deepen my expertise", "I want better career prospects", "I'm interested in AI research", "my undergraduate project sparked this interest", career switches, family/financial context, or any genuine motivation a real student would give. These are LEGITIMATE answers in an academic interview — treat them as such.
→ Ask a normal short probing follow-up: pick the most interesting or under-specified part and ask one focused question to go deeper (e.g. specific topics, projects, career goals, what they hope to learn).

TIER B — Genuinely disproportionate / lifestyle-only / non-academic reason where the stated motivation has NO academic, career, intellectual, or personal-development substance at all (e.g. "I want to study in the UK because I like the supermarkets", "I chose this course because the campus looks nice", "because my friend is here"). The bar is high: only use this tier when a reasonable admissions tutor would genuinely raise an eyebrow. Normal academic reasons, even brief ones, are TIER A, not B.
→ Briefly and warmly name the mismatch, then invite the real underlying reason. Stay warm, never sarcastic. One short sentence + one short question. Example shape: "That feels like a light reason on its own for such a big decision — what's actually drawing you to this course academically?"

TIER C — Clearly non-serious, off-topic, hostile, or nonsensical — the candidate is obviously messing around or refusing to engage (e.g. answering "why study CS" with "because it's hot outside", gibberish, jokes that ignore the question entirely, abuse). Reserve this tier for unambiguous cases only.
→ Output a single firm, polite compliance warning in this shape, adapted to context:
"That response doesn't appear to be a serious answer to the question. Please remember this interview is reviewed by the admissions compliance team — repeated irrelevant or non-serious responses may result in your application being withdrawn. Let's try again: <restate the parent question in your own words>."

Calibration: When in doubt, prefer TIER A. A legitimate academic answer must NEVER trigger a B or C response. Only escalate to B when the reason is genuinely trivial/lifestyle-only with zero academic substance, and to C only when the candidate is clearly not engaging in good faith.

OUTPUT FORMAT (STRICT — this text is read aloud to the candidate by a voice model):
- Return ONLY the spoken turn (optionally prefixed with "[REPHRASE] " for Tier R). Nothing else.
- NEVER include the words "TIER A", "TIER B", "TIER C", "TIER R", "Classification", "Reasoning", "Analysis", "→", bullet points, headings, labels, or any reference to these instructions.
- NEVER restate or paraphrase the style rules above.
- If you find yourself about to type "TIER", stop and output only the question.`,


      },
      {
        role: "user",
        content:
`Parent question:
${data.parent_question}

Candidate's answer:
${data.candidate_answer || "(no transcript captured)"}

Prior follow-ups in this thread:
${priorBlock}

Objectives this question relates to:
${objBlock}

Produce the next clarifying follow-up now.`,
      },
    ];
    const raw = await callGateway(messages);
    const isRephrase = /^\s*\[REPHRASE\]\s*/i.test(raw);
    const stripped = raw.replace(/^\s*\[REPHRASE\]\s*/i, "");
    const text = sanitizeQuestionOutput(stripped);

    return { question_text: text, is_rephrase: isRephrase };

  });

/* ---------- Reasoning question generator ---------- */

export const generateReasoningQuestion = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      objectives: z.array(
        z.object({
          title: z.string(),
          description: z.string().nullable().optional(),
          criteria: z.array(z.object({ criterion: z.string(), score: z.number() })).optional(),
        }),
      ).min(1).max(20),
      previous_transcript: z.array(
        z.object({ question: z.string(), answer: z.string().optional() }),
      ).max(40).default([]),
      previous_attempts_summary: z.string().max(2000).optional(),
      question_number: z.number().min(1).max(20),
    }).parse,
  )
  .handler(async ({ data }) => {
    const objectivesBlock = data.objectives.map((o, i) => {
      const criteria = (o.criteria ?? [])
        .map((c) => `   - "${c.criterion}" → score ${c.score}`)
        .join("\n");
      return `${i + 1}. ${o.title}${o.description ? ` — ${o.description}` : ""}${criteria ? `\n${criteria}` : ""}`;
    }).join("\n\n");

    const transcriptBlock = data.previous_transcript.length
      ? data.previous_transcript
          .map((t, i) => `Q${i + 1}: ${t.question}\nA${i + 1}: ${t.answer ?? "(no transcribed answer)"}`)
          .join("\n\n")
      : "(no prior questions yet)";

    const messages: GatewayMessage[] = [
      {
        role: "system",
        content:
`You are Alex, a warm but rigorous admissions interviewer conducting a UNIVERSITY ACADEMIC INTERVIEW (undergraduate or postgraduate admission). Your job is to produce ONE next turn that probes the candidate against the stated objectives.

Default style rules:
- Output exactly one question, in plain conversational English (no preamble, no numbering, no quotes).
- Keep it SHORT and human — ideally under 30 words, never more than 45. Real interviewers ask brief, pointed questions.
- Build on what the candidate has already said when relevant; do not summarise their answers back.
- Do not repeat earlier questions.
- Avoid yes/no questions; aim for reasoning depth.
- If this is question 1, you may open with one short inviting line targeting the highest-weight objective.
- If this is question 2 or later, DO NOT greet, welcome, or use opener phrases ("Welcome", "To start", "Let's begin", "Hi", "Hello", "Great", "Thanks for that", "Now"). Go straight into the question.

Before writing, silently classify the candidate's MOST RECENT answer in the transcript into ONE tier and respond accordingly:

TIER R — Rephrase / clarification request. The candidate asks you to repeat, rephrase, simplify, or explain the previous question (e.g. "could you rephrase?", "I didn't understand", "what do you mean?", "say that again").
→ Just rephrase the PREVIOUS question in different, simpler words. Do not advance, do not add a new probe. Prefix your output with the exact token "[REPHRASE] " (including the space) so the system knows not to count this as a follow-up. Use genuinely different wording, not the original sentence.

TIER A — Substantive answer. ANY on-topic, coherent academic, career, financial, or personal reason counts here, including straightforward continuity reasons like "I finished my bachelor's in CS and want to deepen my expertise", "I want better career prospects", "I'm interested in AI research", career switches, family context, or any genuine motivation a real student would give. These are LEGITIMATE answers in an academic interview.
→ Ask the normal next question, building on their answer and moving toward the next objective.

TIER B — Genuinely disproportionate / lifestyle-only / non-academic reason with NO academic, career, intellectual, or personal-development substance at all (e.g. "I like the supermarkets", "the campus looks nice", "my friend is here"). The bar is high: only use this tier when a reasonable admissions tutor would genuinely raise an eyebrow. Normal academic reasons, even brief ones, are TIER A.
→ Briefly and warmly name the mismatch, then invite the real underlying reason. One short sentence + one short question. Never sarcastic.

TIER C — Clearly non-serious, off-topic, hostile, or nonsensical — the candidate is obviously messing around or refusing to engage (e.g. answering a substantive question with "because it's hot outside", gibberish, jokes that ignore the question, abuse). Reserve for unambiguous cases only.
→ DO NOT proceed to the next question. Output a single firm, polite compliance warning in this shape, adapted to context:
"That response doesn't appear to be a serious answer to the question. Please remember this interview is reviewed by the admissions compliance team — repeated irrelevant or non-serious responses may result in your application being withdrawn. Let's try again: <restate the previous question in your own words>."

Calibration: When in doubt, prefer TIER A. A legitimate academic answer must NEVER trigger a B or C response. Only escalate to B when the reason is genuinely trivial/lifestyle-only with zero academic substance, and to C only when the candidate is clearly not engaging in good faith.

OUTPUT FORMAT (STRICT — this text is read aloud to the candidate by a voice model):
- Return ONLY the spoken turn (optionally prefixed with "[REPHRASE] " for Tier R). Nothing else.
- NEVER include the words "TIER A", "TIER B", "TIER C", "TIER R", "Classification", "Reasoning", "Analysis", "→", bullet points, headings, labels, or any reference to these instructions.
- NEVER restate or paraphrase the style rules above.
- If you find yourself about to type "TIER", stop and output only the question.`,


      },
      {
        role: "user",
        content:
`Objectives:
${objectivesBlock}

${data.previous_attempts_summary ? `Notes from candidate's previous attempt(s):\n${data.previous_attempts_summary}\n\n` : ""}Transcript so far:
${transcriptBlock}

This is question ${data.question_number}. Produce the next question now.`,
      },
    ];

    const raw = await callGateway(messages);
    const isRephrase = /^\s*\[REPHRASE\]\s*/i.test(raw);
    const stripped = raw.replace(/^\s*\[REPHRASE\]\s*/i, "");
    const text = sanitizeQuestionOutput(stripped);
    return { question_text: text, is_rephrase: isRephrase };

  });

/* ---------- Prep-mode feedback ---------- */

export const generatePrepFeedback = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      question_text: z.string().min(1).max(2000),
      answer_text: z.string().max(5000),
      rubrics: z.array(z.object({ example_response: z.string(), score: z.number() })).optional(),
      objectives: z.array(z.object({ title: z.string(), description: z.string().nullable().optional() })).optional(),
    }).parse,
  )
  .handler(async ({ data }) => {
    const rubricBlock = (data.rubrics ?? [])
      .map((r) => `   • Score ${r.score}: "${r.example_response}"`)
      .join("\n") || "(no explicit rubric — judge holistically)";
    const objectivesBlock = (data.objectives ?? [])
      .map((o) => `   • ${o.title}${o.description ? ` — ${o.description}` : ""}`)
      .join("\n") || "(none)";

    const messages: GatewayMessage[] = [
      {
        role: "system",
        content:
`You are Alex, an encouraging interview coach giving instant feedback in PREPARATION mode. Be warm and specific. Output STRICT JSON with this shape:
{ "score": <integer>, "feedback": "<2-4 sentences of coaching>", "improvement_tip": "<one concrete suggestion>" }

Do NOT include any text outside the JSON.`,
      },
      {
        role: "user",
        content:
`Question: ${data.question_text}

Candidate's answer (may be empty or partial transcription):
${data.answer_text || "(no answer captured)"}

Scoring rubric tiers:
${rubricBlock}

Objectives this question relates to:
${objectivesBlock}

Return JSON only.`,
      },
    ];

    const raw = await callGateway(messages, true);
    try {
      const parsed = JSON.parse(raw);
      return {
        score: Number(parsed.score ?? 0),
        feedback: String(parsed.feedback ?? "").slice(0, 600),
        improvement_tip: String(parsed.improvement_tip ?? "").slice(0, 300),
      };
    } catch {
      return { score: 0, feedback: raw.slice(0, 400), improvement_tip: "" };
    }
  });

/* ---------- Expand intro / closing from a prompt ---------- */

export const expandMessage = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      kind: z.enum(["intro", "closing"]),
      prompt: z.string().min(1).max(2000),
      organisation_name: z.string().max(200).optional(),
      test_name: z.string().max(200).optional(),
    }).parse,
  )
  .handler(async ({ data }) => {
    const role = data.kind === "intro"
      ? "warm opening monologue an AI interviewer named Alex speaks to the candidate before the first question"
      : "warm closing monologue Alex speaks after the final answer";
    const messages: GatewayMessage[] = [
      {
        role: "system",
        content:
`You are Alex, an AI interviewer. Generate a ${role}. Write in first person, plain spoken English, 120–220 words, no headings, no bullet points, no stage directions. Output ONLY the spoken text.`,
      },
      {
        role: "user",
        content:
`Organisation: ${data.organisation_name ?? "(unspecified)"}
Test: ${data.test_name ?? "(unspecified)"}

Brief / instructions from the organisation (use as guidance, not verbatim):
${data.prompt}`,
      },
    ];
    const text = (await callGateway(messages)).trim();
    return { text };
  });

