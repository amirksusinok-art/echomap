import {useEffect,useRef,useState} from 'react'
import {createRoot} from 'react-dom/client'
import {AudioLines, CircleDot, History, FlaskConical, Settings, ScanLine, Zap, Layers, RotateCw, ShieldCheck, Mic, ArrowRight, Moon, Sun} from 'lucide-react'
import {calibration, reflections, type Echo, type Shot} from './dsp.ts'
import {AudioSession} from './audio.ts'
import {Plot,Radar} from './visual.tsx'
import './style.css'

type Mode='Quick Scan'|'Deep Scan'|'360° Scan'
type Record={id:string;at:number;mode:Mode;echoes:Echo[];sectors:number[];count:number;usable:number;duration:number}
type Prefs={theme:'light'|'dark';device:string;volume:number;sensitivity:number;duration:number}
const defaults:Prefs={theme:'light',device:'',volume:.055,sensitivity:50,duration:16}
function load<T,>(key:string,fallback:T):T{try{return JSON.parse(localStorage.getItem(key)||'null')??fallback}catch{return fallback}}
function save(key:string,value:unknown){try{localStorage.setItem(key,JSON.stringify(value));return true}catch{return false}}
const tabs=[['Сканер',CircleDot],['История',History],['Лаборатория',FlaskConical],['Настройки',Settings]] as const
const modes=[['Quick Scan','3 импульса · быстрый обзор',Zap],['Deep Scan','8 импульсов · проверка повторяемости',Layers],['360° Scan','8 положений · круговой обзор',RotateCw]] as const
const number=(n:number,d=1)=>n.toLocaleString('ru-RU',{maximumFractionDigits:d,minimumFractionDigits:d})
const quality=(n:number)=>n>=80?'Высокая':n>=60?'Средняя':'Низкая'
const date=(t:number)=>new Date(t).toLocaleString('ru-RU',{dateStyle:'medium',timeStyle:'short'})
const db=(n:number)=>number(n,0)+' дБFS'

