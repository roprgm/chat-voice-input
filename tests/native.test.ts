import { afterEach, describe, expect, it, vi } from "vitest";

import { createNativeTranscriber } from "../src/transcribers/native";

type FakeSpeechRecognitionResult = {
  readonly 0?: { readonly transcript: string };
  readonly isFinal: boolean;
};

type FakeSpeechRecognitionEvent = {
  readonly resultIndex: number;
  readonly results: readonly FakeSpeechRecognitionResult[];
};

class FakeSpeechRecognition {
  static instance: FakeSpeechRecognition | undefined;

  continuous = false;
  lang = "";
  onend: (() => void) | null = null;
  onerror: ((event: { readonly error: string }) => void) | null = null;
  onresult: ((event: FakeSpeechRecognitionEvent) => void) | null = null;
  abort = vi.fn(() => this.onend?.());
  start = vi.fn();
  stop = vi.fn();

  constructor() {
    FakeSpeechRecognition.instance = this;
  }

  emit(...results: readonly FakeSpeechRecognitionResult[]): void {
    this.onresult?.({ resultIndex: 0, results });
  }
}

function activeRecognition(): FakeSpeechRecognition {
  const recognition = FakeSpeechRecognition.instance;
  if (!recognition) {
    throw new Error("Expected speech recognition to be active.");
  }
  return recognition;
}

function stubMicrophone(language: string): {
  readonly getUserMedia: ReturnType<typeof vi.fn>;
  readonly stopTrack: ReturnType<typeof vi.fn>;
  readonly stream: MediaStream;
} {
  const stopTrack = vi.fn();
  const stream = {
    getTracks: () => [{ stop: stopTrack }],
  } as unknown as MediaStream;
  const getUserMedia = vi.fn().mockResolvedValue(stream);
  vi.stubGlobal("navigator", {
    language,
    mediaDevices: { getUserMedia },
  });
  return { getUserMedia, stopTrack, stream };
}

afterEach(() => {
  vi.unstubAllGlobals();
  FakeSpeechRecognition.instance = undefined;
});

describe("createNativeTranscriber", () => {
  it("streams final browser results and returns the complete transcript", async () => {
    vi.stubGlobal("SpeechRecognition", FakeSpeechRecognition);
    const microphone = stubMicrophone("en-US");
    const onDelta = vi.fn();
    const transcriber = createNativeTranscriber({ language: "es-ES" });

    const transcription = await transcriber.start(onDelta, new AbortController().signal);
    const recognition = activeRecognition();
    recognition.emit(
      { 0: { transcript: " hola " }, isFinal: true },
      { 0: { transcript: "ignored" }, isFinal: false },
      { 0: { transcript: "mundo" }, isFinal: true },
    );
    recognition.onend?.();

    expect(recognition.continuous).toBe(true);
    expect(recognition.lang).toBe("es-ES");
    expect(recognition.start).toHaveBeenCalledOnce();
    expect(microphone.getUserMedia).toHaveBeenCalledWith({ audio: true });
    expect(onDelta.mock.calls).toEqual([["hola"], [" mundo"]]);
    expect(transcription.stream).toBe(microphone.stream);

    transcription.stop();
    expect(recognition.stop).toHaveBeenCalledOnce();
    expect(microphone.stopTrack).toHaveBeenCalledOnce();
    await expect(transcription.text).resolves.toBe("hola mundo");
  });

  it("aborts browser recognition with its signal", async () => {
    vi.stubGlobal("webkitSpeechRecognition", FakeSpeechRecognition);
    const microphone = stubMicrophone("es-ES");
    const controller = new AbortController();
    const transcription = await createNativeTranscriber().start(vi.fn(), controller.signal);
    const recognition = activeRecognition();

    expect(recognition.lang).toBe("es-ES");
    controller.abort();

    expect(recognition.abort).toHaveBeenCalledOnce();
    expect(microphone.stopTrack).toHaveBeenCalledOnce();
    await expect(transcription.text).resolves.toBe("");
  });

  it("rejects when browser speech recognition is unavailable", async () => {
    vi.stubGlobal("SpeechRecognition", undefined);
    vi.stubGlobal("webkitSpeechRecognition", undefined);

    await expect(
      createNativeTranscriber().start(vi.fn(), new AbortController().signal),
    ).rejects.toThrow("Speech recognition is unavailable in this browser.");
  });
});
