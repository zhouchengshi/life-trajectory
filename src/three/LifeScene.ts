import * as THREE from 'three'
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js'
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js'

import { YEAR_SCALE, BASE_Y, MAX_AGE } from '../data/members'
import type { LifeConfig } from '../data/store'
import type { Member } from '../data/members'
import { createGlowTexture, createStarTexture, createTextSprite } from './textures'
import { skyVertexShader, skyFragmentShader, trailVertexShader, trailFragmentShader } from './shaders'

export interface SceneState {
  age: number
  playing: boolean
  ended: boolean
  departed: number
  total: number
}

export interface LifeEvent {
  age: number
  text: string
  sub?: string
}

interface Visual {
  member: Member
  group: THREE.Group
  core: THREE.Mesh
  coreMat: THREE.MeshBasicMaterial
  glow: THREE.Sprite
  glowMat: THREE.SpriteMaterial
  halo: THREE.Sprite
  haloMat: THREE.SpriteMaterial
  label?: THREE.Sprite
  labelMat?: THREE.SpriteMaterial
  trail: THREE.Mesh
  trailMat: THREE.ShaderMaterial
  alpha: number
  labelY: number
  scale: number
  gone: boolean
}

interface StarNode {
  member: Member
  sprite: THREE.Sprite
  mat: THREE.SpriteMaterial
  label: THREE.Sprite
  labelMat: THREE.SpriteMaterial
  skyY: number
  /** 天穹上的落位（已按最小间距铺开），不再直接用 m.x */
  skyX: number
  phase: number
}

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v)
const smoothstep = (e0: number, e1: number, x: number) => {
  const t = clamp01((x - e0) / (e1 - e0))
  return t * t * (3 - 2 * t)
}
const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3)
const easeInOut = (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2)

const AXIS_X = -11.6
/** 竖屏时时间轴贴左边留出的边距（世界单位），避免压住最左侧轨迹 */
const AXIS_MARGIN = 1.5
/** 竖屏时轴组整体缩放：刻度和标签更紧凑，标签不被左边缘裁切 */
const AXIS_PORTRAIT_SCALE = 0.85
/** 顶部 HUD（当前年龄面板）占用的像素高度 + 余量，天穹要让开这么多 */
const HUD_SAFE_PX = 78
/** 星辰 sprite 稳定后的半高（世界单位），含辉光余量 */
const STAR_HALF_H = 0.68

export class LifeScene {
  private container: HTMLElement
  private renderer: THREE.WebGLRenderer
  private scene = new THREE.Scene()
  private camera: THREE.PerspectiveCamera
  private composer!: EffectComposer
  private bloom!: UnrealBloomPass
  private lastTime = 0

  private skyMat!: THREE.ShaderMaterial
  private skyQuad!: THREE.Mesh
  private starField!: THREE.Points
  private axisGroup = new THREE.Group()
  /** 时间轴世界 x 坐标：横屏固定 AXIS_X，竖屏贴左边缘动态计算 */
  private axisX = AXIS_X
  private axisProgress!: THREE.Line
  private axisTicks: { age: number; tickMat: THREE.LineBasicMaterial; labelMat: THREE.SpriteMaterial }[] = []
  private axisCursor!: THREE.Sprite

  private visuals: Visual[] = []
  private stars: StarNode[] = []
  private glowTex: THREE.Texture
  private starTex: THREE.Texture

  private camY = BASE_Y + 4.6
  private camDist = 14
  private halfViewH = 7.2
  private elapsed = 0
  private raf = 0
  private disposed = false
  private prevAge = 0
  private startDelay = 0.8
  private cfg: LifeConfig
  /** 所有随配置变化的东西都挂在这个组下，rebuild 时整棵清掉 */
  private world = new THREE.Group()

  age = 0
  playing = true
  speed = 1
  ended = false

  onUpdate?: (s: SceneState) => void
  onEvent?: (e: LifeEvent) => void

