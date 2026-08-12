export const TERMINAL_MULTIPLEX_WEBVIEW_JS = String.raw`
  var pendingOutputAckBytes = 0;
  var pendingOutputAckSeq = null;
  var outputAckThresholdBytes = 16 * 1024;
  var outputAckTimer = null;
  var multiplexQueuedBytes = 0;

  function resetMultiplexParseState() {
    if (outputAckTimer !== null) clearTimeout(outputAckTimer);
    outputAckTimer = null;
    pendingOutputAckBytes = 0;
    pendingOutputAckSeq = null;
    outputAckThresholdBytes = 16 * 1024;
    multiplexQueuedBytes = 0;
  }

  function noteMultiplexWriteQueued(metadata) {
    if (!metadata) return;
    multiplexQueuedBytes += metadata.wireByteLength;
  }

  function noteMultiplexWriteParsed(metadata) {
    if (!metadata) return;
    multiplexQueuedBytes = Math.max(0, multiplexQueuedBytes - metadata.wireByteLength);
    pendingOutputAckBytes += metadata.wireByteLength;
    pendingOutputAckSeq = metadata.endSeq;
    outputAckThresholdBytes = metadata.ackEveryBytes;
    if (pendingOutputAckBytes >= outputAckThresholdBytes) {
      flushMultiplexOutputAck();
    } else if (outputAckTimer === null) {
      outputAckTimer = setTimeout(flushMultiplexOutputAck, 4);
    }
  }

  function flushMultiplexOutputAck() {
    if (outputAckTimer !== null) clearTimeout(outputAckTimer);
    outputAckTimer = null;
    if (pendingOutputAckSeq === null) return;
    notify({
      type: 'output-parsed',
      endSeq: pendingOutputAckSeq,
      receiverQueueBytes: multiplexQueuedBytes
    });
    pendingOutputAckBytes = 0;
    pendingOutputAckSeq = null;
  }

  function restoreMultiplexSnapshot(snapshot) {
    resetMultiplexParseState();
    var normal = ESC + '[?1049l' + ESC + '[2J' + ESC + '[3J' + ESC + '[H' +
      snapshot.normalScrollback + snapshot.normalScreen;
    var alternate = ESC + '[?1049h' + ESC + '[2J' + ESC + '[H' + snapshot.alternateScreen;
    var active = snapshot.activeBuffer === 'normal' ? ESC + '[?1049l' : '';
    // Why: pendingEscapeTail must be the final bytes so the next live Output
    // continues the parser state without an intervening reset.
    var replay = normal + alternate + active + ESC + '[0m' + snapshot.pendingEscapeTail;
    init(
      snapshot.cols,
      snapshot.rows,
      replay,
      terminalThemeInput,
      currentTextScale,
      false,
      [],
      true,
      snapshot.id
    );
  }
`
