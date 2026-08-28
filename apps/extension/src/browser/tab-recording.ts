const MAX_CAPTURE_BYTES = 8 * 1024 * 1024

type ActiveTabRecording = {
  bytes: number
  chunks: Blob[]
  recorder: MediaRecorder
  stream: MediaStream
}

let activeRecording: ActiveTabRecording | null = null

export async function startTabVideoRecording(): Promise<void> {
  if (activeRecording) {
    return
  }
  const streamId = await chrome.tabCapture.getMediaStreamId()
  const constraints: unknown = {
    audio: false,
    video: {
      mandatory: {
        chromeMediaSource: 'tab',
        chromeMediaSourceId: streamId,
        maxFrameRate: 20
      }
    }
  }
  const rawStream: unknown = await Reflect.apply(
    navigator.mediaDevices.getUserMedia,
    navigator.mediaDevices,
    [constraints]
  )
  if (!(rawStream instanceof MediaStream)) {
    throw new Error('tab_capture_stream_invalid')
  }
  const mimeType = supportedMimeType()
  const recorder = new MediaRecorder(rawStream, {
    bitsPerSecond: 600_000,
    ...(mimeType ? { mimeType } : {})
  })
  const recording: ActiveTabRecording = { bytes: 0, chunks: [], recorder, stream: rawStream }
  recorder.addEventListener('dataavailable', (event) => {
    if (event.data.size === 0 || recording.bytes >= MAX_CAPTURE_BYTES) {
      return
    }
    const remaining = MAX_CAPTURE_BYTES - recording.bytes
    const chunk = event.data.size > remaining ? event.data.slice(0, remaining) : event.data
    recording.chunks.push(chunk)
    recording.bytes += chunk.size
  })
  recorder.start(1_000)
  activeRecording = recording
}

export async function stopTabVideoRecording(): Promise<Blob | null> {
  const recording = activeRecording
  activeRecording = null
  if (!recording) {
    return null
  }
  const stopped = new Promise<void>((resolve) =>
    recording.recorder.addEventListener('stop', () => resolve(), { once: true })
  )
  if (recording.recorder.state !== 'inactive') {
    recording.recorder.stop()
  }
  await stopped
  for (const track of recording.stream.getTracks()) {
    track.stop()
  }
  return recording.chunks.length > 0
    ? new Blob(recording.chunks, { type: recording.recorder.mimeType || 'video/webm' })
    : null
}

function supportedMimeType(): string | null {
  return (
    ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'].find((candidate) =>
      MediaRecorder.isTypeSupported(candidate)
    ) ?? null
  )
}