  constructor(container: HTMLElement, config: LifeConfig) {
    this.cfg = config
    this.container = container
    this.glowTex = createGlowTexture(128)
    this.starTex = createStarTexture(160)

    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance'
    })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
    // ACES 会把亮色去饱和压成灰白，换成 Neutral 能保住线条的本色
    this.renderer.toneMapping = THREE.NeutralToneMapping
    this.renderer.toneMappingExposure = 1.0
    this.renderer.domElement.style.cssText = 'position:absolute;inset:0;display:block;'
    container.appendChild(this.renderer.domElement)

    this.camera = new THREE.PerspectiveCamera(38, 1, 0.1, 240)
    this.camera.position.set(0, this.camY, this.camDist)

    this.buildSky()
    this.buildStarField()
    this.buildAxis()
    this.scene.add(this.world)
    this.buildMembers()
    this.buildSkyStars()

    this.setupComposer()
    this.resize()
    this.loop()
  }

  /* ---------------- 场景构建 ---------------- */

  private buildSky() {
    this.skyMat = new THREE.ShaderMaterial({
      vertexShader: skyVertexShader,
      fragmentShader: skyFragmentShader,
      uniforms: {
        uTime: { value: 0 },
        uScroll: { value: 0 },
        uAspect: { value: 1.78 }
      },
      depthTest: false,
      depthWrite: false
    })
    this.skyQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.skyMat)
    this.skyQuad.frustumCulled = false
    this.skyQuad.renderOrder = -100
    this.scene.add(this.skyQuad)
  }

  private buildStarField() {
    const count = 320
    const pos = new Float32Array(count * 3)
    const sizes = new Float32Array(count)
    for (let i = 0; i < count; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 70
      pos[i * 3 + 1] = -8 + Math.random() * 76
      pos[i * 3 + 2] = -46 + Math.random() * 34
      sizes[i] = 0.5 + Math.random() * 1.6
    }
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    geo.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1))
    const mat = new THREE.PointsMaterial({
      size: 0.06,
      map: this.glowTex,
      color: new THREE.Color('#9dbdf0'),
      transparent: true,
      opacity: 0.32,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      sizeAttenuation: true
    })
    this.starField = new THREE.Points(geo, mat)
    this.starField.frustumCulled = false
    this.scene.add(this.starField)
  }

  private buildAxis() {
    const bottomY = BASE_Y - 0.4
    // 轴内元素全部用相对坐标（x=0 为轴线），由 axisGroup.position.x 统一定位，
    // 这样竖屏/横屏切换时只需挪组位置，不用重建几何
    this.axisGroup.position.set(this.axisX, 0, 0.6)

    // 时间轴只有一条：从 0 岁开始，随年龄向上生长
    this.axisProgress = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0, bottomY, 0),
        new THREE.Vector3(0, BASE_Y, 0)
      ]),
      new THREE.LineBasicMaterial({ color: 0xd8e6ff, transparent: true, opacity: 0.8 })
    )
    // 竖线端点每帧被 updateAxis 拉到当前年龄高度，但包围球不会自动重算——
    // 相机上移后过期包围球落在视锥外，整条线会被视锥剔除（表现为 20 岁后竖线消失）。
    // 该线永远贯穿画面，直接关闭剔除。
    this.axisProgress.frustumCulled = false
    this.axisGroup.add(this.axisProgress)

    // 每一个刻度随年龄生长出来
    for (let a = 0; a <= MAX_AGE; a += 10) {
      const y = BASE_Y + a * YEAR_SCALE
      const tickMat = new THREE.LineBasicMaterial({
        color: 0x9db4dd,
        transparent: true,
        opacity: 0
      })
      const tick = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(0, y, 0),
          new THREE.Vector3(0.42, y, 0)
        ]),
        tickMat
      )
      this.axisGroup.add(tick)

      const label = createTextSprite(`${a}岁`, 0.3, {
        color: '#a8bfe6',
        fontSize: 56,
        weight: 400,
        glow: 'rgba(90,130,220,0.55)',
        glowBlur: 14,
        opacity: 1
      })
      label.position.set(-1.05, y, 0)
      this.axisGroup.add(label)
      const labelMat = label.material as THREE.SpriteMaterial
      labelMat.opacity = 0

      this.axisTicks.push({ age: a, tickMat, labelMat })
    }

    // 当前年龄光点
    this.axisCursor = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: this.starTex,
        color: new THREE.Color('#eaf3ff'),
        transparent: true,
        depthWrite: false,
        depthTest: false,
        blending: THREE.AdditiveBlending
      })
    )
    this.axisCursor.scale.setScalar(0.72)
    this.axisCursor.position.set(0, BASE_Y, 0)
    this.axisGroup.add(this.axisCursor)

    this.scene.add(this.axisGroup)
  }

  /** 轨迹解析函数：所有位置的唯一真相 */
  private trailPoint(m: Member, age: number, out = new THREE.Vector3()) {
    const wobble = Math.sin(age * 0.26 + m.phase) * 0.22
    let x: number

    if (m.kind === 'cross') {
      // 从远处出现 → 与我相交 → 各自远离
      const pa = m.peakAge ?? (m.enter + m.exit) * 0.5
      const inX = m.entryX ?? m.x
      const peakX = m.peakX ?? m.x
      const outX = m.exitX ?? peakX
      if (age <= pa) {
        // 靠近：在相交点横向速度为 0，转弯才圆润
        const t = clamp01((age - m.enter) / Math.max(0.001, pa - m.enter))
        const e = 1 - (1 - t) * (1 - t)
        x = THREE.MathUtils.lerp(inX, peakX, e)
      } else {
        const t = clamp01((age - pa) / Math.max(0.001, m.exit - pa))
        const e = t * t
        x = THREE.MathUtils.lerp(peakX, outX, e)
      }
    } else if (m.kind === 'approach') {
      // 后来的亲人：从远处缓缓靠近，然后一路并排走下去
      const pa = m.peakAge ?? m.enter + 2
      const t = clamp01((age - m.enter) / Math.max(0.001, pa - m.enter))
      const e = 1 - (1 - t) * (1 - t)
      x = THREE.MathUtils.lerp(m.entryX ?? m.x, m.x, e)
    } else {
      // 直系：出生时略微收拢，二十岁后完全展开
      const spread = 0.82 + 0.18 * smoothstep(0, 20, age)
      x = m.x * spread
    }

    const y = BASE_Y + age * YEAR_SCALE
    const z = Math.sin(age * 0.19 + m.phase * 1.7) * 0.72
    return out.set(x + wobble, y, z)
  }

  private buildMembers() {
    this.cfg.tracks.forEach((m, idx) => {
      const anon = !!m.anonymous
      const pScale = anon ? 0.5 : 1 // 过客的星球更小

      // ---- 轨迹光带 ----
      const pts: THREE.Vector3[] = []
      const steps = 200
      const endAge = m.exit + 1.5
      for (let i = 0; i <= steps; i++) {
        pts.push(this.trailPoint(m, (i / steps) * endAge, new THREE.Vector3()))
      }
      const curve = new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.5)
      const radius = m.id === 'me' ? 0.062 : anon ? 0.03 : 0.048
      // 截面段数 8：细管的外轮廓靠它才够圆滑，段数少了会看成多边形棱
      const tubeGeo = new THREE.TubeGeometry(curve, 340, radius, 8, false)

      const baseColor = new THREE.Color(m.color)
      const trailMat = new THREE.ShaderMaterial({
        vertexShader: trailVertexShader,
        fragmentShader: trailFragmentShader,
        uniforms: {
          uHead: { value: 0 },
          uBaseY: { value: BASE_Y },
          uYearScale: { value: YEAR_SCALE },
          uEnter: { value: m.enter },
          uAlpha: { value: 0 },
          uGlow: { value: anon ? 0.62 : 1.0 },
          uFade: { value: 0 },
          uColor: { value: baseColor.clone() },
          uHeadColor: { value: baseColor.clone().lerp(new THREE.Color('#ffffff'), 0.45) }
        },
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false
      })
      const trail = new THREE.Mesh(tubeGeo, trailMat)
      this.world.add(trail)

      // ---- 星球 ----
      const group = new THREE.Group()
      const coreMat = new THREE.MeshBasicMaterial({
        color: baseColor.clone().lerp(new THREE.Color('#ffffff'), 0.22),
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false
      })
      const core = new THREE.Mesh(new THREE.SphereGeometry(0.055 * pScale, 16, 16), coreMat)
      group.add(core)

      const glowMat = new THREE.SpriteMaterial({
        map: this.glowTex,
        color: baseColor.clone(),
        transparent: true,
        opacity: 0.7,
        depthWrite: false,
        blending: THREE.AdditiveBlending
      })
      const glow = new THREE.Sprite(glowMat)
      // 纵向拉长，制造向上运行的拖影
      glow.scale.set(0.62 * pScale, 0.62 * pScale * 1.45, 1)
      group.add(glow)

      const haloMat = new THREE.SpriteMaterial({
        map: this.glowTex,
        color: baseColor.clone(),
        transparent: true,
        opacity: 0.085,
        depthWrite: false,
        blending: THREE.AdditiveBlending
      })
      // halo 是半径 1.7 的大范围柔光，30 条叠加足以把画面糊白，压到很淡
      const halo = new THREE.Sprite(haloMat)
      halo.scale.setScalar(1.7 * pScale)
      group.add(halo)

      // ---- 名字标签（过客不标注） ----
      let label: THREE.Sprite | undefined
      let labelMat: THREE.SpriteMaterial | undefined
      let labelY = 0
      if (!anon) {
        const longName = (m.short || m.name).length > 3
        const isCross = m.kind === 'cross'
        const labelH = longName ? (isCross ? 0.24 : 0.28) : isCross ? 0.3 : 0.35
        label = createTextSprite(m.short || m.name, labelH, {
          color: baseColor.clone().lerp(new THREE.Color('#ffffff'), m.kind === 'cross' ? 0.6 : 0.78).getStyle(),
          fontSize: longName ? 52 : 60,
          weight: 500,
          glow: baseColor.getStyle(),
          glowBlur: 16,
          letterSpacing: 1
        })
        // 星球缩小后，标注相应拉近一点，避免"名字飘在半空"
        labelY = (m.kind === 'root' ? 1.18 : 0.8) + (idx % 3) * 0.38
        label.position.set(0, labelY, 0)
        labelMat = label.material as THREE.SpriteMaterial
        group.add(label)

        const leader = new THREE.Line(
          new THREE.BufferGeometry().setFromPoints([
            new THREE.Vector3(0, 0.13, 0),
            new THREE.Vector3(0, labelY - labelH * 0.8, 0)
          ]),
          new THREE.LineBasicMaterial({
            color: baseColor.clone(),
            transparent: true,
            opacity: 0.22
          })
        )
        group.add(leader)
      }

      group.visible = false
      this.world.add(group)

      this.visuals.push({
        member: m,
        group,
        core,
        coreMat,
        glow,
        glowMat,
        halo,
        haloMat,
        label,
        labelMat,
        trail,
        trailMat,
        alpha: 0,
        labelY,
        scale: pScale,
        gone: false
      })
    })
  }

  private setupComposer() {
    // 走后处理后 renderer 自带的 antialias 就失效了，
    // 必须显式给 composer 一个带 MSAA 的渲染目标，否则线条全是锯齿
    const size = this.renderer.getDrawingBufferSize(new THREE.Vector2())
    const rt = new THREE.WebGLRenderTarget(size.x, size.y, {
      type: THREE.HalfFloatType, // 同时消除辉光渐变处的色带
      samples: 4
    })
    this.composer = new EffectComposer(this.renderer, rt)
    this.composer.addPass(new RenderPass(this.scene, this.camera))
    // 阈值 0.3 太低会让整幅画面都进泛光、糊成一片白。
    // 抬到 0.78 后只有星球核心与轨迹头部这些真正的高光才发光，对比度立刻回来。
    this.bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.72, 0.42, 0.78)
    this.composer.addPass(this.bloom)
    this.composer.addPass(new OutputPass())
  }

  /* ---------------- 尺寸 ---------------- */

  resize() {
    const w = this.container.clientWidth || window.innerWidth
    const h = this.container.clientHeight || window.innerHeight
    const aspect = w / h

    this.renderer.setSize(w, h)
    this.camera.aspect = aspect

    // 目标可视野：横屏宽 27.6 单位（最外侧的相交线也在画面内）；
    // 竖屏若仍塞 27.6，所有东西会缩成一条缝，改为「主体可见」（±7 左右），
    // 大学/同事散场后的远端允许出画，主体成员不受影响
    const fovR = (this.camera.fov * Math.PI) / 180
    const targetW = aspect < 1 ? Math.max(13.5, 27.6 * aspect * 0.62) : 27.6
    const dh = 13.6 / 2 / Math.tan(fovR / 2)
    const dw = targetW / 2 / (Math.tan(fovR / 2) * aspect)
    this.camDist = Math.max(dh, dw, 11)
    // 视口半高（世界单位）：天穹定位依赖它，必须随视口实时求解
    this.halfViewH = this.camDist * Math.tan(fovR / 2)

    // 时间轴定位：横屏固定在 AXIS_X；竖屏可见半宽只有 7 左右（-11.6 完全出画），
    // 改为贴左边缘放置，边距取 1.15 让开岳父（-4.5 一带）的轨迹；
    // 同时整体缩放轴组，刻度/标签更紧凑，标签不会被左边缘裁切
    const halfViewW = this.halfViewH * aspect
    const portrait = aspect < 1
    this.axisX = portrait ? -(halfViewW - 1.15) : AXIS_X
    this.axisGroup.position.x = this.axisX
    this.axisGroup.scale.setScalar(portrait ? AXIS_PORTRAIT_SCALE : 1)

    // 旋转屏幕后可见宽度变了，天穹落位也要跟着重排
    this.layoutSkyStars()

    this.camera.updateProjectionMatrix()
    this.composer.setSize(w, h)
    this.skyMat.uniforms.uAspect.value = aspect
  }

  /* ---------------- 主循环 ---------------- */

  private loop = () => {
    if (this.disposed) return
    this.raf = requestAnimationFrame(this.loop)
    const now = performance.now()
    const dt = this.lastTime ? Math.min((now - this.lastTime) / 1000, 0.06) : 0.016
    this.lastTime = now
    this.elapsed += dt
    this.update(dt)
    this.composer.render()
  }

  private update(dt: number) {
    // 时间推进
    if (this.playing && this.startDelay > 0) {
      this.startDelay -= dt
    } else if (this.playing && !this.ended) {
      // 越往后走得越快：少年漫长、白驹过隙
      const ramp = 1 + 0.45 * (this.age / this.cfg.endAge)
      this.age += dt * this.speed * this.cfg.speed * ramp
      if (this.age >= this.cfg.endAge) {
        this.age = this.cfg.endAge
        this.ended = true
        this.playing = false
      }
    }
    this.checkEvents()

    const age = this.age
    const headY = BASE_Y + age * YEAR_SCALE

    // 相机跟随：时间轴从 0 处生长，当前年龄一路升到画面垂直中心后锁定
    const targetCamY = this.solveCamY(headY)
    this.camY += (targetCamY - this.camY) * Math.min(1, dt * 3.2)
    this.camera.position.set(0, this.camY, this.camDist)
    this.camera.lookAt(0, this.camY, 0)

    // 背景对齐相机
    const fovR = (this.camera.fov * Math.PI) / 180
    const planeH = 2 * Math.tan(fovR / 2) * 1.0
    const planeW = planeH * this.camera.aspect
    this.skyQuad.scale.set(planeW, planeH, 1)
    this.skyQuad.position.copy(this.camera.position)
    this.skyQuad.quaternion.copy(this.camera.quaternion)
    this.skyQuad.translateZ(-1)
    this.skyMat.uniforms.uTime.value = this.elapsed
    this.skyMat.uniforms.uScroll.value = this.camY * 0.16

    // 星点云跟随（保持视野内始终有星）
    this.starField.position.y = this.camY * 0.55

    // 时间轴
    this.updateAxis(age, headY)

    // 成员
    const tmp = new THREE.Vector3()
    for (const v of this.visuals) {
      this.updateMember(v, age, dt, tmp)
    }
    this.updateStars(age, dt)

    this.onUpdate?.({
      age: this.age,
      playing: this.playing,
      ended: this.ended,
      departed: this.visuals.filter((v) => v.member.fate !== 'alive' && age >= v.member.exit).length,
      total: this.visuals.filter((v) => v.member.fate !== 'alive').length
    })
  }

  private updateAxis(age: number, headY: number) {
    const bottomY = BASE_Y - 0.4
    const positions = this.axisProgress.geometry.attributes.position as THREE.BufferAttribute
    positions.setY(0, bottomY)
    positions.setY(1, headY)
    positions.needsUpdate = true

    // 刻度随年龄长出来
    for (const t of this.axisTicks) {
      const grow = smoothstep(t.age - 1.2, t.age + 1.5, age)
      t.tickMat.opacity = grow * 0.55
      t.labelMat.opacity = grow * 0.88
    }

    this.axisCursor.position.y = headY
    const pulse = 0.72 + Math.sin(this.elapsed * 3.4) * 0.1
    this.axisCursor.scale.setScalar(pulse)
    ;(this.axisCursor.material as THREE.SpriteMaterial).opacity = age > 0.2 ? 1 : 0.5
  }

  private updateMember(v: Visual, age: number, dt: number, tmp: THREE.Vector3) {
    const m = v.member
    const exists = age >= m.enter - 0.4
    const over = age - m.exit

    // 目标透明度
    let target = 1
    if (!exists) target = 0
    else if (over > 0) target = m.fate === 'die' ? 0.038 : 0

    v.alpha += (target - v.alpha) * Math.min(1, dt * 2.2)
    if (v.alpha < 0.002 && target === 0) v.alpha = 0

    v.trailMat.uniforms.uHead.value = age
    v.trailMat.uniforms.uAlpha.value = v.alpha
    v.trailMat.uniforms.uFade.value = over > 0 ? clamp01(over / 2.0) : 0

    if (!exists) {
      v.group.visible = false
      v.trail.visible = false
      return
    }
    v.trail.visible = v.alpha > 0.01

    // 星球位置：死亡后停在终点
    const planetAge = Math.min(age, m.exit)
    this.trailPoint(m, planetAge, tmp)
    v.group.position.copy(tmp)

    // 生命状态
    const lifeT = clamp01((age - m.enter) / Math.max(1, m.exit - m.enter))
    const breathe = 1 + Math.sin(this.elapsed * 1.9 + m.phase * 3.1) * 0.055
    // 出生时逐渐成型
    const grow = smoothstep(m.enter, m.enter + 1.2, age)

    // 临终脉动
    const nearEnd = smoothstep(m.exit - 3.5, m.exit, age) * (1 - smoothstep(m.exit, m.exit + 0.8, age))
    const deathPulse = 1 + Math.sin(age * 26) * 0.3 * nearEnd

    // 消散：离世后炸开
    const burst = clamp01(over / 1.1)
    const burstScale = 1 + burst * 3.2 * (m.fate === 'die' ? 1 : 0.35)
    const burstFade = 1 - clamp01(over / (m.fate === 'die' ? 1.2 : 2.2))

    const planetAlpha = exists ? Math.max(0, Math.min(v.alpha * 1.6, burstFade)) : 0
    v.group.visible = planetAlpha > 0.01 && over < (m.fate === 'die' ? 1.4 : 2.6)

    // 离世瞬间的一次光爆
    const flash = Math.sin(clamp01(over / 0.9) * Math.PI) * (m.fate === 'die' ? 0.5 : 0.16)

    const s = breathe * grow * burstScale * deathPulse
    const k = v.scale
    v.core.scale.setScalar(s * k * (1 + flash * 1.2))
    v.coreMat.opacity = Math.min(1, planetAlpha + flash * 0.6)
    // glow 纵向拉长，越跑越快的感觉（基准值与初始 scale 保持一致）
    const gw = 0.62 * k * s * (1 + nearEnd * 0.4) * (1 + flash * 1.1)
    v.glow.scale.set(gw, gw * 1.45, 1)
    v.glowMat.opacity = 0.8 * planetAlpha + flash * 0.5
    v.halo.scale.setScalar(1.7 * k * s * (1 + flash * 0.8))
    v.haloMat.opacity = 0.085 * planetAlpha + flash * 0.1

    if (v.labelMat) v.labelMat.opacity = clamp01(planetAlpha * 1.4)
  }

  private updateStars(age: number, dt: number) {
    // 天穹贴到视口最顶端，但要让开两样东西：
    // 1) 星点自身的半高 + 辉光，否则会被裁掉；
    // 2) 顶部居中的「当前年龄」面板（按像素换算，窗口再矮也不会压上去）
    // 竖屏时顶部面板字号更大，安全区相应加宽
    const viewH = this.container.clientHeight || window.innerHeight || 1
    const viewW = this.container.clientWidth || window.innerWidth || 1
    const hudPx = viewW < viewH ? HUD_SAFE_PX + 20 : HUD_SAFE_PX
    const hudSafe = (hudPx / viewH) * 2 * this.halfViewH
    const skyBase = this.camY + this.halfViewH - STAR_HALF_H - hudSafe
    // 起飞点下限：相机上移后逝者的离世位置早已沉到画面下方，
    // 把它夹到画面下缘附近，保证"飘升"的整段过程都看得见
    const floorY = this.camY - this.halfViewH * 0.30

    for (const s of this.stars) {
      const m = s.member
      const over = age - m.exit
      if (over < 0) {
        s.sprite.visible = false
        s.label.visible = false
        s.labelMat.opacity = 0
        continue
      }
      s.sprite.visible = true

      const start = this.trailPoint(m, m.exit, new THREE.Vector3())
      start.y = Math.max(start.y, floorY)
      const t = clamp01(over / 1.6)
      const e = easeOutCubic(t)
      const rise = smoothstep(0, 0.25, t) // 起步时先"炸"一下

      const targetX = s.skyX
      const targetY = skyBase + s.skyY

      const swing = Math.sin(t * Math.PI) * 0.55 * (s.phase > 1 ? 1 : -1)

      s.sprite.position.x = THREE.MathUtils.lerp(start.x, targetX, e) + swing
      s.sprite.position.y = THREE.MathUtils.lerp(start.y, targetY, e)
      s.sprite.position.z = THREE.MathUtils.lerp(start.z, -1.2, e)

      const twinkle = 0.78 + Math.sin(this.elapsed * 1.7 + s.phase * 5.3) * 0.22
      const birth = smoothstep(0, 0.12, t)
      s.mat.opacity = twinkle * birth * (0.55 + 0.45 * rise)
      const pop = 1 + (1 - smoothstep(0, 0.3, t)) * 1.3
      const sz = (0.85 + e * 0.4 + Math.sin(this.elapsed * 2.3 + s.phase * 4) * 0.03) * pop
      s.sprite.scale.setScalar(sz)
      s.mat.color.copy(new THREE.Color(m.color).lerp(new THREE.Color('#ffffff'), 0.38))

      // 姓名：跟住星辰，等它升稳了再淡入（不跟着闪烁，免得看不清）
      const labelIn = smoothstep(0.22, 0.62, t)
      s.label.position.set(
        s.sprite.position.x,
        s.sprite.position.y - 0.78 - sz * 0.1,
        s.sprite.position.z
      )
      s.label.visible = labelIn > 0.01
      s.labelMat.opacity = labelIn * 0.92
    }
  }

  private checkEvents() {
    const a = this.prevAge
    const b = this.age
    if (b <= a) {
      this.prevAge = b
      return
    }
    for (const e of this.cfg.events) {
      const crossed = e.age > a && e.age <= b
      const atBirth = a === 0 && e.age === 0 && b > 0
      if (crossed || atBirth) this.onEvent?.(e)
    }
    this.prevAge = b
  }

  /* ---------------- 控制 ---------------- */

  setPlaying(v: boolean) {
    if (this.ended && v) {
      this.replay()
      return
    }
    this.playing = v
  }

  setSpeed(v: number) {
    this.speed = v
  }

  replay() {
    this.age = 0
    this.prevAge = 0
    this.startDelay = 0.8
    this.ended = false
    this.playing = true
    this.camY = BASE_Y + 4.6
    for (const v of this.visuals) v.alpha = 0
  }

  seek(age: number) {
    this.age = Math.max(0, Math.min(this.cfg.endAge, age))
    this.prevAge = this.age
    this.startDelay = 0
    this.ended = this.age >= this.cfg.endAge
    this.camY = this.solveCamY(BASE_Y + this.age * YEAR_SCALE)
  }

  /** 当前年龄始终落在画面垂直中心；开场时把 0 岁刻度压在画面下方 */
  private solveCamY(headY: number) {
    return Math.max(BASE_Y + 4.6, headY)
  }

  /** 换了一份配置：整棵 world 重建，播放进度归零 */
  rebuild(config: LifeConfig) {
    this.cfg = config
    this.clearWorld()
    this.visuals = []
    this.stars = []
    this.buildMembers()
    this.buildSkyStars()
    this.age = 0
    this.prevAge = 0
    this.startDelay = 0.8
    this.ended = false
    this.playing = true
    this.camY = BASE_Y + 4.6
    this.camera.position.set(0, this.camY, this.camDist)
    this.camera.lookAt(0, this.camY, 0)
  }

  /** 清空并释放 world 下的全部对象（共享贴图要留着） */
  private clearWorld() {
    const doomed: THREE.Object3D[] = []
    this.world.traverse((o) => doomed.push(o))
    for (const o of doomed) {
      const any = o as THREE.Mesh
      if (any.geometry) any.geometry.dispose()
      const mat = (o as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined
      const kill = (m: THREE.Material) => {
        const withMap = m as THREE.SpriteMaterial
        // glowTex / starTex 是共享的，文字贴图才是每个标签独有的
        if (withMap.map && withMap.map !== this.glowTex && withMap.map !== this.starTex) {
          withMap.map.dispose()
        }
        m.dispose()
      }
      if (Array.isArray(mat)) mat.forEach(kill)
      else if (mat) kill(mat)
    }
    this.world.clear()
  }

  dispose() {
    this.disposed = true
    cancelAnimationFrame(this.raf)
    this.scene.traverse((obj) => {
      const anyObj = obj as THREE.Mesh
      if (anyObj.geometry) anyObj.geometry.dispose()
      const mat = (anyObj as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined
      if (Array.isArray(mat)) mat.forEach((m) => m.dispose())
      else mat?.dispose()
    })
    this.glowTex.dispose()
    this.starTex.dispose()
    this.composer.dispose()
    this.renderer.dispose()
    if (this.renderer.domElement.parentElement === this.container) {
      this.container.removeChild(this.renderer.domElement)
    }
  }

  /** 预登记天穹（在构造函数之后由外部调用，也可内部调用） */
  private buildSkyStars() {
    for (const m of this.cfg.tracks) {
      if (m.fate !== 'die') continue
      const mat = new THREE.SpriteMaterial({
        map: this.starTex,
        color: new THREE.Color(m.color),
        transparent: true,
        depthWrite: false,
        depthTest: false,
        blending: THREE.AdditiveBlending,
        opacity: 0
      })
      const sprite = new THREE.Sprite(mat)
      sprite.scale.setScalar(1.0)
      sprite.visible = false
      sprite.renderOrder = 30
      this.world.add(sprite)

      // 逝者姓名：挂在星辰正下方，升天后才淡入
      // fontSize 给到 96：字号越大贴图分辨率越高，小字才不会糊成一团
      const label = createTextSprite(m.short || m.name, 0.32, {
        fontSize: 96,
        color: '#eef4ff',
        weight: 500,
        letterSpacing: 3,
        stroke: 'rgba(2,5,14,0.78)',
        strokeWidth: 13,
        glow: 'rgba(185,212,255,0.9)',
        glowBlur: 22
      })
      label.renderOrder = 31 // 压在星辰之上
      label.visible = false
      const labelMat = label.material as THREE.SpriteMaterial
      labelMat.opacity = 0
      this.world.add(label)

      this.stars.push({
        member: m,
        sprite,
        mat,
        label,
        labelMat,
        skyY: -0.28 + (this.stars.length % 4) * 0.2,
        skyX: m.x,
        phase: this.stars.length * 1.7
      })
    }
    this.layoutSkyStars()
  }

  /**
   * 天穹上的星星若直接沿用轨迹的 x，几个亲近的成员会挤成一团互相盖住
   * （发小与我差 0.85、朋友与奶奶只差 0.24，而星星直径就有 1.25）。
   * 保持左右次序不变（= 亲疏顺序不变），只把挤住的按最小间距推开；
   * 窄竖屏下展开后超出可见范围时，退化为在可用宽度内均匀铺开。
   */
  private layoutSkyStars() {
    const MIN_GAP = 1.5 // 星星直径 1.25 + 姓名标签的呼吸空间
    const sorted = [...this.stars].sort((a, b) => a.member.x - b.member.x)
    const n = sorted.length
    if (!n) return

    // 可用半宽：当前视口的可见半宽，再减掉星星自身半径的余量
    const aspect = (this.container.clientWidth || 1) / (this.container.clientHeight || 1)
    const halfVisible = this.halfViewH * Math.min(aspect, 2.2) - 0.85

    // 先按亲疏比例展开
    for (const s of sorted) s.skyX = s.member.x * 1.5
    for (let i = 1; i < n; i++) {
      const min = sorted[i - 1].skyX + MIN_GAP
      if (sorted[i].skyX < min) sorted[i].skyX = min
    }

    // 展开后超出可见范围（窄竖屏）→ 在可用宽度内均匀铺开，次序不变
    const maxAbs = Math.max(Math.abs(sorted[0].skyX), Math.abs(sorted[n - 1].skyX))
    if (maxAbs > halfVisible) {
      const gap = Math.min(MIN_GAP, (halfVisible * 2) / Math.max(1, n - 1))
      const mid = (n - 1) / 2
      sorted.forEach((s, i) => {
        s.skyX = (i - mid) * gap
      })
    }

    // 整体居中，免得偏向一侧
    const midX = (sorted[0].skyX + sorted[n - 1].skyX) / 2
    for (const s of sorted) s.skyX -= midX
  }
}
