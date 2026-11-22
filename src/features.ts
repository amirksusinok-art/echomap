export type Point = { x:number; y:number; strength:number }

// Minimum eigenvalue of the local gradient matrix: strong in two directions at corners.
export function detect(rgba:Uint8ClampedArray,width:number,height:number,spacing:number):Point[]{
  const gray=new Float32Array(width*height)
  for(let i=0;i<gray.length;i++) gray[i]=.299*rgba[i*4]+.587*rgba[i*4+1]+.114*rgba[i*4+2]
  const candidates:Point[]=[]
  for(let y=4;y<height-4;y+=2) for(let x=4;x<width-4;x+=2){
    let xx=0,xy=0,yy=0
    for(let dy=-2;dy<=2;dy++) for(let dx=-2;dx<=2;dx++){
      const i=(y+dy)*width+x+dx
      const gx=(gray[i+1]-gray[i-1])*.5
      const gy=(gray[i+width]-gray[i-width])*.5
      xx+=gx*gx;xy+=gx*gy;yy+=gy*gy
    }
    const strength=(xx+yy-Math.hypot(xx-yy,2*xy))/50
    if(strength>110)candidates.push({x,y,strength})
  }
  candidates.sort((a,b)=>b.strength-a.strength)
  const points:Point[]=[]
  const occupied=new Uint8Array(width*height)
  for(const p of candidates){
    if(occupied[p.y*width+p.x])continue
    points.push(p)
    for(let y=Math.max(0,p.y-spacing);y<=Math.min(height-1,p.y+spacing);y++){
      const radius=Math.floor(Math.sqrt(spacing**2-(y-p.y)**2))
      occupied.fill(1,y*width+Math.max(0,p.x-radius),y*width+Math.min(width,p.x+radius+1))
    }
    if(points.length===2000)break
  }
  return points
}

