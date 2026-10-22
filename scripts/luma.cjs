const { chromium } = require('playwright-core')

/**
 * 亮度体检：截图 -> 交给浏览器自己解码 -> 统计亮度直方图。
 * 用来量化"画面泛白"：泛白 = 中间调/高光占比过高、暗部太少。
 * 用法: node scripts/luma.cjs [age...]
 */
const AGES = process.argv.slice(2).map(Number)
const LIST = AGES.length ? AGES : [18, 40, 70]

;(async () => {
  const browser = await chromium.launch({
    channel: 'chrome',
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--hide-scrollbars']
  })
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 })
  const errs = []
  page.on('pageerror', (e) => errs.push(e.message))
  page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()) })

  await page.goto('http://127.0.0.1:5173/', { waitUntil: 'load' })
  await page.waitForTimeout(1600)

  // 解码用的空白页
  const an = await browser.newPage()
  await an.goto('about:blank')

  // 调整前的旧参数，用来做 A/B 对照（只还原能在运行时改的几项）
  const applyOld = () => page.evaluate(() => {
    const s = window.__lifeScene
    s.bloom.threshold = 0.3
    s.bloom.strength = 0.55
    s.bloom.radius = 0.5
    s.renderer.toneMappingExposure = 1.02
  })
  const applyNew = () => page.evaluate(() => {
    const s = window.__lifeScene
    s.bloom.threshold = 0.78
    s.bloom.strength = 0.72
    s.bloom.radius = 0.42
    s.renderer.toneMappingExposure = 1.0
  })

  const results = []
  const oldResults = []
  for (const age of LIST) {
    await page.evaluate((a) => {
      window.__lifeScene.setPlaying(false)
      window.__lifeScene.seek(a)
    }, age)
    await page.waitForTimeout(2800)

    const buf = await page.screenshot()
    const b64 = buf.toString('base64')
    const stat = await an.evaluate(async (data) => {
      const img = new Image()
      img.src = 'data:image/png;base64,' + data
      await img.decode()
      const c = document.createElement('canvas')
      c.width = img.width; c.height = img.height
      const g = c.getContext('2d')
      g.drawImage(img, 0, 0)
      const d = g.getImageData(0, 0, c.width, c.height).data
      let sum = 0, n = 0
      let dark = 0, mid = 0, bright = 0, blown = 0
      // 亮区 = 线条/星球/文字所在的像素，单独统计它们才看得出"线条清不清晰"
      let litN = 0, litSum = 0
      const hist = new Array(16).fill(0)
      for (let i = 0; i < d.length; i += 4 * 3) { // 隔像素采样，够用且快
        const L = 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]
        sum += L; n++
        hist[Math.min(15, Math.floor(L / 16))]++
        if (L < 40) dark++
        else if (L < 150) mid++
        else if (L < 215) bright++
        else blown++
        if (L > 48) { litN++; litSum += L } // 48 以上才算"线条/星球"，避开背景残雾
      }
      return {
        mean: +(sum / n).toFixed(1),
        litPct: +((litN / n) * 100).toFixed(1),
        litMean: litN ? +(litSum / litN).toFixed(1) : 0,
        darkPct: +((dark / n) * 100).toFixed(1),
        midPct: +((mid / n) * 100).toFixed(1),
        brightPct: +((bright / n) * 100).toFixed(1),
        blownPct: +((blown / n) * 100).toFixed(1),
        hist: hist.map((h) => +((h / n) * 100).toFixed(1))
      }
    }, b64)
    results.push({ age, ...stat })

    // 同一帧位置切回旧参数再测一次
    await applyOld()
    await page.waitForTimeout(700)
    const bufOld = await page.screenshot()
    const statOld = await an.evaluate(async (data) => {
      const img = new Image()
      img.src = 'data:image/png;base64,' + data
      await img.decode()
      const c = document.createElement('canvas')
      c.width = img.width; c.height = img.height
      const g = c.getContext('2d')
      g.drawImage(img, 0, 0)
      const d = g.getImageData(0, 0, c.width, c.height).data
      let sum = 0, n = 0, litN = 0, litSum = 0
      for (let i = 0; i < d.length; i += 4 * 3) {
        const L = 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]
        sum += L; n++
        if (L > 48) { litN++; litSum += L }
      }
      return { mean: +(sum / n).toFixed(1), litMean: litN ? +(litSum / litN).toFixed(1) : 0 }
    }, bufOld.toString('base64'))
    oldResults.push({ age, ...statOld })
    await applyNew()
    await page.waitForTimeout(500)
  }

  console.log('=== 画面亮度体检（0=全黑 255=纯白）===\n')
  for (const r of results) {
    console.log(
      `age=${String(r.age).padStart(3)} | 全画面均值 ${String(r.mean).padStart(5)} | ` +
      `暗部 ${String(r.darkPct).padStart(5)}% | 亮区占比 ${String(r.litPct).padStart(4)}% | ` +
      `亮区均值 ${String(r.litMean).padStart(5)} | 过曝 ${String(r.blownPct).padStart(4)}%`
    )
    console.log(`          直方图(16档): ${r.hist.join(' ')}`)
  }

  const avg = (k) => +(results.reduce((a, r) => a + r[k], 0) / results.length).toFixed(1)
  console.log('\n=== 判定 ===')
  const mean = avg('mean'), blown = avg('blownPct'), dark = avg('darkPct')
  const litMean = avg('litMean'), litPct = avg('litPct')
  console.log(`全画面均值 ${mean} ${mean < 60 ? 'OK(通透)' : mean < 90 ? '偏亮' : '⚠ 过亮/泛白'}`)
  console.log(`过曝占比   ${blown}% ${blown < 2 ? 'OK' : blown < 5 ? '偏多' : '⚠ 大片泛白'}`)
  console.log(`暗部占比   ${dark}% ${dark > 55 ? 'OK(背景够黑)' : dark > 40 ? '偏灰' : '⚠ 整体发灰'}`)
  console.log(
    `亮区(线条) 占比 ${litPct}% 均值 ${litMean} ` +
    `${litMean >= 70 && litMean <= 150 ? 'OK(线条清晰)' : litMean < 70 ? '⚠ 线条偏暗' : '偏刺眼'}`
  )

  if (oldResults.length) {
    console.log('\n=== A/B 对照（同一画面位置，仅切换泛光阈值/曝光）===')
    for (let i = 0; i < results.length; i++) {
      const n = results[i], o = oldResults[i]
      console.log(
        `age=${String(n.age).padStart(3)} | 旧: 全画面均值 ${String(o.mean).padStart(5)} 亮区均值 ${String(o.litMean).padStart(5)}` +
        `  ->  新: 全画面均值 ${String(n.mean).padStart(5)} 亮区均值 ${String(n.litMean).padStart(5)}`
      )
    }
    const om = +(oldResults.reduce((a, r) => a + r.mean, 0) / oldResults.length).toFixed(1)
    const nm = avg('mean')
    const ol = +(oldResults.reduce((a, r) => a + r.litMean, 0) / oldResults.length).toFixed(1)
    console.log(
      `\n全画面均值 ${om} -> ${nm} (${nm < om ? '压暗 ' + (om - nm).toFixed(1) : '提亮 ' + (nm - om).toFixed(1)})；` +
      `线条均值 ${ol} -> ${avg('litMean')} (对比度 ${(avg('litMean') / nm).toFixed(2)}x vs 旧 ${(ol / om).toFixed(2)}x)`
    )
  }

  console.log('\n控制台错误:', errs.length ? errs : '无')
  await browser.close()
})().catch((e) => { console.error('FATAL', e); process.exit(1) })
