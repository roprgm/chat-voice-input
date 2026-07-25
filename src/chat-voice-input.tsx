import { ChatVoiceInputButton, ChatVoiceInputError } from "./controls";
import { ChatVoiceInputProvider, type ChatVoiceInputProviderProps } from "./provider";
import { ChatVoiceInputTimer } from "./timer";
import { ChatVoiceInputWaveform } from "./waveform";

export type ChatVoiceInputProps = Omit<ChatVoiceInputProviderProps, "children">;

function ChatVoiceInput(props: ChatVoiceInputProps) {
  return (
    <ChatVoiceInputProvider {...props}>
      <ChatVoiceInputError />
      <ChatVoiceInputWaveform />
      <ChatVoiceInputTimer />
      <ChatVoiceInputButton />
    </ChatVoiceInputProvider>
  );
}

export default Object.assign(ChatVoiceInput, {
  Button: ChatVoiceInputButton,
  Error: ChatVoiceInputError,
  Provider: ChatVoiceInputProvider,
  Timer: ChatVoiceInputTimer,
  Waveform: ChatVoiceInputWaveform,
});
