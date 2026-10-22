/**
 * 人生轨迹 · 角色数据
 *
 * 所有 age 都以「我」的年龄为坐标系（单位：岁）。
 *
 * 轨迹的四种走法：
 *   root      —— 我，一生的轴线
 *   family    —— 直系亲属，从小就在，一路平行，横向距离 = 亲疏
 *   approach  —— 后来才出现的亲人（妻子、孩子、岳父母），从远处靠近，然后并排走下去
 *   cross     —— 其他关系：在合适的年纪从远处出现，与我相交，然后各自远离
 *
 * x        —— 直系 / 靠近后的固定横向位置（0 表示贴合我，数值越大越疏远）
 * entryX   —— 出现时的横向位置（远处）
 * peakX    —— 相交 / 靠近最深时的横向位置
 * exitX    —— 远去后的横向位置（cross 用）
 * peakAge  —— 相交发生的年龄
 * enter    —— 进入我生命的年龄
 * exit     —— 退场年龄（家庭成员为离世，其他关系为散场）
 * fate     —— die: 化作星辰升到天穹 / fade: 缘分散场 / alive: 生命延续
 *
 * 相交线的斜率约定：横向移动量 / (年龄跨度 × 0.44) 控制在 2 以内，
 * 否则线条会变成水平横杠，看不出「靠近」的过程。
 */

export const YEAR_SCALE = 0.44 // 每一年对应的世界单位高度
export const BASE_Y = 2.2 // 出生所在的基线高度
export const END_AGE = 97.5 // 主时间线终点（妻子离世后，等她走进星群）
export const MAX_AGE = 100 // 时间轴刻度上限

export type Kind = 'root' | 'family' | 'approach' | 'cross'

export interface Member {
  id: string
  name: string
  tag?: string
  short?: string
  kind: Kind
  x: number
  entryX?: number
  peakX?: number
  exitX?: number
  peakAge?: number
  enter: number
  exit: number
  fate: 'die' | 'fade' | 'alive'
  color: string
  phase: number
  anonymous?: boolean // 不标注的过客线
  note?: string
}

