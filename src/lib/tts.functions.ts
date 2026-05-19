import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const ALEX_VOICE_ID = "NEbg2XsbXkY8UdAcrYDA";
const MODEL_ID = "eleven_turbo_v2_5";

export const synthesizeAlexVoice = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      text: z.string().min(1).max(5000),
    }).parse,
  )
  .handler(async ({ data }) => {
    const apiKey = process.env.ELEVENLABS_API_KEY;
    if (!apiKey) {
      throw new Error("ELEVENLABS_API_KEY is not configured");
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
      throw new Error(`ElevenLabs TTS failed (${response.status}): ${err}`);
    }

    const buf = await response.arrayBuffer();
    const audioBase64 = Buffer.from(buf).toString("base64");
    return { audioBase64, mime: "audio/mpeg" };
  });
