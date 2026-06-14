/**
 * NPC 头像分配的标签工具：
 * - AI 输出的 gender 五花八门（"男"/"男性"/"male"/"man"/"女生"...），必须归一化成头像库的"男"/"女"标签
 * - 长辈角色（爸妈爷奶等）配动漫/猫狗头像很违和，识别后优先分配"长辈"标签头像（风景/花草类）
 */

/** 归一化性别为头像库标签："男" | "女" | undefined */
export function normalizeGender(raw?: string): '男' | '女' | undefined {
  if (!raw) return undefined
  const g = raw.trim().toLowerCase()
  if (/female|woman|girl|女/.test(g)) return '女'
  if (/male|man|boy|男/.test(g)) return '男'
  return undefined
}

/** 常见女性用字（中文名常用）；男性默认兜底，所以只列女性偏向字 */
const FEMALE_NAME_CHARS = '娟婷婉娜妍丽莉梅兰芳燕妮玲珍秀芬芳琴媛娥蓉淑慧颖雅琳菲莹露瑶璐萍洁霞茜蕾娅妙姿婵嫣妃妤媚柔妍娣姗茗薇芙蓉芸荷莺莲翠桂菊蕊妹姐姑娘母后妃嬛甄'
/** 常见男性用字 */
const MALE_NAME_CHARS = '伟刚强军勇涛斌波辉健杰峰磊鹏宇浩凯轩昊霖渊柏松岩岳钢铁雄豪龙虎彪威猛烈骏骁鑫栋梁柱钧锋钊'

/** 从名字末字粗略猜性别（兜底，名字最后一个字最能体现性别倾向） */
function guessGenderByName(name: string): '男' | '女' | undefined {
  if (!name) return undefined
  // 去掉姓（取后两字里判断；中文名性别多体现在名而非姓）
  const chars = name.trim()
  for (const ch of chars) {
    if (FEMALE_NAME_CHARS.includes(ch)) return '女'
  }
  for (const ch of chars) {
    if (MALE_NAME_CHARS.includes(ch)) return '男'
  }
  return undefined
}

/** 女性称谓/字眼（名字+关系+描述里出现即可推断） */
const FEMALE_RE = /婶|姨|妈|母|娘|奶|姥|婆|姐|妹|嫂|媳|阿姊|姑|夫人|太太|女士|小姐|女孩|女生|女人|她/
/** 男性称谓/字眼 */
const MALE_RE = /叔|伯|爸|父|爷|公公|哥|弟|兄|侄子|舅|先生|大爷|老头|男孩|男生|男人|小伙|他(?!们)/

/**
 * AI 没给 gender 时，从名字/关系/描述文本推断性别（"钱婶"→女、"张叔"→男）。
 * 女性字眼优先判（"老板娘"含"娘"；很多女性称谓不会和男性字眼混出现）。
 */
export function inferGenderFromText(text: string): '男' | '女' | undefined {
  if (!text) return undefined
  const hasF = FEMALE_RE.test(text)
  const hasM = MALE_RE.test(text)
  if (hasF && !hasM) return '女'
  if (hasM && !hasF) return '男'
  if (hasF && hasM) {
    // 两边都命中时，比较首次出现位置（名字在前，更可信）
    const fi = text.search(FEMALE_RE)
    const mi = text.search(MALE_RE)
    return fi <= mi ? '女' : '男'
  }
  // 称谓字眼都没有时，用名字末字兜底（text 通常以名字开头）
  return guessGenderByName(text)
}

/** 年轻角色关键词（学生/年轻/青年等）；命中则倾向非长辈头像 */
const YOUNG_RE = /学生|大学生|研究生|高中生|初中生|小学生|年轻|青年|少年|少女|小伙|小姑娘|后生|新人|实习|应届|刚毕业|二十.{0,2}岁|十.岁|岁的(?:男|女|青年|学生)/

/** 是否年轻角色（用于优先分配非长辈头像） */
export function detectYoung(text: string): boolean {
  return YOUNG_RE.test(text || '')
}

/** 长辈关键词（出现在关系/描述里则视为长辈角色） */
const ELDER_RE = /爸|妈|父|母|爷|奶|姥|外公|外婆|叔|姨|舅|伯|婶|姑|岳父|岳母|长辈|老人|老太|老头|大爷|大妈|师父|师傅|老板娘|房东/

export function detectElder(text: string): boolean {
  return ELDER_RE.test(text || '')
}

/**
 * 构建头像分配的优先级标签组（供 takeAvatar 使用）。
 * 每个元素是一个 AND 组（数组内标签需全部命中），按顺序降级。
 * - 长辈：优先长辈头像（不分男女，库里长辈头像多为风景/花草，性别不敏感）
 * - 年轻/普通：优先该性别头像
 * 返回的最后一项若是纯性别组，takeAvatar 会把它当作"性别底线"——
 * 宁可不分配也不跨性别（避免男角色配到女头像）。
 */
export function buildAvatarPreference(
  gender?: '男' | '女',
  isElder?: boolean,
  isYoung?: boolean,
): string[][] {
  const prefs: string[][] = []
  if (isElder) {
    if (gender) prefs.push(['长辈', gender])
    prefs.push(['长辈'])
    // 长辈仍带性别底线
    if (gender) prefs.push([gender])
    return prefs
  }
  if (gender) prefs.push([gender])
  // isYoung 暂无独立"青年"标签可用；性别组已是最优先，库扩充青年标签后可在此插入 [gender,'青年']
  void isYoung
  return prefs
}