function App(){
  const [prefs,setPrefs]=useState(()=>({...defaults,...load('echo-prefs',defaults)}))
  const [history,setHistory]=useState<Record[]>(()=>load('echo-history',[]))
  const [tab,setTab]=useState(0),[mode,setMode]=useState<Mode>('Quick Scan')
  const [result,setResult]=useState<Record|null>(null),[picked,setPicked]=useState<Echo|null>(null)
  const [status,setStatus]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false)
  const [cal,setCal]=useState<ReturnType<typeof calibration>|null>(null),[shot,setShot]=useState<Shot|null>(null)
  const [devices,setDevices]=useState<MediaDeviceInfo[]>([])
  const [manual,setManual]=useState<number|null>(null),[coverage,setCoverage]=useState<number[]>([])
  const [compare,setCompare]=useState<string[]>([])
  const session=useRef<AudioSession|null>(null), action=useRef<(()=>void)|null>(null)
  const manualOverride=useRef(false), partial=useRef(false)
  const heading=useRef<{value:number;time:number}|null>(null)
  const alive=(s:AudioSession)=>session.current===s
  const refresh=()=>navigator.mediaDevices?.enumerateDevices().then(list=>setDevices(list.filter(d=>d.kind==='audioinput'&&d.deviceId))).catch(()=>{})
  useEffect(()=>{refresh();const devices=navigator.mediaDevices;devices?.addEventListener('devicechange',refresh)
    return ()=>devices?.removeEventListener('devicechange',refresh)},[])
  useEffect(()=>{document.documentElement.dataset.theme=prefs.theme;save('echo-prefs',prefs)},[prefs])
  useEffect(()=>{
    const handle=(e:DeviceOrientationEvent)=>{if(e.alpha!==null&&Number.isFinite(e.alpha))heading.current={value:e.alpha,time:performance.now()}}
    const release=()=>{session.current?.close();action.current?.()}
    window.addEventListener('deviceorientation',handle)
    window.addEventListener('pagehide',release)
    return ()=>{window.removeEventListener('deviceorientation',handle);window.removeEventListener('pagehide',release);release()}
  },[])
  const stop=()=>{session.current?.close();session.current=null;action.current?.();setBusy(false);setManual(null);setStatus('Сканирование остановлено.')}
  const update=<K extends keyof Prefs>(key:K,value:Prefs[K])=>{setPrefs(p=>({...p,[key]:value}));if(key!=='theme'&&key!=='sensitivity')setCal(null)}
  async function run(onlyCal=false){
    if(session.current)return
    setError('');setBusy(true);setStatus('Подключаем микрофон…');setCoverage([])
    if(!onlyCal){setResult(null);setPicked(null)}
    manualOverride.current=false;partial.current=false
    let s:AudioSession|undefined
    try{
      s=new AudioSession()
      const running=s
      session.current=s
      const C=window.DeviceOrientationEvent as (typeof DeviceOrientationEvent & {requestPermission?:()=>Promise<string>})|undefined
      const orientation=!onlyCal&&mode==='360° Scan'&&C?.requestPermission
        ? C.requestPermission().then(v=>v==='granted').catch(()=>false) : Promise.resolve(true)
      await s.open(prefs.device)
      if(!alive(s))return
      void refresh()
      const read=async()=>{
        const value=await running.shot(prefs.volume,prefs.sensitivity,prefs.duration/1000)
        if(!alive(running))throw new Error('Остановлено')
        setShot(value)
        return value
      }
      const baseline:Shot[]=[]
      for(let i=0;i<3;i++){setStatus('Калибровка · '+(i+1)+' из 3');baseline.push(await read())}
      const profile=calibration(baseline)
      setCal(profile)
      if(onlyCal){setStatus(profile.status);return}
      const sectors:number[]=[], groups:Echo[]=[]
      let count=0,usable=0
      async function measure(n:number,angle:number|null, validPosition=()=>true){
        const shots:Shot[]=[]
        for(let i=0;i<n;i++){
          setStatus(angle===null?'Измерение · '+(i+1)+' из '+n:'Положение '+angle+'° · импульс '+(i+1)+' из '+n)
          const value=await read()
          if(!validPosition())return false
          shots.push(value)

        }
        const stable=profile.valid && shots.every(v=>!v.clipped&&v.anchor>=0&&v.snr>=17&&Math.abs(v.anchor*1000/v.rate-profile.delay!)<1.5)
        groups.push(...reflections(shots,stable,angle))
        count+=shots.length
        usable+=shots.filter(value=>value.anchor>=0&&!value.clipped).length
        return true
      }
      if(mode!=='360° Scan')await measure(mode==='Quick Scan'?3:8,null)
      else{
        const sensor=await orientation
        if(!alive(s))return
        const origin=sensor&&heading.current&&performance.now()-heading.current.time<1600?heading.current.value:null
        if(origin===null)manualOverride.current=true
        const maxIdle=22000
        let last=performance.now()
        while(sectors.length<8 && !partial.current && alive(s)){
          if(manualOverride.current){
            const target=Array.from({length:8},(_,i)=>i*45).find(a=>!sectors.includes(a))!
            setManual(target);setStatus('Повернитесь к отметке '+target+'° и удерживайте телефон.')
            await new Promise<void>(resolve=>{action.current=resolve})
            action.current=null;setManual(null)
            if(!alive(s)||partial.current)break
            await measure(3,target);sectors.push(target);setCoverage([...sectors])
          }else{
            setStatus('Медленно повернитесь вокруг себя. На каждой отметке задержитесь на 2 секунды.')
            const value=heading.current
            const delta=value&&origin!==null?(origin-value.value+360)%360:0
            const nearest=Math.round(delta/45)*45%360
            const difference=Math.abs(((delta-nearest+540)%360)-180)
            if(value&&performance.now()-value.time<1400&&difference<=12&&!sectors.includes(nearest)){
              const held=()=>{const h=heading.current;return !!h&&performance.now()-h.time<1400&&Math.abs((((origin!-h.value-nearest)+900)%360)-180)<=18}
              if(await measure(3,nearest,held)){sectors.push(nearest);setCoverage([...sectors]);last=performance.now()}
              else if(performance.now()-last>maxIdle)manualOverride.current=true
            }else{
              if(performance.now()-last>maxIdle)manualOverride.current=true
              await new Promise(resolve=>setTimeout(resolve,125))
            }
          }
        }
      }
      if(!alive(s))return
      if(!count){setStatus('Нет измеренных положений.');return}
      const record:Record={id:crypto.randomUUID(),at:Date.now(),mode,echoes:groups,sectors,count,usable,duration:prefs.duration}
      setResult(record)
      const next=[record,...history].slice(0,60)
      setHistory(next)
      if(!save('echo-history',next))setError('Браузер не сохранил историю на диске. Результат доступен до перезагрузки.')
      setStatus(groups.length?'Измерение завершено.':usable<2?'Недостаточно данных. Проверьте микрофон и повторите измерение.':'Повторяемые отражения не обнаружены.')
    }catch(e){
      if(!s||alive(s)){
        const err=e as Error
        setStatus('')
        setError(err.name==='NotAllowedError'?'Разрешите доступ к микрофону в браузере и повторите запуск.':err.name==='NotFoundError'?'Микрофон не найден.':err.message||'Не удалось записать звук.')
      }
    }finally{
      s?.close()
      if(!s||alive(s)){session.current=null;setBusy(false);setManual(null)}
    }
  }

  return <>
    <header><div className="shell top flex items-center justify-between">
      <button className="brand flex items-center" onClick={()=>setTab(0)}><span className="brand-icon"><AudioLines size={21}/></span>EchoMap <small>v1.1</small></button>
      <nav aria-label="Разделы">{tabs.map(([name,Icon],i)=><button key={name} aria-current={tab===i?'page':undefined} onClick={()=>setTab(i)}><Icon size={16}/><span>{name}</span></button>)}</nav>
      <button className="icon" aria-label={prefs.theme==='dark'?'Светлая тема':'Тёмная тема'} onClick={()=>update('theme',prefs.theme==='dark'?'light':'dark')}>{prefs.theme==='dark'?<Sun size={19}/>:<Moon size={19}/>}</button>
    </div></header>
    <main className="shell">
      <div className="intro"><div className="eyebrow"><span/> ECHOMAP / {['ИЗМЕРЕНИЕ','АРХИВ','АНАЛИЗ','УСТРОЙСТВО'][tab]}</div>
      <h1>{['Акустический сканер','История измерений','Лаборатория','Настройки'][tab]}</h1>
      <p>{['Исследуйте отражения звука с помощью динамика и микрофона.','Откройте прошлый замер или выберите два для сравнения.','Разберите сигнал последнего импульса и проверьте качество записи.','Подберите микрофон и параметры звукового сигнала.'][tab]}</p></div>
      {tab===0&&<>
        <div className="workspace">
          <section className="card vision">
            <div className="cardhead"><div><h2>Echo Vision</h2><p>{result?.mode==='360° Scan'?'Угол телефона · задержка отражения':'Радиус показывает задержку отражения'}</p></div><span className={'badge '+(busy?'live':'')}><span/>{busy?'Измеряем':result?'Завершено':'Ожидание'}</span></div>
            <Radar echoes={result?.echoes??[]} active={busy} circular={busy?mode==='360° Scan':(result?.mode??mode)==='360° Scan'} onPick={setPicked}/>
            <div className="actions">{busy?<button className="secondary" onClick={stop}>Остановить</button>:<button className="primary" onClick={()=>void run()}><ScanLine size={19}/>Начать сканирование</button>}</div>
            <p className="status" role="status">{status||'Дайте доступ к микрофону, чтобы выполнить замер.'}</p>
            {busy&&mode==='360° Scan'&&<div className="round-controls">
              <span>{coverage.length} / 8 положений</span>
              {manual!==null?<button className="primary" onClick={()=>action.current?.()}>Измерить {manual}°</button>:<button className="secondary" onClick={()=>{manualOverride.current=true}}>Ручной режим</button>}
              {coverage.length>0&&<button className="secondary" onClick={()=>{partial.current=true;action.current?.()}}>Завершить и сохранить</button>}
            </div>}
            {error&&<p className="error" role="alert">{error}</p>}
          </section>
          <aside className="side">
            <section className="card modes"><h2>Режим сканирования</h2>{modes.map(([name,copy,Icon])=><button className={'mode '+(mode===name?'chosen':'')} key={name} disabled={busy} aria-pressed={mode===name} onClick={()=>setMode(name)}><span className="tile"><Icon size={19}/></span><span><strong>{name}</strong><small>{copy}</small></span><i/></button>)}</section>
            <section className="card device"><span className="tile"><Mic size={19}/></span><div><h2>Калибровка</h2><p>{cal?.status??'Запустится перед измерением'}</p><button className="link" onClick={()=>setTab(3)}>Параметры <ArrowRight size={15}/></button></div></section>
          </aside>
        </div>
        <section className="card results"><div className="cardhead"><div><h2>Возможные отражения</h2><p>{result?.mode==='360° Scan'?'Измерены '+result.sectors.length+' из 8 положений. Угол относится к телефону.':'Оценка расстояния рассчитана по задержке относительно опорного сигнала.'}</p></div>{result&&<span className="badge">{result.echoes.length} найдено</span>}</div>
          {picked&&<div className="detail"><strong>{number(picked.ms)} мс</strong> · {number(picked.db)} дБ к опоре · {picked.meters===null?'Относительный режим':number(picked.meters,2)+' м'} · {quality(picked.quality)} ({picked.quality}/100) <button className="link" onClick={()=>setPicked(null)}>Закрыть</button></div>}
          {result?.echoes.length?<EchoList echoes={result.echoes} onPick={setPicked}/>:<div className="empty"><CircleDot size={23}/>{result?'Нет подтверждённых отражений':'Здесь появятся отражения после сканирования'}</div>}
        </section>
      </>}
      {tab===1&&<section className="card results"><h2>Сохранённые замеры</h2>{!history.length&&<div className="empty">История пока пуста</div>}
        {history.map(r=><div key={r.id} className="history-row"><label><input type="checkbox" checked={compare.includes(r.id)} disabled={!compare.includes(r.id)&&compare.length===2} onChange={e=>setCompare(e.target.checked?[...compare,r.id]:compare.filter(id=>id!==r.id))}/> Сравнить</label><div><strong>{r.mode}</strong><small>{date(r.at)} · {r.echoes.length} отраж. · {r.usable}/{r.count} пригодных импульсов</small></div><button className="link" onClick={()=>{setResult(r);setMode(r.mode);setPicked(null);if(!busy){setStatus('Открыт замер из истории.');setError('')}setTab(0)}} disabled={busy}>Открыть <ArrowRight size={15}/></button></div>)}
        {compare.length===2&&<div className="comparison">{compare.map(id=>history.find(r=>r.id===id)).filter((r):r is Record=>!!r).map(r=><article key={r.id}><h3>{r.mode}</h3><p>{date(r.at)} · {r.duration} мс{r.mode==='360° Scan'?' · '+r.sectors.length+'/8 положений':''}</p>{r.echoes.length?<EchoList echoes={r.echoes}/>:<p>Нет подтверждённых отражений.</p>}</article>)}</div>}
      </section>}
      {tab===2&&<div className="lab">
        {shot?<><section className="card results"><h2>Последний импульс</h2><p>{shot.rate.toLocaleString('ru-RU')} Гц · фон {db(shot.noise)} · пик {db(shot.level)} · {shot.anchor<0?'нет опорного сигнала':'отношение опоры к фону '+number(shot.snr,0)+' дБ'}{shot.clipped?' · перегрузка':''}</p></section>
          <section className="card results"><h2>Осциллограмма</h2><Plot shot={shot} kind="wave"/><p>Время записи · 0–{number(1000*shot.raw.length/shot.rate,0)} мс</p></section>
          <section className="card results"><h2>Спектрограмма</h2><Plot shot={shot} kind="spectrum"/><p>По горизонтали время записи · по вертикали 0–{number(shot.rate*79/256/1000)} кГц</p></section>
          <section className="card results"><h2>Корреляционный график</h2><Plot shot={shot} kind="curve"/><p>Задержка от отправки импульса · 0–{number(1000*shot.curve.length/shot.rate,0)} мс</p></section>
        </>:<section className="card results"><div className="empty">Запустите сканирование или калибровку, чтобы увидеть сигнал.</div></section>}
      </div>}
      {tab===3&&<section className="card results settings">
        <h2>Звук и оформление</h2>
        <label>Микрофон<select disabled={busy} value={prefs.device} onChange={e=>update('device',e.target.value)}><option value="">Системный микрофон</option>{prefs.device&&!devices.some(d=>d.deviceId===prefs.device)&&<option value={prefs.device}>Ранее выбранный микрофон</option>}{devices.map((d,i)=><option key={d.deviceId} value={d.deviceId}>{d.label||'Микрофон '+(i+1)}</option>)}</select></label>
        <label>Тема<select value={prefs.theme} onChange={e=>update('theme',e.target.value as Prefs['theme'])}><option value="light">Светлая</option><option value="dark">Тёмная</option></select></label>
        <label>Чувствительность · {prefs.sensitivity}<input type="range" disabled={busy} min="0" max="100" value={prefs.sensitivity} onChange={e=>update('sensitivity',+e.target.value)}/></label>
        <label>Цифровой уровень · {number(20*Math.log10(prefs.volume),0)} дБFS<input type="range" disabled={busy} min=".015" max=".10" step=".005" value={prefs.volume} onChange={e=>update('volume',+e.target.value)}/></label>
        <label>Длительность сигнала · {prefs.duration} мс<input type="range" disabled={busy} min="12" max="24" step="1" value={prefs.duration} onChange={e=>update('duration',+e.target.value)}/></label>
        <p>Частоты 950–6200 Гц. Перед запуском установите низкую системную громкость и используйте динамик устройства.</p>
        <div className="setting-cal"><h2>Проверка аудиотракта</h2>
         <p>{cal?cal.status+' · фон '+db(cal.noise)+' · пик '+db(cal.level)+(cal.delay===null?'':' · задержка тракта '+number(cal.delay)+' мс'):'Доступ к микрофону запрашивается при первом запуске.'}</p>
         {busy?<button className="secondary" onClick={stop}>Остановить</button>:<button className="primary" onClick={()=>void run(true)}>Запустить калибровку</button>}
         <p role="status">{status}</p>{error&&<p className="error" role="alert">{error}</p>}
        </div>
      </section>}
      <footer><ShieldCheck size={17}/> Аудио обрабатывается на устройстве. В истории остаются только результаты.</footer>
    </main>
  </>
}

function EchoList({echoes,onPick}:{echoes:Echo[];onPick?:(echo:Echo)=>void}){
  return <ul className="echoes">{echoes.map((e,i)=><li key={i}><div>{onPick?<button className="link" onClick={()=>onPick(e)}>{number(e.ms)} мс</button>:<strong>{number(e.ms)} мс</strong>}<small>{number(e.db)} дБ к опоре{e.angle===null?'':' · положение '+e.angle+'°'}</small></div><div><strong>{e.meters===null?'Относительно':number(e.meters,2)+' м'}</strong><small>{quality(e.quality)} · индекс {e.quality}/100</small></div></li>)}</ul>
}
createRoot(document.getElementById('root')!).render(<App/>)


