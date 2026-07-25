import { createTranscriptionTokenResponse } from "chat-voice-input/server";

export function POST(request) {
  const model = new URL(request.url).searchParams.get("model");
  return createTranscriptionTokenResponse({ model });
}
