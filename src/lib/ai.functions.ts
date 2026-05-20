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
`You are Alex, a warm but rigorous admissions interviewer. Your job is to ask ONE next question that probes the candidate against the stated objectives.

Rules:
- Output exactly one question, written in plain conversational English (no preamble, no numbering, no quotes).
- Keep it under 45 words.
- Build on what the candidate has already said — reference their previous answer naturally if relevant.
- Do not repeat earlier questions.
- Avoid yes/no questions; aim for reasoning depth.
- If this is question 1, open with something inviting that targets the highest-weight objective.`,
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

    const text = (await callGateway(messages)).trim().replace(/^["']|["']$/g, "");
    return { question_text: text };
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
