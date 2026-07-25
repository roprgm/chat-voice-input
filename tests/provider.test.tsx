import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ChatVoiceInputButton, ChatVoiceInputError } from "../src/controls";
import { ChatVoiceInputProvider } from "../src/provider";
import type { Transcriber } from "../src/transcribers/types";

afterEach(cleanup);

describe("ChatVoiceInputProvider", () => {
  it("uses the injected transcriber", async () => {
    const onValueChange = vi.fn();
    const stop = vi.fn();
    const start = vi.fn().mockResolvedValue({
      stop,
      stream: {} as MediaStream,
      text: Promise.resolve("hello world"),
    });
    const transcriber = { start } satisfies Transcriber;

    render(
      <ChatVoiceInputProvider
        disabled={false}
        onValueChange={onValueChange}
        transcriber={transcriber}
        value=""
      >
        <ChatVoiceInputButton />
      </ChatVoiceInputProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Start voice input" }));
    const stopButton = await screen.findByRole("button", { name: "Stop voice input" });

    expect(start).toHaveBeenCalledWith(expect.any(Function), expect.any(AbortSignal));

    fireEvent.click(stopButton);
    await waitFor(() => expect(onValueChange).toHaveBeenCalledWith("hello world"));
    expect(stop).toHaveBeenCalledOnce();
  });

  it("shows an actionable error when transcription fails", async () => {
    const transcriber = {
      start: vi.fn().mockRejectedValue(new Error("transcriber error")),
    } satisfies Transcriber;

    render(
      <ChatVoiceInputProvider
        disabled={false}
        onValueChange={vi.fn()}
        transcriber={transcriber}
        value=""
      >
        <ChatVoiceInputError />
        <ChatVoiceInputButton />
      </ChatVoiceInputProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Start voice input" }));

    expect((await screen.findByRole("alert")).textContent).toBe("Voice input is unavailable.");
    expect(screen.getByRole("button", { name: "Retry voice input" }).hasAttribute("disabled")).toBe(
      false,
    );
  });

  it("does not start while disabled", () => {
    const transcriber = {
      start: vi.fn().mockResolvedValue({
        stop: vi.fn(),
        stream: undefined,
        text: new Promise<string>(() => undefined),
      }),
    } satisfies Transcriber;

    render(
      <ChatVoiceInputProvider disabled onValueChange={vi.fn()} transcriber={transcriber} value="">
        <ChatVoiceInputButton />
      </ChatVoiceInputProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Start voice input" }));

    expect(transcriber.start).not.toHaveBeenCalled();
  });
});