/** 我 + 直系亲属 + 后来加入的亲人 */
export const members: Member[] = [
  {
    id: 'me',
    name: '我',
    tag: '主角',
    kind: 'root',
    x: 0,
    enter: 0,
    exit: 88,
    fate: 'die',
    color: '#ffd9a0',
    phase: 0.4,
    note: '一生的轴线'
  },
  {
    id: 'father',
    name: '爸爸',
    tag: '父亲',
    kind: 'family',
    x: -2.0,
    enter: 0,
    exit: 45,
    fate: 'die',
    color: '#6fa8ff',
    phase: 1.2
  },
  {
    id: 'mother',
    name: '妈妈',
    tag: '母亲',
    kind: 'family',
    x: 2.15,
    enter: 0,
    exit: 52,
    fate: 'die',
    color: '#ff8a6b',
    phase: 4.2
  },
  {
    id: 'grandpa',
    name: '爷爷',
    tag: '祖辈',
    kind: 'family',
    x: -3.2,
    enter: 0,
    exit: 12,
    fate: 'die',
    color: '#9b8bff',
    phase: 5.1
  },
  {
    id: 'grandma',
    name: '奶奶',
    tag: '祖辈',
    kind: 'family',
    x: 3.35,
    enter: 0,
    exit: 18,
    fate: 'die',
    color: '#78d8ff',
    phase: 0.9
  },
  {
    id: 'wife',
    name: '妻子',
    tag: '伴侣',
    kind: 'approach',
    x: 1.05,
    entryX: 3.2,
    peakAge: 30,
    enter: 26,
    exit: 96,
    fate: 'die',
    color: '#ff7bc6',
    phase: 2.1,
    note: '最后陪着你的人，也最先抱住你'
  },
  {
    id: 'child',
    name: '孩子',
    tag: '延续',
    kind: 'approach',
    x: -0.78,
    entryX: 0.05,
    peakAge: 46,
    enter: 32,
    exit: 100,
    fate: 'alive',
    color: '#8ffbd4',
    phase: 3.4,
    note: '唯一不会升天的轨迹'
  },
  {
    id: 'fatherInLaw',
    name: '岳父',
    tag: '姻亲',
    kind: 'approach',
    x: -4.5,
    entryX: -6.0,
    peakAge: 33,
    enter: 26,
    exit: 51,
    fate: 'die',
    color: '#7f96e8',
    phase: 2.8
  },
  {
    id: 'motherInLaw',
    name: '岳母',
    tag: '姻亲',
    kind: 'approach',
    x: 4.65,
    entryX: 6.4,
    peakAge: 33,
    enter: 26,
    exit: 72,
    fate: 'die',
    color: '#ffa8b8',
    phase: 3.9
  },

  /* ---- 相交线：出现 → 相交 → 远离 ---- */
  {
    id: 'bestie',
    name: '发小',
    tag: '旧友',
    kind: 'cross',
    x: -0.9,
    entryX: -6.7,
    peakX: -0.9,
    exitX: -6.2,
    peakAge: 11,
    enter: 0,
    exit: 70,
    // 非直系：缘分散场即淡出，不升入天穹
    fate: 'fade',
    color: '#7effc4',
    phase: 1.7
  },
  {
    id: 'firstLove',
    name: '初恋',
    tag: '错过',
    kind: 'cross',
    x: 0.35,
    entryX: 2.4,
    peakX: 0.35,
    exitX: -3.4,
    peakAge: 20,
    enter: 16.5,
    exit: 25,
    fate: 'fade',
    color: '#ff6e9c',
    phase: 6.0,
    note: '曾经离得最近的那条线'
  },
  {
    id: 'kindergarten',
    name: '幼儿园同学',
    short: '幼儿园',
    tag: '同窗',
    kind: 'cross',
    x: -1.9,
    entryX: -4.3,
    peakX: -1.9,
    exitX: -6.6,
    peakAge: 5.5,
    enter: 2.5,
    exit: 11,
    fate: 'fade',
    color: '#c4a8ff',
    phase: 0.2
  },
  {
    id: 'primary',
    name: '小学同学',
    short: '小学',
    tag: '同窗',
    kind: 'cross',
    x: -1.5,
    entryX: -3.9,
    peakX: -1.5,
    exitX: -7.0,
    peakAge: 10,
    enter: 7,
    exit: 17,
    fate: 'fade',
    color: '#8fa8ff',
    phase: 1.4
  },
  {
    id: 'middle',
    name: '初中同学',
    short: '初中',
    tag: '同窗',
    kind: 'cross',
    x: 2.2,
    entryX: 4.2,
    peakX: 2.2,
    exitX: 7.3,
    peakAge: 15.5,
    enter: 13,
    exit: 22,
    fate: 'fade',
    color: '#6be0ff',
    phase: 2.6
  },
  {
    id: 'high',
    name: '高中同学',
    short: '高中',
    tag: '同窗',
    kind: 'cross',
    x: 2.6,
    entryX: 4.2,
    peakX: 2.6,
    exitX: -4.5,
    peakAge: 18,
    enter: 16,
    exit: 27,
    fate: 'fade',
    color: '#8fffd4',
    phase: 3.1
  },
  {
    id: 'college',
    name: '大学同学',
    short: '大学',
    tag: '同窗',
    kind: 'cross',
    x: 4.6,
    entryX: 6.2,
    peakX: 4.6,
    exitX: 10.1,
    peakAge: 21.5,
    enter: 19,
    exit: 29,
    fate: 'fade',
    color: '#c79bff',
    phase: 4.4
  },
  {
    id: 'friend',
    name: '朋友',
    tag: '同道',
    kind: 'cross',
    x: 3.6,
    entryX: 7.3,
    peakX: 3.6,
    exitX: 8.7,
    peakAge: 34,
    enter: 20,
    exit: 80,
    // 非直系：缘分散场即淡出，不升入天穹
    fate: 'fade',
    color: '#ffc46b',
    phase: 4.7
  },
  {
    id: 'colleague',
    name: '同事',
    tag: '职场',
    kind: 'cross',
    x: 5.5,
    entryX: 8.9,
    peakX: 5.5,
    exitX: 9.2,
    peakAge: 36,
    enter: 23,
    exit: 60,
    fate: 'fade',
    color: '#8fc8ff',
    phase: 5.6
  }
]

/**
 * 不标注的过客：有些人只陪你走一小段，后来连名字都想不起来
 * 全是 cross —— 出现、相交、然后消失在人群里
 */
