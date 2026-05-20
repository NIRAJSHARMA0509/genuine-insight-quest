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
`You are Alex, a warm admissions interviewer. The candidate has just answered a question and you need to ask ONE clarifying follow-up that digs into something specific they said.

Rules:
- Output exactly one question — plain conversational English, no preamble, no numbering, no quotes.
- Keep it under 35 words.
- Directly reference what the candidate said (paraphrase or quote a short phrase).
- Probe a vague, surprising, or assertion-without-evidence part of their answer.
- Do not repeat the parent question or any prior follow-ups.
- Avoid yes/no questions.`,
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
    const text = (await callGateway(messages)).trim().replace(/^["']|["']$/g, "");
    return { question_text: text };
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

