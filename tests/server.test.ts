import { afterEach, describe, expect, it, vi } from "vitest";

import { createTranscriptionTokenResponse } from "../src/server";

const gateway = vi.hoisted(() => ({
  getToken: vi.fn(),
}));

vi.mock("@ai-sdk/gateway", () => ({
  createGateway: vi.fn(() => ({
    experimental_transcription: {
      getToken: gateway.getToken,
    },
  })),
}));

afterEach(() => {
  vi.restoreAllMocks();
  gateway.getToken.mockReset();
});

describe("createTranscriptionTokenResponse", () => {
  it("returns a short-lived token without caching it", async () => {
    gateway.getToken.mockResolvedValue({ token: "secret" });

    const response = await createTranscriptionTokenResponse({ apiKey: "gateway-key" });

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual({
      model: "openai/gpt-realtime-whisper",
      token: "secret",
    });
    expect(gateway.getToken).toHaveBeenCalledWith({
      model: "openai/gpt-realtime-whisper",
    });
  });

  it("uses the configured model", async () => {
    gateway.getToken.mockResolvedValue({ token: "secret" });

    const response = await createTranscriptionTokenResponse({ model: "openai/custom-whisper" });

    await expect(response.json()).resolves.toEqual({
      model: "openai/custom-whisper",
      token: "secret",
    });
    expect(gateway.getToken).toHaveBeenCalledWith({ model: "openai/custom-whisper" });
  });

  it("returns a safe service error", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    gateway.getToken.mockRejectedValue(new Error("provider error"));

    const response = await createTranscriptionTokenResponse();

    expect(response.status).toBe(503);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual({
      error: "Voice input is unavailable.",
    });
  });
});
