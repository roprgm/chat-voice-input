export type Transcription = {
  readonly stop: () => void;
  readonly stream: MediaStream | undefined;
  readonly text: Promise<string>;
};

export type Transcriber = {
  readonly start: (onDelta: (delta: string) => void, signal: AbortSignal) => Promise<Transcription>;
};
