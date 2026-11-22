class EchoCapture extends AudioWorkletProcessor {
  process(inputs, outputs) {
    const channel = inputs[0]?.[0]
    const out = outputs[0][0]
    if (channel) {
      const copy = channel.slice()
      this.port.postMessage({frame: currentFrame, samples: copy}, [copy.buffer])
    }
    out.fill(0)
    return true
  }
}
registerProcessor('echo-capture', EchoCapture)
