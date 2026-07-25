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
  static startError: unknown;

  continuous = false;
  lang = "";
  onaudioend: (() => void) | null = null;
  onaudiostart: (() => void) | null = null;
  onend: (() => void) | null = null;
  onerror: ((event: { readonly error: string }) => void) | null = null;
  onresult: ((event: RecognitionEvent) => void) | null = null;
  abort = vi.fn(() => this.onend?.());
  start = vi.fn(() => {
    if (FakeRecognition.startError) throw FakeRecognition.startError;
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

  disconnect(): void {
    this.dispatchEvent(new Event("ended"));
  }
}

type Microphone = {
  readonly getUserMedia: ReturnType<typeof vi.fn>;
  readonly stream: MediaStream;
  readonly track: FakeMicrophoneTrack;
};

type Session = {
  readonly controller: AbortController;
  readonly microphone: Microphone;
  readonly onDelta: ReturnType<typeof vi.fn>;
  readonly recognition: FakeRecognition;
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

function stubNavigator(getUserMedia: ReturnType<typeof vi.fn>, language = "en-US"): void {
  vi.stubGlobal("navigator", { language, mediaDevices: { getUserMedia } });
}

function stubMicrophone(language = "en-US"): Microphone {
  const track = new FakeMicrophoneTrack();
  const stream = { getTracks: () => [track] } as unknown as MediaStream;
  const getUserMedia = vi.fn().mockResolvedValue(stream);
  stubNavigator(getUserMedia, language);
  return { getUserMedia, stream, track };
}

async function startSession(options?: {
  readonly api?: "standard" | "webkit";
  readonly browserLanguage?: string;
  readonly language?: string;
}): Promise<Session> {
  installRecognition(options?.api);
  const microphone = stubMicrophone(options?.browserLanguage);
  const controller = new AbortController();
  const onDelta = vi.fn();
  const transcription = await createNativeTranscriber({ language: options?.language }).start(
    onDelta,
    controller.signal,
  );
  return { controller, microphone, onDelta, recognition: recognition(), transcription };
}

afterEach(() => {
  vi.unstubAllGlobals();
  FakeRecognition.autoStartAudio = true;
  FakeRecognition.instance = undefined;
  FakeRecognition.startError = undefined;
});

describe("native transcriber", () => {
  describe("support and microphone permission", () => {
    it("checks speech recognition support before requesting the microphone", async () => {
      installRecognition();
      vi.stubGlobal("SpeechRecognition", undefined);
      const microphone = stubMicrophone();

      await expect(
        createNativeTranscriber().start(vi.fn(), new AbortController().signal),
      ).rejects.toThrow("Speech recognition is unavailable in this browser.");
      expect(microphone.getUserMedia).not.toHaveBeenCalled();
    });

    it("requests microphone permission immediately", async () => {
      installRecognition();
      let grantPermission!: (stream: MediaStream) => void;
      const permission = new Promise<MediaStream>((resolve) => {
        grantPermission = resolve;
      });
      const getUserMedia = vi.fn().mockReturnValue(permission);
      stubNavigator(getUserMedia);

      const started = createNativeTranscriber().start(vi.fn(), new AbortController().signal);

      expect(getUserMedia).toHaveBeenCalledWith({ audio: true });
      expect(recognition().start).not.toHaveBeenCalled();

      grantPermission({ getTracks: () => [] } as unknown as MediaStream);
      await started;
      expect(recognition().start).toHaveBeenCalledOnce();
    });

    it("fails when microphone access is unavailable", async () => {
      installRecognition();
      vi.stubGlobal("navigator", { language: "en-US" });

      await expect(
        createNativeTranscriber().start(vi.fn(), new AbortController().signal),
      ).rejects.toThrow("Microphone access is unavailable in this browser.");
      expect(recognition().start).not.toHaveBeenCalled();
    });

    it.each([
      "AbortError",
      "InvalidStateError",
      "NotAllowedError",
      "NotFoundError",
      "NotReadableError",
      "OverconstrainedError",
      "SecurityError",
      "TypeError",
    ])("preserves the microphone failure %s", async (name) => {
      installRecognition();
      const error = new DOMException("microphone failed", name);
      const getUserMedia = vi.fn().mockRejectedValue(error);
      stubNavigator(getUserMedia);

      await expect(
        createNativeTranscriber().start(vi.fn(), new AbortController().signal),
      ).rejects.toBe(error);
      expect(recognition().start).not.toHaveBeenCalled();
    });

    it("closes a microphone granted after the request was cancelled", async () => {
      installRecognition();
      let grantPermission!: (stream: MediaStream) => void;
      const permission = new Promise<MediaStream>((resolve) => {
        grantPermission = resolve;
      });
      const track = new FakeMicrophoneTrack();
      const getUserMedia = vi.fn().mockReturnValue(permission);
      const controller = new AbortController();
      stubNavigator(getUserMedia);

      const started = createNativeTranscriber().start(vi.fn(), controller.signal);
      controller.abort();
      grantPermission({ getTracks: () => [track] } as unknown as MediaStream);

      await expect(started).rejects.toMatchObject({ name: "AbortError" });
      expect(track.stop).toHaveBeenCalledOnce();
      expect(recognition().start).not.toHaveBeenCalled();
    });
  });

  describe("starting capture", () => {
    it("supports the prefixed webkit recognition API", async () => {
      const session = await startSession({ api: "webkit", browserLanguage: "es-ES" });

      expect(session.recognition.lang).toBe("es-ES");
      session.controller.abort();
      await expect(session.transcription.text).resolves.toBe("");
    });

    it("configures continuous recognition and an explicit language", async () => {
      const session = await startSession({ language: "es-ES" });

      expect(session.recognition.continuous).toBe(true);
      expect(session.recognition.lang).toBe("es-ES");
      session.recognition.onend?.();
      await session.transcription.text;
    });

    it("waits for confirmed audio capture before starting the session", async () => {
      installRecognition();
      FakeRecognition.autoStartAudio = false;
      stubMicrophone();
      let hasStarted = false;

      const pendingSession = createNativeTranscriber()
        .start(vi.fn(), new AbortController().signal)
        .then((session) => {
          hasStarted = true;
          return session;
        });
      await vi.waitFor(() => expect(recognition().start).toHaveBeenCalledOnce());

      expect(hasStarted).toBe(false);
      recognition().onaudiostart?.();

      const session = await pendingSession;
      expect(hasStarted).toBe(true);
      recognition().onaudioend?.();
      await expect(session.captureEnded).resolves.toBeUndefined();
      recognition().onend?.();
      await session.text;
    });

    it("closes the microphone when recognition cannot start", async () => {
      installRecognition();
      const microphone = stubMicrophone();
      const error = new DOMException("already active", "InvalidStateError");
      FakeRecognition.startError = error;

      await expect(
        createNativeTranscriber().start(vi.fn(), new AbortController().signal),
      ).rejects.toBe(error);
      expect(microphone.track.stop).toHaveBeenCalledOnce();
    });
  });

  describe("recording", () => {
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
      expect(session.transcription.stream).toBe(session.microphone.stream);
      expect(session.recognition.stop).toHaveBeenCalledOnce();
      expect(session.microphone.track.stop).toHaveBeenCalledOnce();
      await expect(session.transcription.text).resolves.toBe("hola mundo");
    });

    it("aborts recognition and closes the microphone with its signal", async () => {
      const session = await startSession();

      session.controller.abort();

      expect(session.recognition.abort).toHaveBeenCalledOnce();
      expect(session.microphone.track.stop).toHaveBeenCalledOnce();
      await expect(session.transcription.text).resolves.toBe("");
    });

    it("fails when the microphone disconnects before producing text", async () => {
      const session = await startSession();

      session.microphone.track.disconnect();

      await expect(session.transcription.text).rejects.toThrow("audio-capture");
      expect(session.recognition.abort).toHaveBeenCalledOnce();
    });
  });

  describe("completion", () => {
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

    it("keeps valid text when recognition later reports an error", async () => {
      const session = await startSession();
      session.recognition.emitResults({ 0: { transcript: "hello" }, isFinal: true });

      session.recognition.emitError("network");

      expect(session.onDelta).toHaveBeenCalledWith("hello");
      await expect(session.transcription.text).resolves.toBe("hello");
    });

    it.each([
      "audio-capture",
      "bad-grammar",
      "language-not-supported",
      "network",
      "not-allowed",
      "phrases-not-supported",
      "service-not-allowed",
    ])("fails and closes the microphone on recognition error %s", async (error) => {
      const session = await startSession();

      session.recognition.emitError(error);

      await expect(session.transcription.text).rejects.toThrow(error);
      expect(session.microphone.track.stop).toHaveBeenCalledOnce();
    });
  });
});
