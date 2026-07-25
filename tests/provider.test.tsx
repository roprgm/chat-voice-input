import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ChatVoiceInputButton, ChatVoiceInputError } from "../src/controls";
import { ChatVoiceInputProvider } from "../src/provider";
import { createNativeTranscriber } from "../src/transcribers/native";
import type { Transcriber, TranscriberInput, Transcription } from "../src/transcribers/types";

function deferred<T>() {
  let reject!: (reason?: unknown) => void;
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });
  return { promise, reject, resolve };
}

class FakeMicrophoneTrack extends EventTarget {
  stop = vi.fn();

  disconnect(): void {
    this.dispatchEvent(new Event("ended"));
  }
}

function microphone(permission?: Promise<MediaStream>) {
  const track = new FakeMicrophoneTrack();
  const stream = { getTracks: () => [track] } as unknown as MediaStream;
  const getUserMedia = vi.fn().mockReturnValue(permission ?? Promise.resolve(stream));
  vi.stubGlobal("navigator", { mediaDevices: { getUserMedia } });
  return { getUserMedia, track };
}

function recording() {
  const text = deferred<string>();
  const stop = vi.fn();
  const transcription = { stop, text: text.promise } satisfies Transcription;
  const start = vi.fn(async (_input: TranscriberInput) => transcription);
  return { start, stop, text, transcriber: { start } satisfies Transcriber };
}

function firstInput(start: ReturnType<typeof vi.fn>): TranscriberInput {
  const input = start.mock.calls[0]?.[0] as TranscriberInput | undefined;
  if (!input) throw new Error("Expected the transcriber to start.");
  return input;
}

