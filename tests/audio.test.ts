import { afterEach, describe, expect, it, vi } from "vitest";

import { createPcmStream } from "../src/audio";

class FakeAudioNode {
  connect = vi.fn();
  disconnect = vi.fn();
}

class FakeAudioContext {
  static instance: FakeAudioContext | undefined;

  readonly audioWorklet = { addModule: vi.fn().mockResolvedValue(undefined) };
  readonly close = vi.fn().mockResolvedValue(undefined);
  readonly resume = vi.fn().mockResolvedValue(undefined);
  readonly sampleRate: number;
  readonly source = new FakeAudioNode();

  constructor(options: { readonly sampleRate: number }) {
    this.sampleRate = options.sampleRate;
    FakeAudioContext.instance = this;
  }

  createMediaStreamSource = vi.fn(() => this.source);
}

class FakeAudioWorkletNode extends FakeAudioNode {
  static instance: FakeAudioWorkletNode | undefined;
  static name = "";
  static options: AudioWorkletNodeOptions | undefined;

  readonly port = { onmessage: null as ((event: MessageEvent<ArrayBuffer>) => void) | null };

  constructor(_context: BaseAudioContext, name: string, options?: AudioWorkletNodeOptions) {
    super();
    FakeAudioWorkletNode.instance = this;
    FakeAudioWorkletNode.name = name;
    FakeAudioWorkletNode.options = options;
  }
}

function installAudio(): void {
  vi.stubGlobal("AudioContext", FakeAudioContext);
  vi.stubGlobal("AudioWorkletNode", FakeAudioWorkletNode);
}

function mediaStream() {
  const track = { stop: vi.fn() };
  const stream = { getTracks: () => [track] } as unknown as MediaStream;
  return { stream, track };
}

afterEach(() => {
  vi.unstubAllGlobals();
  FakeAudioContext.instance = undefined;
  FakeAudioWorkletNode.instance = undefined;
  FakeAudioWorkletNode.name = "";
  FakeAudioWorkletNode.options = undefined;
});

describe("PCM stream", () => {
  it("creates a 24 kHz signed 16-bit little-endian stream by default", async () => {
    installAudio();
    const { stream } = mediaStream();

    const pcm = await createPcmStream(stream);

    expect(pcm.format).toBe("s16le");
    expect(pcm.sampleRate).toBe(24_000);
    expect(FakeAudioWorkletNode.name).toBe("pcm-processor");
    expect(FakeAudioWorkletNode.options).toEqual({
      numberOfInputs: 1,
      numberOfOutputs: 0,
    });
    expect(FakeAudioContext.instance?.source.connect).toHaveBeenCalledWith(
      FakeAudioWorkletNode.instance,
    );
  });

  it("closes only its audio graph and leaves microphone ownership to the caller", async () => {
    installAudio();
    const { stream, track } = mediaStream();
    const pcm = await createPcmStream(stream, { sampleRate: 16_000 });

    await pcm.close();
    await pcm.close();

    expect(pcm.sampleRate).toBe(16_000);
    expect(FakeAudioContext.instance?.source.disconnect).toHaveBeenCalledOnce();
    expect(FakeAudioWorkletNode.instance?.disconnect).toHaveBeenCalledOnce();
    expect(FakeAudioContext.instance?.close).toHaveBeenCalledOnce();
    expect(track.stop).not.toHaveBeenCalled();
  });
});
