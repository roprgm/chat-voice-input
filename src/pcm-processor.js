// Batch the 128-frame render quantum into 20 ms chunks so the audio thread posts
// roughly 50 messages per second instead of one per quantum.
const frameSize = Math.round(sampleRate * 0.02);

class PcmProcessor extends AudioWorkletProcessor {
  frame = new ArrayBuffer(frameSize * 2);
  view = new DataView(this.frame);
  offset = 0;

  process(inputs) {
    const input = inputs[0]?.[0];
    if (!input) return true;

    for (let index = 0; index < input.length; index += 1) {
      const sample = Math.max(-1, Math.min(1, input[index]));
      const value = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
      this.view.setInt16(this.offset * 2, value, true);
      this.offset += 1;

      if (this.offset === frameSize) {
        this.port.postMessage(this.frame, [this.frame]);
        this.frame = new ArrayBuffer(frameSize * 2);
        this.view = new DataView(this.frame);
        this.offset = 0;
      }
    }

    return true;
  }
}

registerProcessor("pcm-processor", PcmProcessor);
