import {test} from 'node:test'
import assert from 'node:assert/strict'
import {PointMap,estimate,project} from '../src/point-map.ts'
test('keeps old points and aligns a shifted frame',()=>{
  const map=new PointMap(),width=128
  function frame(shift:number,ids:number[]){
    const pixels=new Uint8ClampedArray(width*64*4)
    const points=ids.map(id=>{
      const x=16+id*11-shift,y=20+id%2*18
      for(let dy=-3;dy<=3;dy+=2)for(let dx=-3;dx<=3;dx+=2){
        const i=((y+dy)*width+x+dx)*4
        const seed=Math.sin((id+3)*521+(dx+3)*71+(dy+3)*13)*10000
        pixels[i]=pixels[i+1]=pixels[i+2]=Math.floor((seed-Math.floor(seed))*255)
      }
      return {x,y,strength:1000}
    })
    return {pixels,points}
  }
  const a=frame(0,[0,1,2,3,4,5]),b=frame(16,[1,2,3,4,5,6])
  assert.equal(map.add(a.pixels,width,a.points),true)
  assert.equal(map.add(b.pixels,width,b.points),true)
  assert.deepEqual(map.offset,{x:16,y:0})
  assert.equal(map.size,7)
  assert.ok(map.points.some(p=>p.x===16))
  const detailed=new PointMap()
  assert.equal(detailed.add(a.pixels,width,a.points,3),true)
  assert.equal(detailed.add(a.pixels,width,a.points,3),true)
  assert.equal(detailed.size,0)
  assert.equal(detailed.add(a.pixels,width,a.points,3),true)
  assert.equal(detailed.size,6)
  assert.equal(map.add(b.pixels,width,[]),false)
  assert.equal(map.size,7)
})

test('estimates rotation and scale in the presence of an outlier',()=>{
  const expected={a:1.08,b:.15,x:8,y:-6}
  const matches=[{x:20,y:15},{x:100,y:18},{x:50,y:64},{x:12,y:90},{x:100,y:85}].map(from=>({from,to:project(expected,from)}))
  matches.push({from:{x:20,y:55},to:{x:95,y:80}})
  const actual=estimate(matches)!
  for(const key of Object.keys(expected) as (keyof typeof expected)[]) assert.ok(Math.abs(actual[key]-expected[key])<.001)
})

