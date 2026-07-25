import {
  createGateway,
  NoTranscriptGeneratedError,
  experimental_streamTranscribe as streamTranscribe,
} from "ai";

import { createPcmStream } from "../audio";
import type { Transcriber, TranscriberInput, Transcription } from "./types";

export type { Transcriber, TranscriberInput, Transcription } from "./types";

const tokenTimeoutMs = 15_000;
const defaultTokenEndpoint = "/api/transcription";

export type AiSdkTranscriberOptions = {
  readonly tokenEndpoint?: string;
};

type Token = {
  readonly model: string;
  readonly token: string;
};

async function requestToken(endpoint: string, signal: AbortSignal): Promise<Token> {
  const response = await fetch(endpoint, {
    method: "POST",
    signal: AbortSignal.any([signal, AbortSignal.timeout(tokenTimeoutMs)]),
  });
  const body = (await response.json().catch(() => ({}))) as Partial<Token>;
  if (!response.ok || typeof body.model !== "string" || typeof body.token !== "string") {
    throw new Error("Voice input is unavailable.");
  }
  return { model: body.model, token: body.token };
}

async function startTranscription(
  { onDelta, signal, stream }: TranscriberInput,
  tokenEndpoint: string,
): Promise<Transcription> {
  const pcmPromise = createPcmStream(stream);
  const tokenPromise = requestToken(tokenEndpoint, signal);
  void tokenPromise.catch(() => undefined);
  const pcm = await pcmPromise;

  if (signal.aborted) {
    await pcm.close();
    signal.throwIfAborted();
  }

  const stop = () => pcm.close();
  signal.addEventListener("abort", stop, { once: true });

  const text = (async () => {
    try {
      const { model, token } = await tokenPromise;
      const result = streamTranscribe({
        abortSignal: signal,
        audio: pcm.readable,
        inputAudioFormat: { rate: pcm.sampleRate, type: "audio/pcm" },
        model: createGateway({ apiKey: token }).transcription(model),
      });

      for await (const part of result.fullStream) {
        if (part.type === "transcript-delta") onDelta(part.delta);
        if (part.type === "error") throw part.error;
      }
      return result.text;
    } finally {
      signal.removeEventListener("abort", stop);
      await pcm.close();
    }
  })().catch((error) => {
    if (NoTranscriptGeneratedError.isInstance(error)) return "";
    throw error;
  });

  return { stop, text };
}

export function createAiSdkTranscriber(options?: AiSdkTranscriberOptions): Transcriber {
  const tokenEndpoint = options?.tokenEndpoint ?? defaultTokenEndpoint;
  return {
    start: (input) => startTranscription(input, tokenEndpoint),
  };
}
