const { chromium } = require('playwright-core')

// 非视觉验证：读取运行时数值，换算成屏幕归一化坐标（0=底 1=顶），判断构图是否正确
const AGES = [0, 5, 12, 20, 30, 45, 60, 75, 88, 96, 97.5]

;(async () => {
  const browser = await chromium.launch({
    channel: 'chrome',
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--hide-scrollbars']
  })
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 })
  const errs = []
  page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()) })
  page.on('pageerror', (e) => errs.push('PAGEERROR: ' + e.message))

  await page.goto(process.argv[2] || 'http://127.0.0.1:5173/', { waitUntil: 'load' })
  await page.waitForTimeout(1600)

  const rows = []
  for (const age of AGES) {
    await page.evaluate((a) => {
      const s = window.__lifeScene
      s.setPlaying(false)
      s.seek(a)
    }, age)
    await page.waitForTimeout(3000) // 等待相机/星辰缓动收敛

    const r = await page.evaluate(() => {
      const s = window.__lifeScene
      const cam = s.camera
      cam.updateMatrixWorld(true)
      cam.updateProjectionMatrix()

      const project = (x, y, z) => {
        const v = new (Object.getPrototypeOf(cam.position).constructor)(x, y, z)
        v.project(cam)
        // NDC y: -1(底) .. 1(顶)  ->  屏幕高度比例
        return { sx: (v.x + 1) / 2, sy: (v.y + 1) / 2 }
      }

      const BASE_Y = 2.2, YEAR_SCALE = 0.44
      const headY = BASE_Y + s.age * YEAR_SCALE

      // 星辰（逝者）屏幕位置
      // sy(0=底 1=顶) -> 距屏幕顶部的像素
      const H = window.innerHeight
      const pxFromTop = (sy) => +((1 - sy) * H).toFixed(0)

      const starPos = s.stars.filter((st) => st.sprite.visible).map((st) => {
        const p = st.sprite.position
        const sp = project(p.x, p.y, p.z)
        const h = st.sprite.scale.y // 世界高度
        const halfScreenH = s.halfViewH
        const topEdge = sp.sy + (h / 2) / (halfScreenH * 2)
        const lp = st.label ? project(st.label.position.x, st.label.position.y, st.label.position.z) : null
        return {
          name: st.member.name || '(过客)',
          sy: +sp.sy.toFixed(3),
          sx: +sp.sx.toFixed(3),
          topEdge: +topEdge.toFixed(3),
          topPx: pxFromTop(topEdge),
          labelVisible: st.label ? st.label.visible : false,
          labelOpacity: st.labelMat ? +st.labelMat.opacity.toFixed(2) : 0,
          labelPx: lp ? pxFromTop(lp.sy) : null
        }
      })

      // 当前年龄头部（我的星球）屏幕位置
      const me = s.visuals.find((v) => v.member && v.member.id === 'me')
      const mePos = me ? project(me.group.position.x, me.group.position.y, me.group.position.z) : null

      // 时间轴顶端 / 底端
      const axisTopY = BASE_Y - 0.4
      const aTop = project(-11.6, axisTopY, 0)
      const aCur = project(-11.6, headY, 0)

      // 轨迹是否越界（取管道几何体顶点）
      let minSx = 1, maxSx = 0
      s.visuals.forEach((v) => {
        const pos = v.trail && v.trail.geometry && v.trail.geometry.attributes.position
        if (!pos) return
        for (let i = 0; i < pos.count; i += 7) {
          const sp = project(pos.getX(i), pos.getY(i), pos.getZ(i))
          if (sp.sx < minSx) minSx = sp.sx
          if (sp.sx > maxSx) maxSx = sp.sx
        }
      })

      // 可见刻度数量（时间轴生长）
      const visibleTicks = s.axisTicks.filter((t) => t.labelMat.opacity > 0.5).length

      return {
        age: +s.age.toFixed(2),
        ended: s.ended,
        camY: +s.camY.toFixed(2),
        headY: +headY.toFixed(2),
        camErr: +(s.camY - headY).toFixed(3),
        halfViewH: +s.halfViewH.toFixed(2),
        headScreen: mePos ? +mePos.sy.toFixed(3) : null,
        axisBaseScreen: +aTop.sy.toFixed(3),
        axisHeadScreen: +aCur.sy.toFixed(3),
        visibleTicks,
        starCount: s.stars.length,
        starVisible: s.stars.filter((st) => st.sprite.visible).length,
        // 相交线：非亲属关系相对"我"(x≈0)的横向距离，应当先靠近后远离
        cross: s.visuals
          .filter((v) => v.member.kind === 'cross' && !v.member.anonymous)
          .map((v) => {
            const m = v.member
            const V = Object.getPrototypeOf(cam.position).constructor
            const at = (a) => {
              const p = s.trailPoint(m, Math.max(m.enter, Math.min(m.exit, a)), new V())
              return +Math.abs(p.x).toFixed(2)
            }
            return `${m.short || m.name}:${at(m.enter + 0.5)}→${at(m.peakAge ?? (m.enter + m.exit) / 2)}→${at(m.exit - 0.5)}`
          }),
        stars: starPos,
        trackMinSx: +minSx.toFixed(3),
        trackMaxSx: +maxSx.toFixed(3),
        hudBottomPx: (() => {
          const el = document.querySelector('.age-panel')
          return el ? +el.getBoundingClientRect().bottom.toFixed(0) : null
        })(),
        domAge: document.querySelector('.age-num') ? document.querySelector('.age-num').textContent.trim() : null,
        domEnding: !!document.querySelector('.ending') && getComputedStyle(document.querySelector('.ending')).opacity
      }
    })
    rows.push(r)
  }

  console.log('=== 运行时数值验证 ===\n')
  for (const r of rows) {
    console.log(
      `age=${String(r.age).padStart(5)} | 头部屏幕高=${fmt(r.headScreen)} | camErr=${String(r.camErr).padStart(6)} | 轴底=${fmt(r.axisBaseScreen)} 轴头=${fmt(r.axisHeadScreen)} | 刻度=${String(r.visibleTicks).padStart(2)} | 星辰=${r.starVisible}/${r.starCount} | 轨迹x=[${r.trackMinSx}, ${r.trackMaxSx}] | DOM年龄=${r.domAge}`
    )
    if (r.stars.length) {
      const tops = r.stars.map((s) => s.sy)
      const edges = r.stars.map((s) => s.topEdge)
      console.log(`            星辰屏幕高度: ${tops.join(', ')}   顶边: ${edges.join(', ')}`)
      console.log(
        `            星辰距顶 ${Math.min(...r.stars.map((s) => s.topPx))}px | HUD底 ${r.hudBottomPx}px | ` +
          `姓名: ${r.stars.map((s) => `${s.name}(${s.labelVisible ? s.labelOpacity : '隐'})`).join(' ')}`
      )
    }
    if (!r._crossPrinted && r.cross.length) {
      r._crossPrinted = true
      console.log(`            相交线(距我横向距离 入→峰→出): ${r.cross.join(' | ')}`)
    }
  }

  console.log('\n=== 判定 ===')
  const late = rows.filter((r) => r.age >= 45)
  late.forEach((r) => {
    const ok = Math.abs(r.headScreen - 0.5) < 0.09
    console.log(`age=${r.age} 当前年龄居中: ${ok ? 'OK' : '偏差 ' + (r.headScreen - 0.5).toFixed(3)}`)
  })
  const withStars = rows.filter((r) => r.stars.length)
  withStars.forEach((r) => {
    const maxEdge = Math.max(...r.stars.map((s) => s.topEdge))
    const minSy = Math.min(...r.stars.map((s) => s.sy))
    console.log(
      `age=${r.age} 星辰顶端: 中心最高=${minSy.toFixed(3)} 顶边最高=${maxEdge.toFixed(3)} ` +
        `${maxEdge <= 1.0 ? 'OK(未溢出)' : '溢出画面 ' + (maxEdge - 1).toFixed(3)}`
    )
  })
  rows.forEach((r) => {
    if (r.trackMinSx < 0 || r.trackMaxSx > 1) {
      console.log(`age=${r.age} ⚠ 轨迹越界 x=[${r.trackMinSx}, ${r.trackMaxSx}]`)
    }
    if (r.stars.length && r.hudBottomPx != null) {
      const gap = Math.min(...r.stars.map((s) => s.topPx)) - r.hudBottomPx
      console.log(
        `age=${r.age} 星辰与顶部年龄面板间距 = ${gap}px ${gap >= 0 ? 'OK' : '⚠ 重叠 ' + -gap + 'px'}`
      )
    }
  })

  console.log('\n控制台错误:', errs.length ? errs : '无')
  await browser.close()
})().catch((e) => { console.error('FATAL', e); process.exit(1) })

function fmt(v) { return v === null || v === undefined ? ' -- ' : v.toFixed(3) }
