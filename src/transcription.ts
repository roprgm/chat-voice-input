import {
  createGateway,
  NoTranscriptGeneratedError,
  experimental_streamTranscribe as streamTranscribe,
} from "ai";

import { createMicrophonePCMStream } from "./microphone";

const tokenTimeoutMs = 15_000;
const defaultTokenEndpoint = "/api/transcription";

export type Transcription = {
  readonly stop: () => void;
  readonly stream: MediaStream | undefined;
  readonly text: Promise<string>;
};

export type Transcriber = {
  readonly start: (onDelta: (delta: string) => void, signal: AbortSignal) => Promise<Transcription>;
};

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
  onDelta: (delta: string) => void,
  signal: AbortSignal,
  tokenEndpoint: string,
): Promise<Transcription> {
  const microphonePromise = createMicrophonePCMStream();
  const tokenPromise = requestToken(tokenEndpoint, signal);
  void tokenPromise.catch(() => undefined);
  const microphone = await microphonePromise;

  if (signal.aborted) {
    await microphone.stop();
    signal.throwIfAborted();
  }

  const stop = () => void microphone.stop();
  signal.addEventListener("abort", stop, { once: true });

  const text = (async () => {
    try {
      const { model, token } = await tokenPromise;
      const result = streamTranscribe({
        abortSignal: signal,
        audio: microphone.audioStream,
        inputAudioFormat: { rate: microphone.sampleRate, type: "audio/pcm" },
        model: createGateway({ apiKey: token }).transcription(model),
      });

      for await (const part of result.fullStream) {
        if (part.type === "transcript-delta") onDelta(part.delta);
        if (part.type === "error") throw part.error;
      }
      return result.text;
    } finally {
      signal.removeEventListener("abort", stop);
      await microphone.stop();
    }
  })().catch((error) => {
    if (NoTranscriptGeneratedError.isInstance(error)) return "";
    throw error;
  });

  return { stop, stream: microphone.mediaStream, text };
}

export function createAiSdkTranscriber({
  tokenEndpoint = defaultTokenEndpoint,
}: AiSdkTranscriberOptions = {}): Transcriber {
  return {
    start: (onDelta, signal) => startTranscription(onDelta, signal, tokenEndpoint),
  };
}
