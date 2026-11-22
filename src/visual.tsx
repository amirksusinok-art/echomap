import {useEffect,useRef} from 'react'
import type {Echo,Shot} from './dsp.ts'

export function Radar({echoes,active,circular,onPick}:{echoes:Echo[];active:boolean;circular:boolean;onPick:(e:Echo)=>void}){
  const ref=useRef<HTMLCanvasElement>(null)
  const points=echoes.map((e,i)=>{
    const angle=circular && e.angle!==null?e.angle*Math.PI/180-Math.PI/2:-Math.PI/2
    const r=13+Math.min(95,e.ms)/95*32
    return {e,i,x:50+Math.cos(angle)*r,y:50+Math.sin(angle)*r}
  })
  useEffect(()=>{
    const c=ref.current!,ctx=c.getContext('2d')!
    let frame=0
    const draw=(time:number)=>{
      const scale=devicePixelRatio||1, size=c.clientWidth
      const pixels=Math.round(size*scale)
      if(c.width!==pixels || c.height!==pixels){c.width=pixels;c.height=pixels}
      ctx.setTransform(pixels/100,0,0,pixels/100,0,0)
      ctx.clearRect(0,0,100,100)
      const dark=getComputedStyle(c).colorScheme==='dark'
      const gradient=ctx.createRadialGradient(50,50,2,50,50,45)
      gradient.addColorStop(0,dark?'#173353':'#dfeeff')
      gradient.addColorStop(1,dark?'#171f2b':'#f0f6ff')
      ctx.fillStyle=gradient
      ctx.beginPath();ctx.arc(50,50,46,0,Math.PI*2);ctx.fill()
      ctx.lineWidth=.25;ctx.strokeStyle=dark?'#3a5273':'#c3d7ef'
      for(const radius of [11.5,23,34.5,46]){
        ctx.beginPath();ctx.arc(50,50,radius,0,Math.PI*2);ctx.stroke()
      }
      for(let i=0;i<8;i++){
        const a=i*Math.PI/4
        ctx.beginPath();ctx.moveTo(50+Math.cos(a)*6,50+Math.sin(a)*6)
        ctx.lineTo(50+Math.cos(a)*46,50+Math.sin(a)*46);ctx.stroke()
      }
      ctx.fillStyle='#007aff';ctx.beginPath();ctx.arc(50,50,1.5,0,Math.PI*2);ctx.fill()
      if(active&&!matchMedia('(prefers-reduced-motion: reduce)').matches){
        const phase=time%1700/1700
        ctx.strokeStyle='rgba(0,122,255,'+(.7*(1-phase))+')'
        ctx.beginPath();ctx.arc(50,50,phase*46,0,Math.PI*2);ctx.stroke()
      }
      if(active)frame=requestAnimationFrame(draw)
    }
    const observer=new ResizeObserver(()=>{if(!active)draw(0)})
    const theme=new MutationObserver(()=>{if(!active)draw(0)})
    observer.observe(c);theme.observe(document.documentElement,{attributes:true,attributeFilter:['data-theme']})
    draw(0)
    return ()=>{observer.disconnect();theme.disconnect();cancelAnimationFrame(frame)}
  },[active])
  return <div className="radar"><canvas ref={ref} aria-label={circular?'Положения телефона и задержки':'Радар и шкала задержек'}/>
    <span className="radar-top">{circular?'0°':'95 мс'}</span>
    {circular&&<><span className="radar-left">270°</span><span className="radar-right">90°</span><span className="radar-bottom">180°</span></>}
    {points.map(({e,i,x,y})=><button key={i} className="hit" style={{left:x+'%',top:y+'%'}} aria-label={'Отражение '+e.ms.toFixed(1)+' мс'} onClick={()=>onPick(e)}><span style={{width:Math.max(5,13+e.db*.24),opacity:.35+e.quality*.0065}}/></button>)}
  </div>
}

export function Plot({shot,kind}:{shot:Shot;kind:'wave'|'spectrum'|'curve'}){
  const ref=useRef<HTMLCanvasElement>(null)
  useEffect(()=>{
    const c=ref.current!,ctx=c.getContext('2d')!,w=c.width,h=c.height
    ctx.clearRect(0,0,w,h)
    ctx.strokeStyle='#8393a344'
    for(let i=1;i<8;i++){ctx.beginPath();ctx.moveTo(i*w/8,0);ctx.lineTo(i*w/8,h);ctx.stroke()}
    if(kind==='spectrum'){
      const bins=80, frames=128, size=256
      for(let t=0;t<frames;t++){
        const start=Math.floor(t*(shot.raw.length-size)/frames)
        for(let b=0;b<bins;b++){
          let real=0,imag=0
          for(let j=0;j<size;j++){
            const v=shot.raw[start+j]*(.5-.5*Math.cos(2*Math.PI*j/size))
            const a=2*Math.PI*b*j/size
            real+=v*Math.cos(a);imag+=v*Math.sin(a)
          }
          const power=20*Math.log10(Math.max(1e-7,Math.hypot(real,imag)/size))
          ctx.fillStyle='rgba(0,122,255,'+Math.max(0,Math.min(1,(power+100)/75))+')'
          ctx.fillRect(t*w/frames,h-(b+1)*h/bins,Math.ceil(w/frames),Math.ceil(h/bins))
        }
      }
      return
    }
    const data=kind==='wave'?shot.raw:shot.curve
    const max=data.reduce((a,v)=>Math.max(a,Math.abs(v)),1e-7)
    ctx.strokeStyle='#007aff';ctx.lineWidth=1.5
    for(let x=0;x<w;x++){
      const a=Math.floor(x*data.length/w),b=Math.floor((x+1)*data.length/w)
      let lo=data[a]||0,hi=lo
      for(let i=a+1;i<b;i++){lo=Math.min(lo,data[i]);hi=Math.max(hi,data[i])}
      const y=(v:number)=>kind==='wave'?h*.5-v/max*h*.46:h*.95-v/max*h*.88
      ctx.beginPath();ctx.moveTo(x,y(lo));ctx.lineTo(x,y(hi)-1);ctx.stroke()
    }
  },[shot,kind])
  return <canvas ref={ref} width={850} height={220} className="plot" aria-label={kind==='wave'?'Осциллограмма':kind==='curve'?'Корреляция':'Спектрограмма'}/>
}
