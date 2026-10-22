const { chromium } = require('playwright-core')
const path = require('path')

// 用法: node scripts/seek.cjs 8 22 35 50 70 88 96
;(async () => {
  const ages = process.argv.slice(2).map(Number)
  const browser = await chromium.launch({
    channel: 'chrome',
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--hide-scrollbars']
  })
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 })
  page.on('console', (m) => {
    if (m.type() === 'error') console.log('[console]', m.type(), m.text())
  })
  page.on('pageerror', (e) => console.log('[pageerror]', e.message))

  await page.goto('http://127.0.0.1:5173/', { waitUntil: 'load' })
  await page.waitForTimeout(1500)

  for (const age of ages) {
    await page.evaluate((a) => {
      const s = window.__lifeScene
      s.setPlaying(false)
      s.seek(a)
    }, age)
    await page.waitForTimeout(2600)
    const file = path.join(__dirname, '..', `.shots/age-${age}.png`)
    await page.screenshot({ path: file })
    console.log('captured age', age)
  }
  await browser.close()
})().catch((e) => {
  console.error('FATAL', e)
  process.exit(1)
})
