import { afterEach, describe, expect, it, vi } from "vitest";

import { createPcmStream } from "../src/audio";

class FakeAudioNode {
  connect = vi.fn();
  disconnect = vi.fn();
}

class FakeAudioContext {
  readonly audioWorklet = { addModule: vi.fn().mockResolvedValue(undefined) };
  readonly close = vi.fn().mockResolvedValue(undefined);
  readonly resume = vi.fn().mockResolvedValue(undefined);
  readonly sampleRate = 24_000;

  createMediaStreamSource = vi.fn(() => new FakeAudioNode());
}

class FakeAudioWorkletNode extends FakeAudioNode {
  readonly port = { onmessage: null };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("PCM stream", () => {
  it("does not stop the microphone when it closes", async () => {
    vi.stubGlobal("AudioContext", FakeAudioContext);
    vi.stubGlobal("AudioWorkletNode", FakeAudioWorkletNode);
    const track = { stop: vi.fn() };
    const stream = { getTracks: () => [track] } as unknown as MediaStream;

    const pcm = await createPcmStream(stream);
    await pcm.close();

    expect(track.stop).not.toHaveBeenCalled();
  });
});
