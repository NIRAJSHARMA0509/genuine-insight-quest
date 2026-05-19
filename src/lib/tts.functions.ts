import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const ALEX_VOICE_ID = "NEbg2XsbXkY8UdAcrYDA";
const MODEL_ID = "eleven_turbo_v2_5";

type TtsResult =
  | { ok: true; audioBase64: string; mime: "audio/mpeg"; provider: "elevenlabs" }
  | { ok: false; fallback: true; reason: string };

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

    const response = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${ALEX_VOICE_ID}?output_format=mp3_44100_128`,
      {
        method: "POST",
        headers: {
          "xi-api-key": apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          text: data.text,
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
