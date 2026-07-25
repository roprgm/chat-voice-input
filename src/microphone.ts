import processorUrl from "./pcm-processor.js?worker&url";

const sampleRate = 24_000;

export type MicrophonePCMStream = {
  readonly audioStream: ReadableStream<Uint8Array>;
  readonly mediaStream: MediaStream;
  readonly sampleRate: number;
  readonly stop: () => Promise<void>;
};

export async function createMicrophonePCMStream(): Promise<MicrophonePCMStream> {
  const mediaStream = await navigator.mediaDevices.getUserMedia({
    audio: {
      autoGainControl: true,
      channelCount: 1,
      echoCancellation: true,
      noiseSuppression: true,
    },
  });
  const context = new AudioContext({ sampleRate });

  try {
    await context.audioWorklet.addModule(processorUrl);
  } catch (error) {
    for (const track of mediaStream.getTracks()) track.stop();
    void context.close();
    throw error;
  }

  const source = context.createMediaStreamSource(mediaStream);
  const processor = new AudioWorkletNode(context, "pcm-processor");
  const silent = context.createGain();
  silent.gain.value = 0;
  source.connect(processor).connect(silent).connect(context.destination);

  let controller!: ReadableStreamDefaultController<Uint8Array>;
  let closed = false;

  async function cleanup(): Promise<void> {
    if (closed) return;
    closed = true;
    processor.port.onmessage = null;
    source.disconnect();
    processor.disconnect();
    silent.disconnect();
    for (const track of mediaStream.getTracks()) track.stop();
    await context.close();
  }

  const audioStream = new ReadableStream<Uint8Array>({
    cancel: cleanup,
    start(nextController) {
      controller = nextController;
      processor.port.onmessage = ({ data }: MessageEvent<ArrayBuffer>) => {
        if (!closed) controller.enqueue(new Uint8Array(data));
      };
    },
  });

  await context.resume();
  return {
    audioStream,
    mediaStream,
    sampleRate: context.sampleRate,
    async stop() {
      if (!closed) controller.close();
      await cleanup();
    },
  };
}
