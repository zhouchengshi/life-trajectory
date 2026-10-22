const { chromium } = require('playwright-core')
const path = require('path')

;(async () => {
  const browser = await chromium.launch({
    channel: 'chrome',
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--hide-scrollbars']
  })
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 })
  page.on('pageerror', (e) => console.log('[pageerror]', e.message))
  await page.goto('http://127.0.0.1:5173/', { waitUntil: 'load' })
  await page.waitForTimeout(1200)

  const shot = async (name) => {
    await page.screenshot({ path: path.join(__dirname, '..', `.shots/${name}.png`) })
    const age = await page.evaluate(() => document.querySelector('.age-num')?.textContent)
    console.log(name, 'age=', age)
  }

  // 事件字幕：跳到 25.4 播放
  await page.evaluate(() => {
    const s = window.__lifeScene
    s.seek(25.2)
    s.setPlaying(true)
  })
  await page.waitForTimeout(2000)
  await shot('ev-26')

  // 死亡升天
  await page.evaluate(() => {
    const s = window.__lifeScene
    s.seek(86.6)
    s.speed = 1
    s.setPlaying(true)
  })
  await page.waitForTimeout(1600)
  await shot('death')

  // 结尾
  await page.evaluate(() => {
    const s = window.__lifeScene
    s.seek(94)
    s.speed = 2
    s.setPlaying(true)
  })
  await page.waitForTimeout(4200)
  await shot('ending')

  await browser.close()
})().catch((e) => {
  console.error('FATAL', e)
  process.exit(1)
})
