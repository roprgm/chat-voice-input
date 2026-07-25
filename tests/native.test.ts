import { afterEach, describe, expect, it, vi } from "vitest";

import { createNativeTranscriber } from "../src/transcribers/native";
import type { Transcription } from "../src/transcribers/types";

type RecognitionResult = {
  readonly 0?: { readonly transcript: string };
  readonly isFinal: boolean;
};

type RecognitionEvent = {
  readonly resultIndex: number;
  readonly results: readonly RecognitionResult[];
};

class FakeRecognition {
  static autoStartAudio = true;
  static instance: FakeRecognition | undefined;

  continuous = false;
  lang = "";
  onaudioend: (() => void) | null = null;
  onaudiostart: (() => void) | null = null;
  onend: (() => void) | null = null;
  onerror: ((event: { readonly error: string }) => void) | null = null;
  onresult: ((event: RecognitionEvent) => void) | null = null;
  abort = vi.fn(() => this.onend?.());
  start = vi.fn(() => {
    if (FakeRecognition.autoStartAudio) this.onaudiostart?.();
  });
  stop = vi.fn();

  constructor() {
    FakeRecognition.instance = this;
  }

  emitError(error: string): void {
    this.onerror?.({ error });
  }

  emitResults(...results: readonly RecognitionResult[]): void {
    this.onresult?.({ resultIndex: 0, results });
  }
}

class FakeMicrophoneTrack extends EventTarget {
  stop = vi.fn();
}

type Session = {
  readonly controller: AbortController;
  readonly onDelta: ReturnType<typeof vi.fn>;
  readonly recognition: FakeRecognition;
  readonly track: FakeMicrophoneTrack;
  readonly transcription: Transcription;
};

function recognition(): FakeRecognition {
  if (!FakeRecognition.instance) throw new Error("Expected speech recognition to be active.");
  return FakeRecognition.instance;
}

function installRecognition(api: "standard" | "webkit" = "standard"): void {
  vi.stubGlobal("SpeechRecognition", api === "standard" ? FakeRecognition : undefined);
  vi.stubGlobal("webkitSpeechRecognition", api === "webkit" ? FakeRecognition : undefined);
}

function mediaStream() {
  const track = new FakeMicrophoneTrack();
  const stream = { getTracks: () => [track] } as unknown as MediaStream;
  return { stream, track };
}

async function startSession(options?: {
  readonly api?: "standard" | "webkit";
  readonly browserLanguage?: string;
}): Promise<Session> {
  installRecognition(options?.api);
  vi.stubGlobal("navigator", { language: options?.browserLanguage ?? "en-US" });
  const { stream, track } = mediaStream();
  const controller = new AbortController();
  const onDelta = vi.fn();
  const transcription = await createNativeTranscriber().start({
    onDelta,
    signal: controller.signal,
    stream,
  });
  return { controller, onDelta, recognition: recognition(), track, transcription };
}

afterEach(() => {
  vi.unstubAllGlobals();
  FakeRecognition.autoStartAudio = true;
  FakeRecognition.instance = undefined;
});

describe("native transcriber", () => {
  it("supports the prefixed WebKit recognition API", async () => {
    const session = await startSession({ api: "webkit", browserLanguage: "es-ES" });

    expect(session.recognition.lang).toBe("es-ES");
    session.controller.abort();
    await expect(session.transcription.text).resolves.toBe("");
  });

  it("waits for confirmed recognition capture before starting", async () => {
    installRecognition();
    FakeRecognition.autoStartAudio = false;
    vi.stubGlobal("navigator", { language: "en-US" });
    const { stream } = mediaStream();
    let hasStarted = false;

    const pending = createNativeTranscriber()
      .start({ onDelta: vi.fn(), signal: new AbortController().signal, stream })
      .then((session) => {
        hasStarted = true;
        return session;
      });
    await vi.waitFor(() => expect(recognition().start).toHaveBeenCalledOnce());

    expect(hasStarted).toBe(false);
    recognition().onaudiostart?.();

    const session = await pending;
    expect(hasStarted).toBe(true);
    recognition().onend?.();
    await session.text;
  });

  it("does not take ownership of the provided microphone stream", async () => {
    const session = await startSession();

    session.controller.abort();

    expect(session.recognition.abort).toHaveBeenCalledOnce();
    expect(session.track.stop).not.toHaveBeenCalled();
    await expect(session.transcription.text).resolves.toBe("");
  });

  it("streams final results, ignores interim results, and returns complete text", async () => {
    const session = await startSession();
    session.recognition.emitResults(
      { 0: { transcript: " hola " }, isFinal: true },
      { 0: { transcript: "ignored" }, isFinal: false },
      { 0: { transcript: "mundo" }, isFinal: true },
    );

    session.transcription.stop();
    session.recognition.onend?.();

    expect(session.onDelta.mock.calls).toEqual([["hola"], [" mundo"]]);
    expect(session.recognition.stop).toHaveBeenCalledOnce();
    expect(session.track.stop).not.toHaveBeenCalled();
    await expect(session.transcription.text).resolves.toBe("hola mundo");
  });

  it("ends successfully when recognition returns no text", async () => {
    const session = await startSession();

    session.recognition.onend?.();

    await expect(session.transcription.text).resolves.toBe("");
  });

  it("treats no speech as a successful empty recording", async () => {
    const session = await startSession();

    session.recognition.emitError("no-speech");

    await expect(session.transcription.text).resolves.toBe("");
  });

  it.each(["aborted", "audio-capture"])(
    "ignores %s when it arrives after the user presses Stop",
    async (error) => {
      const session = await startSession();

      session.transcription.stop();
      session.recognition.emitError(error);

      await expect(session.transcription.text).resolves.toBe("");
    },
  );

  it("keeps valid text when recognition later reports an error", async () => {
    const session = await startSession();
    session.recognition.emitResults({ 0: { transcript: "hello" }, isFinal: true });

    session.recognition.emitError("network");

    expect(session.onDelta).toHaveBeenCalledWith("hello");
    await expect(session.transcription.text).resolves.toBe("hello");
  });

  it("fails on an unexpected recognition error", async () => {
    const session = await startSession();

    session.recognition.emitError("network");

    await expect(session.transcription.text).rejects.toThrow("network");
  });
});
