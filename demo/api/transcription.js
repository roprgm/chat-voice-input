import { createTranscriptionTokenResponse } from "chat-voice-input/server";

export function POST() {
  return createTranscriptionTokenResponse({
    apiKey: process.env.AI_GATEWAY_API_KEY,
  });
}