function renderVoiceInput({
  disabled = false,
  onValueChange = vi.fn(),
  transcriber,
  value = "",
}: {
  readonly disabled?: boolean;
  readonly onValueChange?: (value: string) => void;
  readonly transcriber: Transcriber;
  readonly value?: string;
}) {
  return render(
    <ChatVoiceInputProvider
      disabled={disabled}
      onValueChange={onValueChange}
      transcriber={transcriber}
      value={value}
    >
      <ChatVoiceInputError />
      <ChatVoiceInputButton />
    </ChatVoiceInputProvider>,
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("voice input provider", () => {
  it("does nothing while voice input is disabled", () => {
    const mic = microphone();
    const session = recording();
    renderVoiceInput({ disabled: true, transcriber: session.transcriber });

    fireEvent.click(screen.getByRole("button", { name: "Start voice input" }));

    expect(mic.getUserMedia).not.toHaveBeenCalled();
    expect(session.start).not.toHaveBeenCalled();
  });

  it("rejects an unsupported local transcriber before requesting the microphone", async () => {
    const mic = microphone();
    vi.stubGlobal("SpeechRecognition", undefined);
    vi.stubGlobal("webkitSpeechRecognition", undefined);
    renderVoiceInput({ transcriber: createNativeTranscriber() });

    fireEvent.click(screen.getByRole("button", { name: "Start voice input" }));

    expect((await screen.findByRole("alert")).textContent).toBe("Voice input is unavailable.");
    expect(mic.getUserMedia).not.toHaveBeenCalled();
  });

  it("renders Loading before requesting microphone permission", () => {
    const session = recording();
    const getUserMedia = vi.fn(() => {
      expect(screen.getByRole("button", { name: "Loading voice input" })).toBeTruthy();
      return new Promise<MediaStream>(() => undefined);
    });
    vi.stubGlobal("navigator", { mediaDevices: { getUserMedia } });
    renderVoiceInput({ transcriber: session.transcriber });

    fireEvent.click(screen.getByRole("button", { name: "Start voice input" }));

    expect(getUserMedia).toHaveBeenCalledOnce();
    expect(session.start).not.toHaveBeenCalled();
  });

  it("shows Retry when microphone permission is denied", async () => {
    microphone(Promise.reject(new DOMException("denied", "NotAllowedError")));
    const session = recording();
    renderVoiceInput({ transcriber: session.transcriber });

    fireEvent.click(screen.getByRole("button", { name: "Start voice input" }));

    expect((await screen.findByRole("alert")).textContent).toBe("Voice input is unavailable.");
    expect(screen.getByRole("button", { name: "Retry voice input" })).toBeTruthy();
    expect(session.start).not.toHaveBeenCalled();
  });

  it("shows Retry when the microphone API is unavailable", async () => {
    vi.stubGlobal("navigator", {});
    const session = recording();
    renderVoiceInput({ transcriber: session.transcriber });

    fireEvent.click(screen.getByRole("button", { name: "Start voice input" }));

    expect((await screen.findByRole("alert")).textContent).toBe("Voice input is unavailable.");
    expect(session.start).not.toHaveBeenCalled();
  });

  it("keeps Loading visible while the transcriber starts", async () => {
    const mic = microphone();
    const transcriber = {
      start: vi.fn(() => new Promise<Transcription>(() => undefined)),
    } satisfies Transcriber;
    renderVoiceInput({ transcriber });

    fireEvent.click(screen.getByRole("button", { name: "Start voice input" }));

    await waitFor(() => expect(transcriber.start).toHaveBeenCalledOnce());
    expect(screen.getByRole("button", { name: "Loading voice input" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Stop voice input" })).toBeNull();
    expect(mic.track.stop).not.toHaveBeenCalled();
  });

  it("releases the microphone and shows Retry when the transcriber times out", async () => {
    const mic = microphone();
    const transcriber = {
      start: vi.fn().mockRejectedValue(new DOMException("timed out", "TimeoutError")),
    } satisfies Transcriber;
    renderVoiceInput({ transcriber });

    fireEvent.click(screen.getByRole("button", { name: "Start voice input" }));

    expect((await screen.findByRole("alert")).textContent).toBe("Voice input is unavailable.");
    expect(mic.track.stop).toHaveBeenCalledOnce();
  });

  it("streams transcript deltas into the current value", async () => {
    microphone();
    const text = deferred<string>();
    const onValueChange = vi.fn();
    const transcriber: Transcriber = {
      async start({ onDelta }) {
        onDelta("hello");
        onDelta(" world");
        return { stop: vi.fn(), text: text.promise };
      },
    };
    renderVoiceInput({ onValueChange, transcriber, value: "Draft:" });

    fireEvent.click(screen.getByRole("button", { name: "Start voice input" }));
    await screen.findByRole("button", { name: "Stop voice input" });

    expect(onValueChange.mock.calls).toEqual([["Draft: hello"], ["Draft: hello world"]]);
    text.resolve("hello world");
    await screen.findByRole("button", { name: "Start voice input" });
  });

  it("stops capture immediately and waits for the final text", async () => {
    const mic = microphone();
    const session = recording();
    const onValueChange = vi.fn();
    renderVoiceInput({ onValueChange, transcriber: session.transcriber });

    fireEvent.click(screen.getByRole("button", { name: "Start voice input" }));
    fireEvent.click(await screen.findByRole("button", { name: "Stop voice input" }));

    expect(session.stop).toHaveBeenCalledOnce();
    expect(mic.track.stop).toHaveBeenCalledOnce();
    expect(screen.getByRole("button", { name: "Loading voice input" })).toBeTruthy();

    session.text.resolve("hello world");
    await waitFor(() => expect(onValueChange).toHaveBeenCalledWith("hello world"));
    await screen.findByRole("button", { name: "Start voice input" });
  });

  it("returns to idle without an error when the user stops without speaking", async () => {
    microphone();
    const session = recording();
    const onValueChange = vi.fn();
    renderVoiceInput({
      onValueChange,
      transcriber: session.transcriber,
      value: "existing text",
    });

    fireEvent.click(screen.getByRole("button", { name: "Start voice input" }));
    fireEvent.click(await screen.findByRole("button", { name: "Stop voice input" }));
    session.text.resolve("");

    await screen.findByRole("button", { name: "Start voice input" });
    expect(screen.queryByRole("alert")).toBeNull();
    expect(onValueChange).not.toHaveBeenCalled();
  });

  it("releases the microphone when transcription ends on its own", async () => {
    const mic = microphone();
    const session = recording();
    renderVoiceInput({ transcriber: session.transcriber });

    fireEvent.click(screen.getByRole("button", { name: "Start voice input" }));
    await screen.findByRole("button", { name: "Stop voice input" });
    session.text.resolve("");

    await screen.findByRole("button", { name: "Start voice input" });
    expect(mic.track.stop).toHaveBeenCalledOnce();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("aborts capture and shows Retry when the transcriber fails", async () => {
    const mic = microphone();
    const session = recording();
    renderVoiceInput({ transcriber: session.transcriber });

    fireEvent.click(screen.getByRole("button", { name: "Start voice input" }));
    await screen.findByRole("button", { name: "Stop voice input" });
    const { signal } = firstInput(session.start);
    session.text.reject(new Error("transcription failed"));

    expect((await screen.findByRole("alert")).textContent).toBe("Voice input is unavailable.");
    expect(signal.aborted).toBe(true);
    expect(mic.track.stop).toHaveBeenCalledOnce();
  });

  it("aborts transcription and shows Retry when the microphone disconnects", async () => {
    const mic = microphone();
    const session = recording();
    renderVoiceInput({ transcriber: session.transcriber });

    fireEvent.click(screen.getByRole("button", { name: "Start voice input" }));
    await screen.findByRole("button", { name: "Stop voice input" });
    const { signal } = firstInput(session.start);
    mic.track.disconnect();

    expect((await screen.findByRole("alert")).textContent).toBe("Voice input is unavailable.");
    expect(signal.aborted).toBe(true);
  });

  it("releases the microphone when disabled during recording", async () => {
    const mic = microphone();
    const session = recording();
    const view = renderVoiceInput({ transcriber: session.transcriber });

    fireEvent.click(screen.getByRole("button", { name: "Start voice input" }));
    await screen.findByRole("button", { name: "Stop voice input" });
    const { signal } = firstInput(session.start);
    view.rerender(
      <ChatVoiceInputProvider
        disabled
        onValueChange={vi.fn()}
        transcriber={session.transcriber}
        value=""
      >
        <ChatVoiceInputError />
        <ChatVoiceInputButton />
      </ChatVoiceInputProvider>,
    );

    await waitFor(() => expect(signal.aborted).toBe(true));
    expect(mic.track.stop).toHaveBeenCalledOnce();
  });
});
