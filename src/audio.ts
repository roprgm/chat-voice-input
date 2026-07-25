import processorUrl from "./pcm-processor.js?worker&url";

const defaultSampleRate = 24_000;

export type PcmFormat = "s16le";

export type CreatePcmStreamOptions = {
  readonly format?: PcmFormat;
  readonly sampleRate?: number;
};

export type PcmStream = {
  readonly close: () => Promise<void>;
  readonly format: PcmFormat;
  readonly readable: ReadableStream<Uint8Array>;
  readonly sampleRate: number;
};

export async function createPcmStream(
  stream: MediaStream,
  options?: CreatePcmStreamOptions,
): Promise<PcmStream> {
  const format = options?.format ?? "s16le";
  const context = new AudioContext({ sampleRate: options?.sampleRate ?? defaultSampleRate });

  try {
    await context.audioWorklet.addModule(processorUrl);
  } catch (error) {
    await context.close();
    throw error;
  }

  let source: MediaStreamAudioSourceNode;
  let processor: AudioWorkletNode;
  try {
    source = context.createMediaStreamSource(stream);
    processor = new AudioWorkletNode(context, "pcm-processor", {
      numberOfInputs: 1,
      numberOfOutputs: 0,
    });
    source.connect(processor);
  } catch (error) {
    await context.close();
    throw error;
  }

  let controller!: ReadableStreamDefaultController<Uint8Array>;
  let closed = false;

  async function cleanup(closeReadable: boolean): Promise<void> {
    if (closed) return;
    closed = true;
    processor.port.onmessage = null;
    if (closeReadable) controller.close();
    source.disconnect();
    processor.disconnect();
    await context.close();
  }

  const readable = new ReadableStream<Uint8Array>({
    cancel: () => cleanup(false),
    start(nextController) {
      controller = nextController;
      processor.port.onmessage = ({ data }: MessageEvent<ArrayBuffer>) => {
        if (!closed) controller.enqueue(new Uint8Array(data));
      };
    },
  });

  try {
    await context.resume();
  } catch (error) {
    await cleanup(true);
    throw error;
  }
  return {
    close: () => cleanup(true),
    format,
    readable,
    sampleRate: context.sampleRate,
  };
}
