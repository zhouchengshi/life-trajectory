const { chromium } = require('playwright-core')
const path = require('path')

;(async () => {
  const shots = process.argv[2] ? Number(process.argv[2]) : 3
  const browser = await chromium.launch({
    channel: 'chrome',
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--hide-scrollbars']
  })
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 })
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') console.log('[console]', m.type(), m.text())
  })
  page.on('pageerror', (e) => console.log('[pageerror]', e.message))

  await page.goto('http://127.0.0.1:5173/', { waitUntil: 'load' })
  await page.waitForTimeout(1200)

  for (let i = 1; i <= shots; i++) {
    await page.screenshot({ path: path.join(__dirname, '..', `.shots/shot${i}.png`) })
    console.log('shot', i, 'taken')
    await page.waitForTimeout(7000)
  }

  const info = await page.evaluate(() => ({
    age: document.querySelector('.age-num')?.textContent,
    title: document.title
  }))
  console.log('info', JSON.stringify(info))
  await browser.close()
})().catch((e) => {
  console.error('FATAL', e)
  process.exit(1)
})
