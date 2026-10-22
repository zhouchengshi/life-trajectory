const { chromium } = require('playwright-core')

// 验证时间轴动态定位：
// 竖屏 390x844 → 时间轴应贴左边缘可见；横屏 1600x900 → 保持 AXIS_X=-11.6
const CASES = [
  { name: 'portrait', w: 390, h: 844 },
  { name: 'landscape', w: 1600, h: 900 }
]
const AGES = [1, 30, 60, 90]
const BASE_URL = process.argv[2] || 'http://127.0.0.1:5173/'

;(async () => {
  const browser = await chromium.launch({
    channel: 'chrome',
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--hide-scrollbars']
  })
  let fail = 0

  for (const c of CASES) {
    const page = await browser.newPage({ viewport: { width: c.w, height: c.h }, deviceScaleFactor: 1 })
    const errs = []
    page.on('pageerror', (e) => errs.push('PAGEERROR: ' + e.message))
    await page.goto(BASE_URL, { waitUntil: 'load' })
    await page.waitForTimeout(1600)

    console.log(`\n===== ${c.name} ${c.w}x${c.h} =====`)
    for (const age of AGES) {
      await page.evaluate((a) => {
        const s = window.__lifeScene
        s.setPlaying(false)
        s.seek(a)
      }, age)
      await page.waitForTimeout(2500)

      const r = await page.evaluate(() => {
        const s = window.__lifeScene
        const cam = s.camera
        cam.updateMatrixWorld(true)
        cam.updateProjectionMatrix()
        const V = new (Object.getPrototypeOf(cam.position).constructor)()
        const sxOf = (x, y, z) => { V.set(x, y, z); V.project(cam); return (V.x + 1) / 2 }

        const ax = s.axisGroup.position.x
        const scale = s.axisGroup.scale.x
        const axisXScreen = sxOf(ax, 2.2, 0.6)
        // 刻度末端（轴向右伸 0.42*scale）与标签中心（轴向左 1.05*scale）
        const tickEndScreen = sxOf(ax + 0.42 * scale, 2.2, 0.6)
        const labelScreen = sxOf(ax - 1.05 * scale, 2.2, 0.6)
        // 竖线剔除检查：
        // 1) frustumCulled 必须为 false（端点每帧更新但包围球不重算，开启剔除会在 20 岁后整条线消失）
        const culledDisabled = s.axisProgress.frustumCulled === false
        // 2) 复现旧行为：用创建时的过期包围球（中心 y≈2.0，半径≈0.24+0.26）测视锥，
        //    若球心投影远在屏幕下边界之外则证明修复前必然被剔除
        const staleSy = ((V.set(ax, 2.0, 0.6), V.project(cam), (V.y + 1) / 2))
        const staleNdcR = 0.5 / (2 * s.halfViewH) // 半径换算成屏幕归一化
        const staleWouldCull = staleSy + staleNdcR < 0
        // 3) 竖线真实端点（底 y=1.8、头 y=headY）投影应在画面垂直范围内
        const headY = 2.2 + s.age * 0.44
        const botSy = ((V.set(ax, 1.8, 0.6), V.project(cam), (V.y + 1) / 2))
        const headSy = ((V.set(ax, headY, 0.6), V.project(cam), (V.y + 1) / 2))
        // 收集所有成员轨迹头部的世界 x，判断是否有落在轴刻度带内的
        const trackXs = []
        const bandHit = []
        for (const v of s.visuals) {
          if (!(v.member && v.group)) continue
          const x = v.group.position.x
          trackXs.push(+x.toFixed(2))
          if (x > ax - 0.05 && x < ax + 0.42 * scale + 0.13) {
            // 头部真实可见性：遍历组内可见网格的材质取最大 opacity
            let op = 0
            v.group.traverse((o) => {
              if (o.visible && o.material && o.material.opacity !== undefined) op = Math.max(op, o.material.opacity)
            })
            bandHit.push({
              name: v.member.name || '(过客)',
              kind: v.member.kind,
              x: +x.toFixed(2),
              headOpacity: +op.toFixed(2)
            })
          }
        }
        trackXs.sort((a, b) => a - b)
        return {
          axisXWorld: +ax.toFixed(2),
          axisXScreen: +axisXScreen.toFixed(3),
          tickEndScreen: +tickEndScreen.toFixed(3),
          labelScreen: +labelScreen.toFixed(3),
          culledDisabled,
          staleWouldCull,
          botSy: +botSy.toFixed(3),
          headSy: +headSy.toFixed(3),
          trackXs: trackXs.slice(0, 4),
          bandHit
        }
      })

      const inView = r.axisXScreen >= 0.005 && r.tickEndScreen <= 0.995
      // 硬约束：非 cross 成员（直系/长期停留）头部可见时不得压轴。
      // cross 成员的入场/退场腿必然横扫画布左侧，瞬态交叠可接受（轴在前景层）。
      const realHit = r.bandHit.filter((b) => b.kind !== 'cross' && b.headOpacity > 0.05)
      const noOverlap = realHit.length === 0
      // 竖线：剔除已关闭 + 顶端（当前年龄处）在画面垂直范围内（底端延伸出画面下沿是设计使然）
      const lineOk = r.culledDisabled && r.headSy > 0 && r.headSy < 1.05
      const ok = inView && noOverlap && lineOk && !errs.length
      if (!ok) fail++
      console.log(
        `age=${String(age).padStart(4)} | 轴x(世界)=${r.axisXWorld} 轴x(屏幕)=${r.axisXScreen} ` +
        `刻度端=${r.tickEndScreen} 标签=${r.labelScreen} | 竖线: 剔除关=${r.culledDisabled} ` +
        `旧包围球会剔除=${r.staleWouldCull} 端点sy=[${r.botSy},${r.headSy}] | ` +
        `最左4条轨迹=${JSON.stringify(r.trackXs)} 轴带碰撞=${JSON.stringify(r.bandHit)} | ` +
        `画面内=${inView} 可见碰撞=${realHit.length} ${ok ? '✓' : '✗ ' + errs.join(';')}`
      )
    }
    await page.close()
  }

  await browser.close()
  console.log(fail === 0 ? '\n全部通过' : `\n${fail} 项失败`)
  process.exit(fail === 0 ? 0 : 1)
})()
