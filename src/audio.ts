import {analyze,chirp} from './dsp.ts'
export class AudioSession {
  private stream?:MediaStream
  private node?:AudioWorkletNode
  private closed=false
  private cancel?:()=>void
  readonly context:AudioContext
  constructor(){
    if(!isSecureContext || !navigator.mediaDevices?.getUserMedia || !window.AudioContext || !window.AudioWorkletNode)
      throw new Error('Нужен браузер с Web Audio и доступом к микрофону через HTTPS или localhost.')
    this.context=new AudioContext()
  }
  async open(device:string){
    await this.context.resume()
    const stream=await navigator.mediaDevices.getUserMedia({audio:{
      ...(device?{deviceId:{exact:device}}:{}),channelCount:1,echoCancellation:false,noiseSuppression:false,autoGainControl:false
    }})
    if(this.closed){stream.getTracks().forEach(t=>t.stop());throw new Error('Остановлено')}
    this.stream=stream
    await this.context.audioWorklet.addModule(import.meta.env.BASE_URL+'capture.js')
    if(this.closed)throw new Error('Остановлено')
    this.node=new AudioWorkletNode(this.context,'echo-capture',{channelCount:1,outputChannelCount:[1]})
    this.context.createMediaStreamSource(stream).connect(this.node)
    this.node.connect(this.context.destination)
  }
  async shot(volume:number,sensitivity:number,duration:number){
    if(this.closed || !this.node || !this.stream?.getAudioTracks().some(t=>t.readyState==='live'&&!t.muted))
      throw new Error('Микрофон недоступен.')
    const node=this.node, ctx=this.context, rate=ctx.sampleRate, ref=chirp(rate,duration)
    const at=Math.ceil((ctx.currentTime+.13)*rate)
    const first=at-Math.round(.085*rate), finish=at+Math.round(.54*rate)
    const raw=new Float32Array(finish-first)
    const buffer=ctx.createBuffer(1,ref.length,rate)
    buffer.copyToChannel(Float32Array.from(ref,n=>n*Math.max(0,Math.min(.10,volume))),0)
    const source=ctx.createBufferSource()
    source.buffer=buffer
    source.connect(ctx.destination)
    await new Promise<void>((resolve,reject)=>{
      let cursor=first
      const end=(err?:Error)=>{
        window.clearTimeout(timer)
        node.port.onmessage=null
        this.cancel=undefined
        try{source.stop()}catch{}
        source.disconnect()
        if(err)reject(err);else resolve()
      }
      const timer=window.setTimeout(()=>end(new Error('Запись прервалась. Оставьте вкладку открытой и повторите запуск.')),2200)
      this.cancel=()=>end(new Error('Остановлено'))
      node.port.onmessage=({data}:{data:{frame:number;samples:Float32Array}})=>{
        const {frame,samples}=data
        const lo=Math.max(first,frame),hi=Math.min(finish,frame+samples.length)
        if(lo>=hi)return
        if(lo>cursor){end(new Error('В записи обнаружен пропуск. Повторите запуск.'));return}
        raw.set(samples.subarray(lo-frame,hi-frame),lo-first)
        cursor=Math.max(cursor,hi)
        if(cursor>=finish)end()
      }
      source.start(at/rate)
    })
    return analyze(raw,rate,at-first,ref,sensitivity)
  }
  close(){
    if(this.closed)return
    this.closed=true
    this.cancel?.()
    this.stream?.getTracks().forEach(t=>t.stop())
    this.node?.disconnect()
    void this.context.close().catch(()=>{})
  }
}

