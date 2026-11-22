import {defineConfig} from '@playwright/test'
export default defineConfig({
  testDir:'./browser-tests',
  use:{channel:process.env.ECHOMAP_BROWSER||'msedge',baseURL:'http://127.0.0.1:4178'},
  webServer:{command:'npm run preview -- --host 127.0.0.1 --port 4178 --strictPort',url:'http://127.0.0.1:4178'},
})
