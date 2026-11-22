import {test} from 'node:test'
import assert from 'node:assert/strict'
import {analyze,calibration,chirp,reflections} from '../src/dsp.ts'
const rate=48000, start=4080, reference=chirp(rate)
function shot(paths: [number,number][], seed=31){
  const buf=Float32Array.from({length:30000},()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return (seed/4294967296-.5)*.0005})
  for(const [delay,amplitude] of paths) for(let i=0;i<reference.length;i++)buf[start+delay+i]+=reference[i]*amplitude
  return analyze(buf,rate,start,reference)
}
test('recovers repeatable echo delay and estimates distance only with calibration',()=>{
  const samples=[1,2,3].map(seed=>shot([[1200,.11],[1680,.033]],seed))
  const profile=calibration(samples)
  assert.equal(profile.valid,true)
  const stable=reflections(samples,true,45)
  assert.ok(stable.some(e=>Math.abs(e.ms-10)<.1&&e.meters!==null&&Math.abs(e.meters-1.715)<.03&&e.angle===45))
  assert.ok(reflections(samples,false,null).every(e=>e.meters===null))
})
test('rejects noise and non-repeating candidates',()=>{
  const noise=shot([])
  assert.equal(noise.anchor,-1)
  const direct=shot([[1200,.11]])
  assert.deepEqual(reflections([noise,noise,noise],true,null),[])
  assert.deepEqual(reflections([direct,direct,shot([[1200,.11],[1680,.033]])],true,null),[])
})
test('detects unstable delay and clipped takes',()=>{
  assert.equal(calibration([shot([[1200,.12]]),shot([[1450,.12]]),shot([[1700,.12]])]).valid,false)
  const clipped=shot([[1200,1.5],[1680,.15]])
  assert.equal(clipped.clipped,true)
  assert.deepEqual(reflections([clipped,clipped,clipped],true,null),[])
})
