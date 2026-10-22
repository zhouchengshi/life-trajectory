import * as THREE from 'three'

/** 柔和圆形光晕（白色，可用 sprite.material.color 着色） */
export function createGlowTexture(size = 128): THREE.Texture {
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')!
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
  g.addColorStop(0, 'rgba(255,255,255,1)')
  g.addColorStop(0.16, 'rgba(255,255,255,0.85)')
  g.addColorStop(0.38, 'rgba(255,255,255,0.26)')
  g.addColorStop(0.66, 'rgba(255,255,255,0.06)')
  g.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, size, size)
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

/** 带十字星芒的星点 */
export function createStarTexture(size = 128): THREE.Texture {
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')!
  const c = size / 2
  const g = ctx.createRadialGradient(c, c, 0, c, c, c)
  g.addColorStop(0, 'rgba(255,255,255,1)')
  g.addColorStop(0.1, 'rgba(255,255,255,0.7)')
  g.addColorStop(0.3, 'rgba(255,255,255,0.14)')
  g.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, size, size)

  // 十字光芒
  ctx.globalCompositeOperation = 'lighter'
  const drawSpike = (len: number, thick: number, alpha: number) => {
    const lg = ctx.createLinearGradient(c - len, c, c + len, c)
    lg.addColorStop(0, 'rgba(255,255,255,0)')
    lg.addColorStop(0.5, `rgba(255,255,255,${alpha})`)
    lg.addColorStop(1, 'rgba(255,255,255,0)')
    ctx.fillStyle = lg
    ctx.fillRect(c - len, c - thick / 2, len * 2, thick)
  }
  drawSpike(c * 0.92, size * 0.016, 0.85)
  ctx.save()
  ctx.translate(c, c)
  ctx.rotate(Math.PI / 2)
  ctx.translate(-c, -c)
  drawSpike(c * 0.92, size * 0.016, 0.85)
  ctx.restore()
  // 斜向短芒
  ctx.save()
  ctx.translate(c, c)
  ctx.rotate(Math.PI / 4)
  ctx.translate(-c, -c)
  drawSpike(c * 0.4, size * 0.012, 0.3)
  ctx.translate(c, c)
  ctx.rotate(Math.PI / 2)
  ctx.translate(-c, -c)
  drawSpike(c * 0.4, size * 0.012, 0.3)
  ctx.restore()

  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

export interface TextTexture {
  texture: THREE.Texture
  width: number
  height: number
}

/** 生成中文文字贴图（带辉光） */
export function createTextTexture(
  text: string,
  opts: {
    color?: string
    fontSize?: number
    weight?: number
    glow?: string
    glowBlur?: number
    opacity?: number
    letterSpacing?: number
    stroke?: string
    strokeWidth?: number
  } = {}
): TextTexture {
  const fontSize = opts.fontSize ?? 64
  const weight = opts.weight ?? 500
  const lineHeight = fontSize * 1.24
  const pad = fontSize * 0.3
  const dpr = 2
  const lines = text.split('\n')
  const family = '"PingFang SC","Microsoft YaHei","Noto Sans SC","Hiragino Sans GB",system-ui,sans-serif'
  const font = `${weight} ${fontSize}px ${family}`

  const measure = document.createElement('canvas').getContext('2d')!
  measure.font = font
  let maxW = 0
  for (const l of lines) maxW = Math.max(maxW, measure.measureText(l).width)
  const spacing = opts.letterSpacing ?? 0
  maxW += spacing * Math.max(0, lines[0].length - 1)

  const w = Math.ceil(maxW + pad * 2)
  const h = Math.ceil(lineHeight * lines.length + pad * 2)

  const canvas = document.createElement('canvas')
  canvas.width = Math.ceil(w * dpr)
  canvas.height = Math.ceil(h * dpr)
  const ctx = canvas.getContext('2d')!
  ctx.scale(dpr, dpr)
  ctx.font = font
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.globalAlpha = opts.opacity ?? 1
  ctx.shadowColor = opts.glow ?? 'rgba(160,200,255,0.95)'
  ctx.shadowBlur = opts.glowBlur ?? fontSize * 0.32
  ctx.fillStyle = opts.color ?? '#ffffff'

  const strokeStyle = opts.stroke ?? 'rgba(3,6,16,0.62)'
  const strokeW = opts.strokeWidth ?? fontSize * 0.14

  if (spacing) {
    // 逐字绘制以支持字距
    lines.forEach((line, i) => {
      const chars = [...line]
      const widths = chars.map((ch) => ctx.measureText(ch).width + spacing)
      const total = widths.reduce((a, b) => a + b, 0) - spacing
      let x = (w - total) / 2
      const y = pad + lineHeight * (i + 0.5)
      chars.forEach((ch, j) => {
        const cx = x + widths[j] / 2 - spacing / 2
        if (strokeStyle !== 'none') {
          ctx.lineWidth = strokeW
          ctx.strokeStyle = strokeStyle
          ctx.strokeText(ch, cx, y)
        }
        ctx.fillText(ch, cx, y)
        x += widths[j]
      })
    })
  } else {
    lines.forEach((line, i) => {
      const y = pad + lineHeight * (i + 0.5)
      if (strokeStyle !== 'none') {
        ctx.lineWidth = strokeW
        ctx.strokeStyle = strokeStyle
        ctx.strokeText(line, w / 2, y)
      }
      ctx.fillText(line, w / 2, y)
    })
  }

  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.needsUpdate = true
  return { texture, width: w, height: h }
}

/** 用文字贴图创建 Sprite。charHeight 为「一个字」在世界坐标中的高度 */
export function createTextSprite(
  text: string,
  charHeight: number,
  opts: Parameters<typeof createTextTexture>[1] = {}
): THREE.Sprite {
  const { texture, width, height } = createTextTexture(text, opts)
  const fs = opts.fontSize ?? 64
  const k = charHeight / fs
  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: THREE.NormalBlending
  })
  const sprite = new THREE.Sprite(material)
  sprite.scale.set(width * k, height * k, 1)
  sprite.renderOrder = 20
  return sprite
}
