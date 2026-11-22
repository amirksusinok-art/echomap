import type {Point} from './features.ts'
type MatchPoint=Point & {patch:number[]}
type XY={x:number;y:number}
export type Transform={a:number;b:number;x:number;y:number}
type Match={from:XY;to:XY}
export const identity:Transform={a:1,b:0,x:0,y:0}
export function project(t:Transform,p:XY):XY{
  return {x:t.a*p.x-t.b*p.y+t.x,y:t.b*p.x+t.a*p.y+t.y}
}
function compose(t:Transform,u:Transform):Transform{
  return {...project(t,u),a:t.a*u.a-t.b*u.b,b:t.b*u.a+t.a*u.b}
}
export function inverse(t:Transform):Transform{
  const norm=t.a*t.a+t.b*t.b
  const result={a:t.a/norm,b:-t.b/norm,x:0,y:0}
  return {...result,...project(result,{x:-t.x,y:-t.y})}
}
function fit(matches:Match[]):Transform|null{
  const n=matches.length
  let fx=0,fy=0,tx=0,ty=0
  for(const {from,to} of matches){fx+=from.x/n;fy+=from.y/n;tx+=to.x/n;ty+=to.y/n}
  let re=0,im=0,energy=0
  for(const {from,to} of matches){
    const x=from.x-fx,y=from.y-fy,u=to.x-tx,v=to.y-ty
    re+=x*u+y*v;im+=x*v-y*u;energy+=x*x+y*y
  }
  if(energy<90)return null
  const a=re/energy,b=im/energy
  return {a,b,x:tx-a*fx+b*fy,y:ty-b*fx-a*fy}
}
export function estimate(matches:Match[]):Transform|null{
  let best:Match[]=[]
  let bestError=Infinity
  const hypotheses=matches.slice(0,30)
  for(let i=0;i<hypotheses.length;i++)for(let j=i+1;j<hypotheses.length;j++){
    const t=fit([hypotheses[i],hypotheses[j]])
    if(!t||Math.hypot(t.a,t.b)<.78||Math.hypot(t.a,t.b)>1.28||Math.abs(Math.atan2(t.b,t.a))>.35)continue
    const inliers:Match[]=[]
    let error=0
    for(const m of matches){
      const p=project(t,m.from),d=(p.x-m.to.x)**2+(p.y-m.to.y)**2
      if(d<12){inliers.push(m);error+=d}
    }
    if(inliers.length>best.length||(inliers.length===best.length&&error<bestError)){best=inliers;bestError=error}
  }
  return best.length>=Math.max(4,Math.ceil(matches.length*.45))?fit(best):null
}
const cell=4
export class PointMap {
  transform=identity
  motion=0
  private previous:MatchPoint[]=[]
  private cells=new Map<string,Point>()
  private pending=new Map<string,{point:Point;hits:number}>()
  get offset(){return {x:this.transform.x,y:this.transform.y}}
  get size(){return this.cells.size}
  get points(){return [...this.cells.values()]}
  add(data:Uint8ClampedArray,width:number,points:Point[],confirmation=1){
    const anchors=points.slice(0,140).map(p=>{
      const patch:number[]=[]
      for(let y=-3;y<=3;y+=2)for(let x=-3;x<=3;x+=2){
        const i=4*((p.y+y)*width+p.x+x)
        patch.push((data[i]+data[i+1]+data[i+2])/3)
      }
      const mean=patch.reduce((a,b)=>a+b,0)/patch.length
      const norm=Math.max(20,Math.hypot(...patch.map(v=>v-mean)))
      return {...p,patch:patch.map(v=>(v-mean)/norm)}
    })
    if(!anchors.length){this.pending.clear();return false}
    if(this.previous.length){
      const candidates:{from:MatchPoint;to:MatchPoint;error:number}[]=[]
      for(const to of this.previous){
        let best=Infinity,second=Infinity,from:MatchPoint|undefined
        for(const q of anchors){
          if(Math.abs(to.x-q.x)>75||Math.abs(to.y-q.y)>75)continue
          let error=0
          for(let i=0;i<to.patch.length;i++)error+=(to.patch[i]-q.patch[i])**2
          if(error<best){second=best;best=error;from=q}
          else if(error<second)second=error
        }
        if(from&&best<.52&&best<second*.82)candidates.push({from,to,error:best})
      }
      candidates.sort((a,b)=>a.error-b.error)
      const used=new Set<MatchPoint>()
      const matches=candidates.filter(m=>{if(used.has(m.from))return false;used.add(m.from);return true})
      const step=estimate(matches)
      if(!step){this.pending.clear();return false}
      const middle={x:width/2,y:data.length/(width*8)}
      const moved=project(step,middle)
      this.motion=Math.hypot(middle.x-moved.x,middle.y-moved.y)+80*Math.abs(Math.atan2(step.b,step.a))
      this.transform=compose(this.transform,step)
    }
    this.previous=anchors
    const next=new Map<string,{point:Point;hits:number}>()
    for(const p of points){
      const {x,y}=project(this.transform,p)
      const cx=Math.round(x/cell),cy=Math.round(y/cell)
      const key=cx+':'+cy
      const nearby=(map:Map<string,Point>)=>{
        for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
          const item=map.get((cx+dx)+':'+(cy+dy))
          if(item&&(item.x-x)**2+(item.y-y)**2<=12)return true
        }
        return false
      }
      if(this.cells.has(key)||nearby(this.cells)||next.has(key))continue
      let prior:{point:Point;hits:number}|undefined
      for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
        const item=this.pending.get((cx+dx)+':'+(cy+dy))
        if(item&&(item.point.x-x)**2+(item.point.y-y)**2<=16&&(!prior||item.hits>prior.hits))prior=item
      }
      const hits=(prior?.hits??0)+1
      const point={x,y,strength:p.strength}
      if(hits>=confirmation){if(this.cells.size<25000)this.cells.set(key,point)}
      else next.set(key,{point,hits})
    }
    this.pending=next
    return true
  }
}

export function drawMap(ctx:CanvasRenderingContext2D,points:Point[],background:boolean,view={zoom:1,x:0,y:0}){
  const {width,height}=ctx.canvas
  ctx.clearRect(0,0,width,height)
  if(background){ctx.fillStyle='#0c161e';ctx.fillRect(0,0,width,height)}
  if(!points.length)return
  let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity
  for(const p of points){minX=Math.min(minX,p.x);minY=Math.min(minY,p.y);maxX=Math.max(maxX,p.x);maxY=Math.max(maxY,p.y)}
  const zoom=view.zoom*Math.min((width-36)/Math.max(1,maxX-minX),(height-36)/Math.max(1,maxY-minY))
  const x0=(width-(maxX-minX)*zoom)/2+view.x*width
  const y0=(height-(maxY-minY)*zoom)/2+view.y*height
  ctx.fillStyle='#64ebff'
  ctx.beginPath()
  for(const p of points){
    const x=x0+(p.x-minX)*zoom,y=y0+(p.y-minY)*zoom
    ctx.moveTo(x+1.5,y);ctx.arc(x,y,1.5,0,Math.PI*2)
  }
  ctx.fill()
}
