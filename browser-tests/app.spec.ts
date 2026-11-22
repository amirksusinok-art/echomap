import {test,expect} from '@playwright/test'
test('mobile layout, theme, navigation and denied microphone',async({page})=>{
  await page.setViewportSize({width:375,height:812})
  await page.addInitScript(()=>{
    navigator.mediaDevices.getUserMedia=()=>Promise.reject(new DOMException('Denied','NotAllowedError'))
  })
  await page.goto('/')
  await expect(page.getByRole('heading',{name:'Акустический сканер'})).toBeVisible()
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(375)
  await page.getByRole('button',{name:'Тёмная тема'}).click()
  await page.reload()
  await expect(page.locator('html')).toHaveAttribute('data-theme','dark')
  await page.getByRole('button',{name:'Начать сканирование'}).click()
  await expect(page.getByRole('alert')).toContainText('Разрешите доступ')
  await page.getByRole('button',{name:'История',exact:true}).click()
  await expect(page.getByText('История пока пуста')).toBeVisible()
  await page.getByRole('button',{name:'Лаборатория',exact:true}).click()
  await expect(page.getByText('Запустите сканирование или калибровку')).toBeVisible()
})
test('real AudioWorklet consumes a controlled silent stream, then releases it',async({page})=>{
  await page.addInitScript(()=>{
    const tracks:MediaStreamTrack[]=[]
    Object.assign(window,{echoTestTracks:tracks})
    navigator.mediaDevices.getUserMedia=async()=>{
      const ctx=new AudioContext()
      await ctx.resume()
      const dst=ctx.createMediaStreamDestination()
      const source=ctx.createConstantSource()
      source.offset.value=0
      source.connect(dst)
      source.start()
      const track=dst.stream.getAudioTracks()[0]
      const original=track.stop.bind(track)
      track.stop=()=>{original();void ctx.close()}
      tracks.push(track)
      return dst.stream
    }
  })
  await page.goto('/')
  await page.getByRole('button',{name:'Начать сканирование'}).click()
  await expect(page.getByText('Недостаточно данных.',{exact:false})).toBeVisible({timeout:15000})
  await expect(page.getByText('Нет подтверждённых отражений')).toBeVisible()
  expect(await page.evaluate(()=>(window as unknown as {echoTestTracks:MediaStreamTrack[]}).echoTestTracks.map(t=>t.readyState))).toEqual(['ended'])
  await page.getByRole('button',{name:'Лаборатория',exact:true}).click()
  await expect(page.getByRole('heading',{name:'Спектрограмма'})).toBeVisible()
  await page.getByRole('button',{name:'Сканер',exact:true}).click()
  await page.getByRole('button',{name:'360° Scan',exact:false}).click()
  await page.getByRole('button',{name:'Начать сканирование'}).click()
  await page.getByRole('button',{name:'Измерить 0°'}).click()
  await page.getByRole('button',{name:'Измерить 45°'}).waitFor()
  await page.getByRole('button',{name:'Завершить и сохранить'}).click()
  await expect(page.getByText('Измерены 1 из 8 положений.',{exact:false})).toBeVisible()
  await page.reload()
  await page.getByRole('button',{name:'История',exact:true}).click()
  await expect(page.getByRole('button',{name:'Открыть'})).toHaveCount(2)
})
