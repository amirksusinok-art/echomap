import type {Point} from './features.ts'

type MatchPoint=Point & {patch:number[]}
const cell=3
export class PointMap {
  private origin={x:0,y:0}
  private previous:MatchPoint[]=[]
  private cells=new Map<string,Point>()
  get size(){return this.cells.size}
  get offset(){return this.origin}
  get points(){return [...this.cells.values()]}

  add(data:Uint8ClampedArray,width:number,points:Point[]){
    const anchors=points.slice(0,110).map(p=>{
      const patch:number[]=[]
      for(let y=-3;y<=3;y+=2)for(let x=-3;x<=3;x+=2){
        const i=4*((p.y+y)*width+p.x+x)
        patch.push((data[i]+data[i+1]+data[i+2])/3)
      }
      const mean=patch.reduce((a,b)=>a+b,0)/patch.length
      return {...p,patch:patch.map(v=>v-mean)}
    })
    if(!anchors.length)return false
    if(this.previous.length){
      const votes=new Map<string,{dx:number;dy:number}[]>()
      for(const p of this.previous){
        let best=Infinity,second=Infinity,match:MatchPoint|undefined
        for(const q of anchors){
          if(Math.abs(p.x-q.x)>40||Math.abs(p.y-q.y)>40)continue
          let error=0
          for(let i=0;i<p.patch.length;i++)error+=Math.abs(p.patch[i]-q.patch[i])
          if(error<best){second=best;best=error;match=q}
          else if(error<second)second=error
        }
        if(!match||best>320||best>=second*.8)continue
        const dx=p.x-match.x,dy=p.y-match.y
        const key=Math.round(dx/4)+':'+Math.round(dy/4)
        const group=votes.get(key)??[]
        group.push({dx,dy});votes.set(key,group)
      }
      const ranked=[...votes.values()].sort((a,b)=>b.length-a.length)
      const best=ranked[0]
      if(!best||best.length<4||best.length<((ranked[1]?.length??0)*1.5))return false
      const middle=Math.floor(best.length/2)
      this.origin={x:this.origin.x+best.map(v=>v.dx).sort((a,b)=>a-b)[middle],y:this.origin.y+best.map(v=>v.dy).sort((a,b)=>a-b)[middle]}
    }
    this.previous=anchors
    for(const p of points){
      const x=p.x+this.origin.x,y=p.y+this.origin.y
      const key=Math.round(x/cell)+':'+Math.round(y/cell)
      if(!this.cells.has(key)&&this.cells.size<25000)this.cells.set(key,{x,y,strength:p.strength})
    }
    return true
  }
}

export function drawMap(ctx:CanvasRenderingContext2D,points:Point[],background:boolean){
  const {width,height}=ctx.canvas
  ctx.clearRect(0,0,width,height)
  if(background){ctx.fillStyle='#0c161e';ctx.fillRect(0,0,width,height)}
  if(!points.length)return
  let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity
  for(const p of points){minX=Math.min(minX,p.x);minY=Math.min(minY,p.y);maxX=Math.max(maxX,p.x);maxY=Math.max(maxY,p.y)}
  const zoom=Math.min((width-36)/Math.max(1,maxX-minX),(height-36)/Math.max(1,maxY-minY))
  const x0=(width-(maxX-minX)*zoom)/2
  const y0=(height-(maxY-minY)*zoom)/2
  ctx.fillStyle='#64ebff'
  ctx.beginPath()
  for(const p of points){
    const x=x0+(p.x-minX)*zoom,y=y0+(p.y-minY)*zoom
    ctx.moveTo(x+1.5,y);ctx.arc(x,y,1.5,0,Math.PI*2)
  }
  ctx.fill()
}