export const passersBy: Member[] = [
  { id: 'p1', name: '', kind: 'cross', x: -2.6, entryX: -5.4, peakX: -2.6, exitX: -6.1, peakAge: 9, enter: 5, exit: 14, fate: 'fade', color: '#7f9fd8', phase: 0.7, anonymous: true },
  { id: 'p2', name: '', kind: 'cross', x: 2.3, entryX: 5.0, peakX: 2.3, exitX: 5.6, peakAge: 25, enter: 21, exit: 31, fate: 'fade', color: '#6fa7c8', phase: 2.3, anonymous: true },
  { id: 'p3', name: '', kind: 'cross', x: -2.5, entryX: -5.2, peakX: -2.5, exitX: -5.9, peakAge: 31, enter: 27, exit: 38, fate: 'fade', color: '#8f8fd8', phase: 3.1, anonymous: true },
  { id: 'p4', name: '', kind: 'cross', x: 2.4, entryX: 5.2, peakX: 2.4, exitX: 5.8, peakAge: 42, enter: 38, exit: 49, fate: 'fade', color: '#6fc0b8', phase: 1.1, anonymous: true },
  { id: 'p5', name: '', kind: 'cross', x: -2.3, entryX: -5.0, peakX: -2.3, exitX: -5.7, peakAge: 17, enter: 13, exit: 23, fate: 'fade', color: '#a08fd0', phase: 4.6, anonymous: true },
  { id: 'p6', name: '', kind: 'cross', x: 3.5, entryX: 6.6, peakX: 3.5, exitX: 7.0, peakAge: 55, enter: 50, exit: 63, fate: 'fade', color: '#7f9fc8', phase: 5.9, anonymous: true },
  { id: 'p7', name: '', kind: 'cross', x: -3.1, entryX: -6.0, peakX: -3.1, exitX: -6.6, peakAge: 63, enter: 58, exit: 71, fate: 'fade', color: '#9f8fc0', phase: 2.0, anonymous: true },
  { id: 'p8', name: '', kind: 'cross', x: 2.5, entryX: 5.4, peakX: 2.5, exitX: 6.0, peakAge: 71, enter: 66, exit: 78, fate: 'fade', color: '#6fa8b8', phase: 3.7, anonymous: true },
  { id: 'p9', name: '', kind: 'cross', x: -2.6, entryX: -5.3, peakX: -2.6, exitX: -6.0, peakAge: 47, enter: 43, exit: 54, fate: 'fade', color: '#8898d0', phase: 0.4, anonymous: true },
  { id: 'p10', name: '', kind: 'cross', x: 2.1, entryX: 4.7, peakX: 2.1, exitX: 5.3, peakAge: 13, enter: 10, exit: 19, fate: 'fade', color: '#78b0c8', phase: 5.2, anonymous: true },
  { id: 'p11', name: '', kind: 'cross', x: -2.0, entryX: -4.5, peakX: -2.0, exitX: -5.1, peakAge: 79, enter: 74, exit: 86, fate: 'fade', color: '#9a92c8', phase: 1.8, anonymous: true },
  { id: 'p12', name: '', kind: 'cross', x: 2.7, entryX: 5.7, peakX: 2.7, exitX: 6.3, peakAge: 37, enter: 33, exit: 44, fate: 'fade', color: '#6f9fb0', phase: 4.1, anonymous: true }
]

/** 全部轨迹（含不标注的过客） */
export const allTracks: Member[] = [...members, ...passersBy]

/** 人生关键节点（用于 HUD 字幕） */
export const events: { age: number; text: string; sub?: string }[] = [
  { age: 0, text: '我出生了', sub: '所有的线，从这里开始' },
  { age: 3, text: '第一天上幼儿园', sub: '第一次离开家' },
  { age: 7, text: '背上书包，上小学', sub: '世界变大了' },
  { age: 12, text: '爷爷走了', sub: '第一次知道什么叫永别' },
  { age: 13, text: '初中，开始有秘密', sub: '' },
  { age: 16, text: '高中，题做到深夜', sub: '' },
  { age: 17, text: '遇见初恋', sub: '心跳第一次不属于自己' },
  { age: 18, text: '奶奶走了', sub: '' },
  { age: 19, text: '大学，离家很远', sub: '' },
  { age: 22, text: '初恋散场', sub: '有些线，是断的' },
  { age: 23, text: '第一份工作', sub: '开始用自己的名字签字' },
  { age: 26, text: '遇见她', sub: '两条线开始并排走' },
  { age: 27, text: '结婚', sub: '' },
  { age: 32, text: '孩子出生', sub: '一条新的线，从你这里出发' },
  { age: 45, text: '爸爸走了', sub: '替你挡风的人，先走了' },
  { age: 51, text: '岳父走了', sub: '' },
  { age: 52, text: '妈妈走了', sub: '家里的灯，灭了一盏' },
  { age: 60, text: '退休了', sub: '同事那条线，淡了下去' },
  { age: 70, text: '发小走了', sub: '再没人喊你的小名' },
  { age: 72, text: '岳母走了', sub: '' },
  { age: 80, text: '朋友走了', sub: '' },
  { age: 88, text: '我走了', sub: '轨迹停住，星光升起' },
  { age: 96, text: '妻子走了', sub: '最后一条线，也升上了天' }
]

/** 结尾字幕 */
export const ENDING_TEXT = '这就是人的一生吧'
