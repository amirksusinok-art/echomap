import {test} from 'node:test'
import assert from 'node:assert/strict'
import {detect} from '../src/features.ts'
const size=64
function frame(pixel:(x:number,y:number)=>number){
  return Uint8ClampedArray.from({length:size*size*4},(_,i)=>{
    const p=Math.floor(i/4)
    return i%4===3?255:pixel(p%size,Math.floor(p/size))
  })
}
test('blank areas and straight edges do not produce corner points',()=>{
  assert.equal(detect(frame(()=>100),size,size,7).length,0)
  assert.equal(detect(frame(x=>x>=32?255:0),size,size,7).length,0)
})
test('finds a corner near its image coordinate',()=>{
  const points=detect(frame((x,y)=>x>=32&&y>=32?255:0),size,size,7)
  assert.equal(points.length,1)
  assert.ok(Math.hypot(points[0].x-32,points[0].y-32)<4)
})
