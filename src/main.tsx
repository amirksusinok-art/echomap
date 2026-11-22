import {useEffect,useRef,useState} from 'react'
import {createRoot} from 'react-dom/client'
import {Camera, ScanLine, Crosshair, Download, ShieldCheck, Grid3X3, Square} from 'lucide-react'
import {detect} from './features.ts'
import {PointMap,inverse,project} from './point-map.ts'
import {MapView} from './map-view.tsx'
import type {Point} from './features.ts'
import './camera.css'

function App(){
  const video=useRef<HTMLVideoElement>(null)
  const overlay=useRef<HTMLCanvasElement>(null)
  const map=useRef(new PointMap())
  const [savedPoints,setSavedPoints]=useState<Point[]>([])
  const [hint,setHint]=useState('')
  const [detail,setDetail]=useState(false)
  const stream=useRef<MediaStream|null>(null)
  const request=useRef(0)
  const [phase,setPhase]=useState<'idle'|'loading'|'live'>('idle')
  const [error,setError]=useState('')
  const [points,setPoints]=useState(0)
  const [facing,setFacing]=useState<'environment'|'user'>('environment')
  const [density,setDensity]=useState(4)
  const [dotsOnly,setDotsOnly]=useState(false)
  const live=phase==='live'
  function release(){
    request.current++
    stream.current?.getTracks().forEach(track=>track.stop())
    stream.current=null
    if(video.current)video.current.srcObject=null
    const layer=overlay.current
    layer?.getContext('2d')?.clearRect(0,0,layer.width,layer.height)
  }
  function stop(){release();setPoints(0);setPhase('idle')}
  useEffect(()=>{
    const hide=()=>stop()
    window.addEventListener('pagehide',hide)
    return ()=>{window.removeEventListener('pagehide',hide);release()}
  },[])
  async function start(){
    const id=++request.current
    setError('');setPhase('loading')
    try{
      if(!window.isSecureContext||!navigator.mediaDevices?.getUserMedia)throw new Error('Для доступа к камере откройте сайт через HTTPS.')
      const input=await navigator.mediaDevices.getUserMedia({audio:false,video:{facingMode:{ideal:facing},width:{ideal:1280},height:{ideal:720}}})
      if(id!==request.current){input.getTracks().forEach(track=>track.stop());return}
      stream.current=input
      for(const track of input.getVideoTracks())track.addEventListener('ended',()=>{
        if(id===request.current){stop();setError('Камера отключилась. Запустите сканирование снова.')}
      })
      const player=video.current!
      player.srcObject=input
      await player.play()
      if(id===request.current){map.current=new PointMap();setSavedPoints([]);setHint('');setPhase('live')}
    }catch(cause){
      if(id!==request.current)return
      stop()
      const err=cause as Error
      setError(err.name==='NotAllowedError'?'Разрешите доступ к камере в настройках браузера.':err.name==='NotFoundError'?'На устройстве не найдена камера.':err.name==='NotReadableError'?'Камера недоступна или занята другим приложением.':err.message)
    }
  }
  useEffect(()=>{
    if(!live)return
    const player=video.current!,layer=overlay.current!
    const input=document.createElement('canvas')
    const capture=input.getContext('2d',{willReadFrequently:true})!
    const out=layer.getContext('2d')!
    let frame=0,lastTime=-1,lastScan=-Infinity,misses=0
    function scan(now:number){
      if(player.readyState>=2&&player.videoWidth&&player.videoHeight&&player.currentTime!==lastTime&&now-lastScan>=80){
        lastTime=player.currentTime;lastScan=now
        const scale=(detail?640:448)/Math.max(player.videoWidth,player.videoHeight)
        const w=Math.round(player.videoWidth*scale),h=Math.round(player.videoHeight*scale)
        if(input.width!==w||input.height!==h){input.width=w;input.height=h}
        if(layer.width!==player.videoWidth||layer.height!==player.videoHeight){layer.width=player.videoWidth;layer.height=player.videoHeight}
        capture.drawImage(player,0,0,w,h)
        const pixels=capture.getImageData(0,0,w,h).data
        let light=0,samples=0
        for(let i=0;i<pixels.length;i+=64){light+=.299*pixels[i]+.587*pixels[i+1]+.114*pixels[i+2];samples++}
        const features=detect(pixels,w,h,density,detail?65:110)
        const before=map.current.size
        const accepted=map.current.add(pixels,w,features,detail?3:1)
        misses=accepted?0:misses+1
        setHint(light/samples<36?'Мало света. Включите освещение.':
          misses>=3&&before>0?'Вернитесь к предыдущему участку.':
          (misses>0&&before>0)||map.current.motion>(detail?27:19)?'Двигайтесь медленнее.':
          features.length<8?'Наведите камеру на контрастные детали.':'')
        const saved=map.current.points
        if(map.current.size!==before)setSavedPoints(saved)
        const back=inverse(map.current.transform)
        const visible=accepted?saved.map(p=>({...p,...project(back,p)})).filter(p=>p.x>=0&&p.y>=0&&p.x<w&&p.y<h):detail?[]:features
        out.clearRect(0,0,layer.width,layer.height)
        const sx=layer.width/w,sy=layer.height/h
        for(const p of visible){
          out.fillStyle='rgba(95,235,255,'+Math.min(.98,.55+p.strength/2500)+')'
          out.beginPath()
          out.arc(p.x*sx,p.y*sy,Math.min(sx,sy)*(.63+Math.min(.42,p.strength/3000)),0,Math.PI*2)
          out.fill()
        }
        setPoints(visible.length)
      }
      frame=requestAnimationFrame(scan)
    }
    frame=requestAnimationFrame(scan)
    return ()=>cancelAnimationFrame(frame)
  },[live,density,detail])
  function download(){
    const layer=overlay.current!,player=video.current!
    const image=document.createElement('canvas')
    image.width=layer.width;image.height=layer.height
    const ctx=image.getContext('2d')!
    ctx.fillStyle='#0c161e';ctx.fillRect(0,0,image.width,image.height)
    if(!dotsOnly)ctx.drawImage(player,0,0,image.width,image.height)
    ctx.drawImage(layer,0,0)
    image.toBlob(blob=>{
      if(!blob)return
      const url=URL.createObjectURL(blob)
      const anchor=document.createElement('a')
      anchor.href=url;anchor.download='echomap-scan.png';anchor.click()
      setTimeout(()=>URL.revokeObjectURL(url),1000)
    },'image/png')
  }
  return <>
    <header><div className="shell top"><div className="brand"><span><ScanLine size={21}/></span> EchoMap</div><div className="tag"><Camera size={15}/> Сканер камеры</div></div></header>
    <main className="shell">
      <div className="intro"><h1>Сканер пространства</h1><p>Наведите камеру на предметы. EchoMap отметит различимые детали точками прямо в кадре.</p></div>
      <div className="layout">
        <section className="card viewer">
          <div className="bar"><h2>Видоискатель</h2><span className={'badge '+(live?'active':'')}>{live?'Камера включена':phase==='loading'?'Подключение':'Камера выключена'}</span></div>
          <div className="stage">
            <video ref={video} playsInline muted className={live&&!dotsOnly?'':'concealed'}/>
            <canvas ref={overlay} className={live?'':'concealed'} aria-label="Точки на деталях кадра"/>
            <div className="corners" aria-hidden="true"><i/><i/><i/><i/></div>
            {!live&&<div className="placeholder"><Crosshair size={44}/><span>{phase==='loading'?'Ожидание доступа к камере':'Включите камеру для сканирования'}</span></div>}
            {live&&hint&&<div className="finder-hint" role="status">{hint}</div>}
            {live&&<div className="counter"><Grid3X3 size={15}/> Точек в кадре: {points}</div>}
          </div>
          <div className="controls">
            {phase==='idle'?<button className="primary" onClick={()=>void start()}><Camera size={18}/>Включить камеру</button>:<button className="primary" onClick={stop}><Square size={16}/>{live?'Остановить':'Отменить'}</button>}
            <button className="secondary" disabled={!live||!points} onClick={download}><Download size={17}/>Сохранить PNG</button>
          </div>
          {error&&<p role="alert" className="error">{error}</p>}
        </section>
        <aside className="card settings"><h2>Настройки</h2>
          <label>Камера<select value={facing} disabled={phase!=='idle'} onChange={e=>setFacing(e.target.value as typeof facing)}><option value="environment">Основная</option><option value="user">Фронтальная</option></select></label>
          <label>Режим<select value={detail?'detail':'normal'} disabled={phase!=='idle'} onChange={e=>setDetail(e.target.value==='detail')}><option value="normal">Обычный</option><option value="detail">Детально</option></select></label>
          <label>Плотность точек<input type="range" min="3" max="16" value={18-density} onChange={e=>setDensity(18-+e.target.value)}/></label>
          <label className="check"><input type="checkbox" checked={dotsOnly} onChange={e=>setDotsOnly(e.target.checked)}/> Только точки</label>
          <div className="note"><Crosshair size={18}/><p>Ведите камеру медленно, оставляя знакомые детали в кадре. На карте сохраняются точки из совмещённых кадров.</p></div>
        </aside>
      </div>
      <MapView points={savedPoints} live={live}/>
      <footer><ShieldCheck size={17}/> Видео обрабатывается на устройстве.</footer>
    </main>
  </>
}
createRoot(document.getElementById('root')!).render(<App/>)




