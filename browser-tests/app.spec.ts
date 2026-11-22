import {test,expect} from '@playwright/test'
test('camera denial on mobile',async({page})=>{
  await page.setViewportSize({width:375,height:812})
  await page.addInitScript(()=>{navigator.mediaDevices.getUserMedia=()=>Promise.reject(new DOMException('Denied','NotAllowedError'))})
  await page.goto('/')
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(375)
  await page.getByRole('button',{name:'Включить камеру'}).click()
  await expect(page.getByRole('alert')).toContainText('Разрешите доступ к камере')
})
test('detects details in a video stream, downloads PNG and stops capture',async({page})=>{
  await page.addInitScript(()=>{
    navigator.mediaDevices.getUserMedia=async options=>{
      if(options?.audio!==false)throw new Error('Unexpected audio request')
      const canvas=document.createElement('canvas')
      canvas.width=320;canvas.height=240
      const ctx=canvas.getContext('2d')!
      const timer=setInterval(()=>{
        for(let y=0;y<12;y++)for(let x=0;x<16;x++){
          ctx.fillStyle=(x+y)%2?'black':'white'
          ctx.fillRect(x*20,y*20,20,20)
        }
      },40)
      const stream=canvas.captureStream(25)
      const track=stream.getVideoTracks()[0]
      const stop=track.stop.bind(track)
      track.stop=()=>{stop();clearInterval(timer);document.body.dataset.stopped=track.readyState}
      return stream
    }
  })
  await page.goto('/')
  await page.getByRole('button',{name:'Включить камеру'}).click()
  await expect(page.getByText(/Точек в кадре: [1-9]/)).toBeVisible()
  await page.getByRole('checkbox',{name:'Только точки'}).check()
  const download=page.waitForEvent('download')
  await page.getByRole('button',{name:'Сохранить PNG'}).click()
  expect((await download).suggestedFilename()).toBe('echomap-scan.png')
  await page.getByRole('button',{name:'Остановить'}).click()
  await expect(page.locator('body')).toHaveAttribute('data-stopped','ended')
})
