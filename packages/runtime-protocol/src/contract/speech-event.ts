// Model-download progress/failure and dictation lifecycle. Desktop microphone
// audio stays on its BrowserWindow-scoped shell IPC path, but its low-frequency
// lifecycle events share this feed with paired mobile/web dictation sessions.
// A globally unique dictationId keeps desktop-window and remote sessions from
// consuming each other's events.

export type SpeechDownloadProgressEvent = {
  modelId: string
  progress: number
}

export type SpeechDownloadFailedEvent = {
  modelId: string
  error: string
}

export type SpeechDictationReadyEvent = {
  dictationId: string
}

export type SpeechDictationPartialTranscriptEvent = {
  dictationId: string
  text: string
}

export type SpeechDictationFinalTranscriptEvent = {
  dictationId: string
  text: string
}

export type SpeechDictationStoppedEvent = {
  dictationId: string
}

export type SpeechDictationErrorEvent = {
  dictationId: string
  error: string
}

export type RuntimeSpeechEvent =
  | ({ type: 'downloadProgress' } & SpeechDownloadProgressEvent)
  | ({ type: 'downloadFailed' } & SpeechDownloadFailedEvent)
  | ({ type: 'dictationReady' } & SpeechDictationReadyEvent)
  | ({ type: 'dictationPartialTranscript' } & SpeechDictationPartialTranscriptEvent)
  | ({ type: 'dictationFinalTranscript' } & SpeechDictationFinalTranscriptEvent)
  | ({ type: 'dictationStopped' } & SpeechDictationStoppedEvent)
  | ({ type: 'dictationError' } & SpeechDictationErrorEvent)

export type RuntimeSpeechSubscriptionEvent =
  | { type: 'ready'; subscriptionId: string }
  | RuntimeSpeechEvent
  | { type: 'end' }
