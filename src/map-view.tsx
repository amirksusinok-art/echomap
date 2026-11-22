import {useEffect,useRef,useState, type PointerEvent} from 'react'
import {Download,Maximize,Minus,Plus,Save} from 'lucide-react'
import type {Point} from './features.ts'
import {drawMap} from './point-map.ts'

type Scan={id:string;date:number;points:Point[]}
const key='echomap-camera-scans-v1'
const home={zoom:1,x:0,y:0}
function read():Scan[]{
  try{const data=JSON.parse(localStorage.getItem(key)??'[]');return Array.isArray(data)?data:[]}catch{return []}
}
export function MapView({points,live}:{points:Point[];live:boolean}){
  const [saved,setSaved]=useState(read)
  const [selected,setSelected]=useState('')
  const [message,setMessage]=useState('')
  const [full,setFull]=useState(false)
  const dialog=useRef<HTMLDialogElement>(null)
  const selection=saved.find(s=>s.id===selected)
  const shown=selection?.points??points
  function save(){
    try{
      const next=[{id:crypto.randomUUID(),date:Date.now(),points:points.map(p=>({x:Math.round(p.x*10)/10,y:Math.round(p.y*10)/10,strength:Math.round(p.strength)}))},...saved]
      localStorage.setItem(key,JSON.stringify(next));setSaved(next);setMessage('Скан сохранён на этом устройстве.')
    }catch{setMessage('Не удалось сохранить скан. Проверьте доступное место в браузере.')}
  }
  function exportPng(){
    const canvas=document.createElement('canvas')
    canvas.width=1600;canvas.height=1000
    drawMap(canvas.getContext('2d')!,shown,true)
    const anchor=document.createElement('a')
    anchor.href=canvas.toDataURL();anchor.download='echomap-map.png';anchor.click()
  }
  return <section className="card point-map">
    <div className="bar"><h2>Карта точек</h2><span className="badge">Накоплено: {shown.length}</span></div>
    <MapCanvas key={selected} points={shown}/>
    {!shown.length&&<p>Здесь появятся точки из кадров камеры.</p>}
    <div className="controls">
      <button className="secondary" disabled={!shown.length} onClick={()=>{dialog.current?.showModal();setFull(true)}}><Maximize size={16}/> На весь экран</button>
      <button className="secondary" disabled={!points.length||!!selection} onClick={save}><Save size={17}/> Сохранить скан</button>
      <button className="secondary" disabled={!shown.length} onClick={exportPng}><Download size={17}/> Скачать PNG</button>
    </div>
    {saved.length>0&&<label className="scan-history">Сохранённые сканы<select value={selected} onChange={e=>{setSelected(e.target.value);setMessage('')}}>
      <option value="">{live?'Текущий скан':'Последняя карта'}</option>
      {saved.map(s=><option key={s.id} value={s.id}>{new Date(s.date).toLocaleString('ru-RU')} · {s.points.length} точек</option>)}
    </select></label>}
    {message&&<p role="status">{message}</p>}
    <dialog ref={dialog} className="map-dialog" onClose={()=>setFull(false)}>
      <div className="bar"><h2>Карта точек</h2><button className="secondary" onClick={()=>dialog.current?.close()}>Закрыть</button></div>
      {full&&<MapCanvas points={shown}/>}
    </dialog>
  </section>
}

function MapCanvas({points}:{points:Point[]}){
  const canvas=useRef<HTMLCanvasElement>(null)
  const pointers=useRef(new Map<number,{x:number;y:number}>())
  const [view,setView]=useState(home)
  const adjust=(factor:number)=>setView(v=>({...v,zoom:Math.max(1,Math.min(10,v.zoom*factor))}))
  useEffect(()=>{drawMap(canvas.current!.getContext('2d')!,points,true,view)},[points,view])
  function move(event:PointerEvent<HTMLCanvasElement>){
    const previous=pointers.current.get(event.pointerId)
    if(!previous)return
    const other=[...pointers.current].find(([id])=>id!==event.pointerId)?.[1]
    const next={x:event.clientX,y:event.clientY}
    pointers.current.set(event.pointerId,next)
    const bounds=event.currentTarget.getBoundingClientRect()
    const dx=(next.x-previous.x)/bounds.width,dy=(next.y-previous.y)/bounds.height
    const factor=other?Math.hypot(next.x-other.x,next.y-other.y)/Math.max(1,Math.hypot(previous.x-other.x,previous.y-other.y)):1
    const center=other?{x:((previous.x+other.x)/2-bounds.left)/bounds.width-.5,y:((previous.y+other.y)/2-bounds.top)/bounds.height-.5}:{x:0,y:0}
    setView(v=>{
      const zoom=Math.max(1,Math.min(10,v.zoom*factor))
      const ratio=zoom/v.zoom
      return {zoom,x:center.x+(v.x-center.x)*ratio+dx/(other?2:1),y:center.y+(v.y-center.y)*ratio+dy/(other?2:1)}
    })
  }
  return <div className="map-canvas">
    <canvas ref={canvas} width={1000} height={480} aria-label="Накопленные точки сканирования"
      onPointerDown={e=>{if(!points.length)return;e.currentTarget.setPointerCapture(e.pointerId);pointers.current.set(e.pointerId,{x:e.clientX,y:e.clientY})}}
      onPointerMove={move} onLostPointerCapture={e=>pointers.current.delete(e.pointerId)}/>
    <div className="map-tools">
      <button disabled={!points.length} aria-label="Уменьшить карту" onClick={()=>adjust(.8)}><Minus size={17}/></button>
      <button disabled={!points.length} aria-label="Вернуть масштаб карты" onClick={()=>setView(home)}>{view.zoom.toFixed(1)}×</button>
      <button disabled={!points.length} aria-label="Увеличить карту" onClick={()=>adjust(1.25)}><Plus size={17}/></button>
    </div>
  </div>
}

