export type Transcription = {
  readonly stop: () => void | Promise<void>;
  readonly text: Promise<string>;
};

export type TranscriberInput = {
  readonly onDelta: (delta: string) => void;
  readonly signal: AbortSignal;
  readonly stream: MediaStream;
};

export type Transcriber = {
  readonly isSupported?: () => boolean;
  readonly start: (input: TranscriberInput) => Promise<Transcription>;
};
