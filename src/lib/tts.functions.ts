import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const ALEX_VOICE_ID = "NEbg2XsbXkY8UdAcrYDA";
const MODEL_ID = "eleven_turbo_v2_5";

type TtsResult =
  | { ok: true; audioBase64: string; mime: "audio/mpeg"; provider: "elevenlabs" }
  | { ok: false; fallback: true; reason: string };

function magnitudeWord(mag: string | undefined): string {
  if (!mag) return "";
  const m = mag.toLowerCase();
  if (m === "k") return " thousand";
  if (m === "m") return " million";
  if (m === "b" || m === "bn") return " billion";
  return "";
}

/**
 * Normalize spoken text so TTS pronounces UK currency correctly.
 * ElevenLabs frequently mispronounces "£" — we expand it to words.
 */
function normalizeSpokenText(input: string): string {
  let s = input;

  // £30k/year, £30k pa → "30 thousand pounds per year"
  s = s.replace(
    /£\s*(\d[\d,]*(?:\.\d+)?)\s*(bn|BN|Bn|[kKmMbB])?\s*(?:\/\s*(?:yr|year)|p\.?\s*a\.?|per\s+year|per\s+annum)\b/g,
    (_m, num, mag) => `${num}${magnitudeWord(mag)} pounds per year`,
  );

  // £1.5m, £20k, £1.2bn → "1.5 million pounds"
  s = s.replace(
    /£\s*(\d[\d,]*(?:\.\d+)?)\s*(bn|BN|Bn|[kKmMbB])\b/g,
    (_m, num, mag) => `${num}${magnitudeWord(mag)} pounds`,
  );

  // £1,234.56 or £20 → "1,234.56 pounds"
  s = s.replace(/£\s*(\d[\d,]*(?:\.\d+)?)/g, (_m, num) => `${num} pounds`);

  // GBP 500 / 500 GBP → "500 pounds"
  s = s.replace(/\bGBP\s*(\d[\d,]*(?:\.\d+)?)\b/g, (_m, n) => `${n} pounds`);
  s = s.replace(/(\d[\d,]*(?:\.\d+)?)\s*GBP\b/g, (_m, n) => `${n} pounds`);

  // 50p pence (must follow digits, not inside a word like 1080p)
  s = s.replace(/(?<![A-Za-z0-9])(\d{1,3})p(?![A-Za-z0-9])/g, "$1 pence");

  // Bare £ → "pound"
  s = s.replace(/£/g, " pound ");

  // Academic & common abbreviations that TTS otherwise pronounces as a word.
  // Use word-boundary and case-insensitive matching for the degree variants.
  const abbrev: Array<[RegExp, string]> = [
    [/\bM\.?Sc\.?\b/gi, "M S C"],
    [/\bB\.?Sc\.?\b/gi, "B S C"],
    [/\bM\.?A\b/g, "M A"],
    [/\bB\.?A\b/g, "B A"],
    [/\bM\.?Eng\.?\b/gi, "M Eng"],
    [/\bB\.?Eng\.?\b/gi, "B Eng"],
    [/\bM\.?Phil\.?\b/gi, "M Phil"],
    [/\bPh\.?D\.?\b/gi, "P H D"],
    [/\bM\.?B\.?A\.?\b/gi, "M B A"],
    [/\bLL\.?B\.?\b/gi, "L L B"],
    [/\bLL\.?M\.?\b/gi, "L L M"],
    [/\bUCAS\b/g, "U CAS"],
    [/\bIELTS\b/g, "I E L T S"],
    [/\bTOEFL\b/g, "TOEFL"],
    [/\bUK\b/g, "U K"],
    [/\bUS\b/g, "U S"],
    [/\bEU\b/g, "E U"],
    [/\bNHS\b/g, "N H S"],
    [/\bAI\b/g, "A I"],
    [/\bCS\b/g, "computer science"],
    [/\bSTEM\b/g, "STEM"],
  ];
  for (const [re, repl] of abbrev) s = s.replace(re, repl);

  return s.replace(/\s{2,}/g, " ").trim().slice(0, 5000);
}

export const synthesizeAlexVoice = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      text: z.string().min(1).max(5000),
    }).parse,
  )
  .handler(async ({ data }): Promise<TtsResult> => {
    const apiKey = process.env.ELEVENLABS_API_KEY;
    if (!apiKey) {
      console.warn("ElevenLabs TTS unavailable: missing ELEVENLABS_API_KEY");
      return { ok: false, fallback: true, reason: "missing_api_key" };
    }

    const spokenText = normalizeSpokenText(data.text);

    const response = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${ALEX_VOICE_ID}?output_format=mp3_44100_128`,
      {
        method: "POST",
        headers: {
          "xi-api-key": apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          text: spokenText,
          model_id: MODEL_ID,
          voice_settings: {
            stability: 0.45,
            similarity_boost: 0.85,
            style: 0.35,
            use_speaker_boost: true,
            speed: 1.0,
          },
        }),
      },
    );

    if (!response.ok) {
      const err = await response.text();
      console.error(`ElevenLabs TTS failed (${response.status}): ${err}`);
      return { ok: false, fallback: true, reason: `elevenlabs_${response.status}` };
    }

    const buf = await response.arrayBuffer();
    const audioBase64 = Buffer.from(buf).toString("base64");
    return { ok: true, audioBase64, mime: "audio/mpeg", provider: "elevenlabs" };
  });
