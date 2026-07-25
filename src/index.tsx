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

export {
  ChatVoiceInputProvider,
  type ChatVoiceInputProviderProps,
  type ChatVoiceInputStatus,
  useChatVoiceInput,
} from "./provider";
export type { Transcriber, Transcription } from "./transcription";
export { ChatVoiceInputButton, ChatVoiceInputError, ChatVoiceInputTimer, ChatVoiceInputWaveform };
