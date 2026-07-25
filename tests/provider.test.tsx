import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ChatVoiceInputButton, ChatVoiceInputError } from "../src/controls";
import { ChatVoiceInputProvider } from "../src/provider";
import type { Transcriber, Transcription } from "../src/transcribers/types";

function deferred<T>() {
  let reject!: (reason?: unknown) => void;
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });
  return { promise, reject, resolve };
}

function createRecording(options?: { readonly captureEnded?: Promise<void> }) {
  const text = deferred<string>();
  const stop = vi.fn();
  const transcription = {
    ...options,
    stop,
    stream: {} as MediaStream,
    text: text.promise,
  } satisfies Transcription;
  const start = vi.fn().mockResolvedValue(transcription);
  return { start, stop, text, transcriber: { start } satisfies Transcriber };
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
  render(
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

afterEach(cleanup);

describe("voice input provider", () => {
  describe("starting", () => {
    it("does not start while disabled", () => {
      const session = createRecording();
      renderVoiceInput({ disabled: true, transcriber: session.transcriber });

      fireEvent.click(screen.getByRole("button", { name: "Start voice input" }));

      expect(session.start).not.toHaveBeenCalled();
    });

    it("shows loading while the transcriber requests access", () => {
      const transcriber = {
        start: vi.fn(() => new Promise<never>(() => undefined)),
      } satisfies Transcriber;
      renderVoiceInput({ transcriber });

      fireEvent.click(screen.getByRole("button", { name: "Start voice input" }));

      expect(
        screen.getByRole("button", { name: "Loading voice input" }).hasAttribute("disabled"),
      ).toBe(true);
      expect(screen.queryByRole("button", { name: "Stop voice input" })).toBeNull();
    });

    it("shows a retry action when the transcriber cannot start", async () => {
      const transcriber = {
        start: vi.fn().mockRejectedValue(new Error("transcriber error")),
      } satisfies Transcriber;
      renderVoiceInput({ transcriber });

      fireEvent.click(screen.getByRole("button", { name: "Start voice input" }));

      expect((await screen.findByRole("alert")).textContent).toBe("Voice input is unavailable.");
      expect(
        screen.getByRole("button", { name: "Retry voice input" }).hasAttribute("disabled"),
      ).toBe(false);
    });
  });

  describe("recording", () => {
    it("streams transcript deltas into the current value", async () => {
      const text = deferred<string>();
      const onValueChange = vi.fn();
      const transcriber: Transcriber = {
        async start(onDelta) {
          onDelta("hello");
          onDelta(" world");
          return { stop: vi.fn(), stream: {} as MediaStream, text: text.promise };
        },
      };
      renderVoiceInput({ onValueChange, transcriber, value: "Draft:" });

      fireEvent.click(screen.getByRole("button", { name: "Start voice input" }));
      await screen.findByRole("button", { name: "Stop voice input" });

      expect(onValueChange.mock.calls).toEqual([["Draft: hello"], ["Draft: hello world"]]);
      text.resolve("hello world");
      await screen.findByRole("button", { name: "Start voice input" });
    });

    it("stops the active transcriber and applies its final text", async () => {
      const session = createRecording();
      const onValueChange = vi.fn();
      renderVoiceInput({ onValueChange, transcriber: session.transcriber });

      fireEvent.click(screen.getByRole("button", { name: "Start voice input" }));
      fireEvent.click(await screen.findByRole("button", { name: "Stop voice input" }));
      session.text.resolve("hello world");

      await waitFor(() => expect(onValueChange).toHaveBeenCalledWith("hello world"));
      expect(session.stop).toHaveBeenCalledOnce();
      expect(session.start).toHaveBeenCalledWith(expect.any(Function), expect.any(AbortSignal));
    });

    it("stops reporting recording while final text is pending", async () => {
      const captureEnded = deferred<void>();
      const session = createRecording({ captureEnded: captureEnded.promise });
      renderVoiceInput({ transcriber: session.transcriber });

      fireEvent.click(screen.getByRole("button", { name: "Start voice input" }));
      await screen.findByRole("button", { name: "Stop voice input" });
      captureEnded.resolve();

      await screen.findByRole("button", { name: "Loading voice input" });
      session.text.resolve("");
      await screen.findByRole("button", { name: "Start voice input" });
    });
  });

  describe("completion", () => {
    it("returns to idle when transcription ends on its own", async () => {
      const session = createRecording();
      renderVoiceInput({ transcriber: session.transcriber });

      fireEvent.click(screen.getByRole("button", { name: "Start voice input" }));
      await screen.findByRole("button", { name: "Stop voice input" });
      session.text.resolve("");

      await screen.findByRole("button", { name: "Start voice input" });
      expect(screen.queryByRole("alert")).toBeNull();
    });

    it("preserves the current value when the user stops without speaking", async () => {
      const session = createRecording();
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

    it("shows a retry action when active transcription fails", async () => {
      const session = createRecording();
      renderVoiceInput({ transcriber: session.transcriber });

      fireEvent.click(screen.getByRole("button", { name: "Start voice input" }));
      await screen.findByRole("button", { name: "Stop voice input" });
      session.text.reject(new Error("recognition failed"));

      expect((await screen.findByRole("alert")).textContent).toBe("Voice input is unavailable.");
      expect(
        screen.getByRole("button", { name: "Retry voice input" }).hasAttribute("disabled"),
      ).toBe(false);
    });
  });
});
