export type Echo = {ms:number; meters:number|null; db:number; quality:number; angle:number|null}
export type Shot = {raw:Float32Array; rate:number; curve:Float32Array; anchor:number; noise:number; level:number; clipped:boolean; snr:number; peaks:{ms:number; value:number; prominence:number}[]}
export function chirp(rate:number, duration=.016) {
  return Float32Array.from({length:Math.round(rate*duration)}, (_,i)=>{
    const t=i/rate
    return Math.sin(2*Math.PI*(950*t+ .5*5250*t*t/duration))*Math.sin(Math.PI*t/duration)**2
  })
}
const db=(v:number)=>20*Math.log10(Math.max(v,1e-8))
export function analyze(raw:Float32Array, rate:number, start:number, ref:Float32Array, sensitivity=50):Shot {
  const pre=raw.subarray(0,Math.max(1,start))
  const noise=Math.sqrt(pre.reduce((sum,v)=>sum+v*v,0)/pre.length)
  const energy=ref.reduce((sum,v)=>sum+v*v,0)
  const end=Math.max(0,Math.min(raw.length-start-ref.length,Math.round(rate*.48)))
  const curve=new Float32Array(end)
  let peak=0
  for(const v of raw) peak=Math.max(peak,Math.abs(v))
  for(let lag=0;lag<end;lag++){
    let value=0
    for(let j=0;j<ref.length;j++) value+=raw[start+lag+j]*ref[j]
    curve[lag]=Math.abs(value/energy)
  }
  const stride=Math.max(1,Math.round(rate*.00075))
  const floorSamples=Array.from(curve.filter((_,i)=>i%stride===0)).sort((a,b)=>a-b)
  const floor=Math.max(1e-7,noise/Math.sqrt(energy),floorSamples[Math.floor(floorSamples.length*.75)]||0)
  const limit=Math.min(end,Math.round(rate*.32))
  let top=0
  for(let i=0;i<limit;i++) top=Math.max(top,curve[i])
  const local=(i:number)=>curve[i]>=curve[i-1] && curve[i]>curve[i+1]
  let anchor=-1
  for(let i=1;i<limit-1;i++){
    if(local(i)&&curve[i]>Math.max(7*floor,top*.28,.00005)){anchor=i; for(let j=i+1;j<Math.min(limit,i+Math.round(rate*.0015));j++) if(curve[j]>curve[anchor])anchor=j; break}
  }
  const peaks:Shot['peaks']=[]
  if(anchor>=0){
    const from=anchor+Math.round(rate*.002)
    const until=Math.min(end-1,anchor+Math.round(rate*.095))
    for(let i=from;i<until;i++){
      const v=curve[i]
      if(!local(i)||v<Math.max(floor*(10-sensitivity*.07),curve[anchor]*(.12-sensitivity*.0009)))continue
      const p={ms:(i-anchor)*1000/rate,value:v/curve[anchor],prominence:db(v/floor)}
      const last=peaks.at(-1)
      if(last && p.ms-last.ms<1.25){if(p.value>last.value) peaks[peaks.length-1]=p}
      else peaks.push(p)
    }
  }
  return {raw,rate,curve,anchor,noise:db(noise),level:db(peak),clipped:peak>=.98,snr:anchor<0?0:db(curve[anchor]/floor),peaks}
}
export function calibration(shots:Shot[]){
  const anchors=shots.filter(s=>s.anchor>=0).map(s=>1000*s.anchor/s.rate)
  const delay=anchors.length===shots.length && anchors.length>=3 && Math.max(...anchors)-Math.min(...anchors)<1.5
    ? anchors.reduce((a,b)=>a+b,0)/anchors.length : null
  const noise=Math.max(...shots.map(s=>s.noise))
  const level=Math.max(...shots.map(s=>s.level))
  const clipped=shots.some(s=>s.clipped)
  const weak=shots.some(s=>s.snr<17)
  const valid=delay!==null && !clipped && noise< -30 && !weak
  return {delay,noise,level,valid,status:clipped?'Перегрузка микрофона':noise>=-30?'Высокий уровень шума':weak?'Сигнал слишком слабый':!valid?'Не удалось оценить задержку':'Готово к сканированию'}
}
export function reflections(shots:Shot[], stable:boolean, angle:number|null):Echo[]{
  const clean=shots.filter(s=>!s.clipped && s.anchor>=0)
  const groups:{shot:number; p:Shot['peaks'][number]}[][]=[]
  clean.forEach((s,shot)=>s.peaks.forEach(p=>{
    const group=groups.find(g=>Math.abs(g[0].p.ms-p.ms)<.6 && !g.some(e=>e.shot===shot))
    if(group)group.push({shot,p})
    else groups.push([{shot,p}])
  }))
  return groups.filter(g=>g.length>=Math.max(2,Math.ceil(shots.length/2))).map(g=>{
    const ms=g.reduce((sum,e)=>sum+e.p.ms,0)/g.length
    const value=g.reduce((sum,e)=>sum+e.p.value,0)/g.length
    const quality=Math.round(Math.min(100,Math.min(32,g.reduce((sum,e)=>sum+e.p.prominence,0)/g.length)+Math.min(18,Math.min(...g.map(e=>clean[e.shot].snr))*.65)+30*g.length/shots.length+(stable?20:0)))
    return {ms,meters:stable&&quality>=60?ms*.1715:null,db:db(value),quality,angle}
  }).sort((a,b)=>b.quality-a.quality||b.db-a.db).slice(0,8).sort((a,b)=>a.ms-b.ms)
}

