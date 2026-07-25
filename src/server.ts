import { createGateway } from "@ai-sdk/gateway";

const defaultModel = "openai/gpt-realtime-whisper";
const headers = { "Cache-Control": "no-store" };

export type TranscriptionTokenOptions = {
  readonly apiKey?: string;
  readonly model?: string;
};

export async function createTranscriptionTokenResponse({
  apiKey,
  model = defaultModel,
}: TranscriptionTokenOptions = {}): Promise<Response> {
  try {
    const transcription = createGateway({ apiKey }).experimental_transcription;
    const { token } = await transcription.getToken({ model });
    return Response.json({ model, token }, { headers });
  } catch (error) {
    console.error("Could not create transcription token", error);
    return Response.json({ error: "Voice input is unavailable." }, { headers, status: 503 });
  }
}
