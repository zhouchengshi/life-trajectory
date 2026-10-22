/** 星空背景：深空 + 星云 + 银河带 + 闪烁星点 */
export const skyVertexShader = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

export const skyFragmentShader = /* glsl */ `
  precision highp float;

  varying vec2 vUv;
  uniform float uTime;
  uniform float uScroll;
  uniform float uAspect;

  float hash21(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
  }

  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    float a = hash21(i);
    float b = hash21(i + vec2(1.0, 0.0));
    float c = hash21(i + vec2(0.0, 1.0));
    float d = hash21(i + vec2(1.0, 1.0));
    return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
  }

  float fbm(vec2 p) {
    float v = 0.0;
    float a = 0.5;
    for (int i = 0; i < 5; i++) {
      v += a * noise(p);
      p *= 2.03;
      a *= 0.5;
    }
    return v;
  }

  void main() {
    vec2 uv = vUv;
    vec2 p = vec2(uv.x * uAspect, uv.y);
    float t = uTime * 0.02;

    float n1 = fbm(p * 2.3 + vec2(0.0, uScroll * 0.30 + t));
    float n2 = fbm(p * 5.1 + vec2(uScroll * 0.16 - t * 1.4, n1 * 1.7));
    float cloud = smoothstep(0.30, 0.98, n1 * 0.62 + n2 * 0.58);

    vec3 deep   = vec3(0.006, 0.012, 0.036);
    vec3 haze   = vec3(0.038, 0.072, 0.190);
    vec3 glowC  = vec3(0.140, 0.220, 0.540);
    vec3 violet = vec3(0.080, 0.034, 0.150);

    // 星云要压得住：haze/glowC 一多就是一层灰白的雾，把线条全糊掉
    vec3 col = deep;
    col = mix(col, violet, smoothstep(0.45, 1.0, fbm(p * 1.2 + 11.0)) * 0.42);
    col = mix(col, haze, cloud * 0.34);
    col = mix(col, glowC, pow(cloud, 3.5) * 0.22);

    // 银河带
    float bandY = 0.80 + sin(uv.x * 2.6) * 0.055;
    float band = exp(-pow((uv.y - bandY) * 3.0, 2.0));
    col += glowC * band * 0.05 * (0.55 + 0.45 * cloud);

    // 星点
    vec2 sp = vec2(uv.x * uAspect, uv.y) * 210.0;
    vec2 id = floor(sp);
    vec2 gv = fract(sp) - 0.5;
    float h = hash21(id);
    float mask = pow(smoothstep(0.990, 1.0, h), 2.0);
    float tw = 0.55 + 0.45 * sin(uTime * (0.6 + h * 2.2) + h * 31.0);
    float star = smoothstep(0.34, 0.0, length(gv)) * tw * mask * 2.6;
    col += vec3(0.82, 0.90, 1.0) * star;

    // 暗角
    vec2 vc = uv - 0.5;
    float vig = smoothstep(1.0, 0.22, length(vc * vec2(uAspect * 0.75, 1.0)));
    col *= 0.38 + 0.62 * vig;

    // 底部一点冷光，托住轨迹的起点
    col += vec3(0.035, 0.065, 0.150) * smoothstep(0.32, 0.0, uv.y) * 0.32;

    gl_FragColor = vec4(col, 1.0);
  }
`

/** 生命轨迹：沿管线的渐变光带，头部高亮。年龄直接由顶点高度反推，永远与星球同步 */
export const trailVertexShader = /* glsl */ `
  varying float vAge;
  uniform float uBaseY;
  uniform float uYearScale;
  void main() {
    vAge = (position.y - uBaseY) / uYearScale;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

export const trailFragmentShader = /* glsl */ `
  precision highp float;

  varying float vAge;

  uniform float uHead;      // 当前播放到的年龄
  uniform float uEnter;     // 进入生命的年龄
  uniform float uAlpha;     // 整体透明度（退场时淡出）
  uniform float uGlow;      // 亮度系数
  uniform float uFade;      // 0 = 仍在世，1 = 已离世（褪成记忆的冷色）
  uniform vec3  uColor;     // 身体颜色
  uniform vec3  uHeadColor; // 头部颜色

  void main() {
    float age = vAge;

    // 还没走到的地方不画
    if (age > uHead) discard;

    // 进入生命时缓缓显形
    float appear = smoothstep(uEnter - 0.6, uEnter + 3.2, age);

    // body 是轨迹"线身"的亮度：靠它把线从背景里拉出来，太高一叠加又糊白
    float d = uHead - age;
    float head = exp(-d * d / 1.15);
    float body = 0.36;
    float intensity = body + head * 1.35;

    // 起点收束淡入
    intensity *= smoothstep(0.0, 1.8, age + 0.001);

    vec3 col = mix(uColor, uHeadColor, clamp(head * 1.25, 0.0, 1.0));
    col = mix(col, vec3(0.40, 0.50, 0.72), uFade * 0.85);
    float a = appear * uAlpha;

    gl_FragColor = vec4(col * intensity * uGlow, a);
  }
`

/** 已故者化作的星辰（升入天穹） */
export const starVertexShader = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

export const starFragmentShader = /* glsl */ `
  precision highp float;
  varying vec2 vUv;
  uniform vec3 uColor;
  uniform float uIntensity;
  void main() {
    vec2 d = vUv - 0.5;
    float r = length(d);
    float core = smoothstep(0.16, 0.0, r);
    float halo = smoothstep(0.5, 0.0, r) * 0.35;
    float a = (core + halo) * uIntensity;
    gl_FragColor = vec4(uColor * (core * 2.2 + halo * 1.4), a);
  }
`
