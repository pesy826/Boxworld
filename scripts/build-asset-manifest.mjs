/**
 * 扫描 public/builtin-assets/ 下的素材，生成 manifest.json。
 * 用法：node scripts/build-asset-manifest.mjs
 *
 * 目录约定：
 *   public/builtin-assets/stickers/   表情包（文件名即描述，支持 ChineseBQB 命名自动清洗）
 *   public/builtin-assets/avatars/male/     男性头像
 *   public/builtin-assets/avatars/female/   女性头像
 *   public/builtin-assets/avatars/elder/         长辈头像（风景/花草等，无性别）
 *   public/builtin-assets/avatars/elder_male/    长辈男头像
 *   public/builtin-assets/avatars/elder_female/  长辈女头像
 *   public/builtin-assets/avatars/          （根目录散放的头像无标签）
 *
 * 表情描述清洗规则（ChineseBQB 文件名形如「滑稽大佬00001-360度鄙视你.gif」）：
 *   1. 去扩展名
 *   2. 去掉「系列名 + 4位以上数字 + 连字符」前缀 → 「360度鄙视你」
 *   3. 多别名（「打不着-打不到」）保留原样——findByDesc 双向包含匹配能命中任一别名
 *   4. 同描述去重（保留先扫描到的）
 *
 * 大小提醒：内置导入不走压缩（保留 GIF 动画），>400KB 的文件会警告（仍会收录），
 * 建议手动剔除特别大的（IndexedDB 体积考虑）。
 *
 * 注意：avatars 子目录里的文件会被移动到 avatars/ 平级并加前缀（manifest 记录文件名 + tags）。
 */
import { readdirSync, statSync, writeFileSync, existsSync, renameSync } from 'node:fs'
import { join, extname, basename } from 'node:path'

const ROOT = join(process.cwd(), 'public', 'builtin-assets')
const STICKER_DIR = join(ROOT, 'stickers')
const AVATAR_DIR = join(ROOT, 'avatars')

const IMG_EXTS = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp'])
const SIZE_WARN_BYTES = 400 * 1024

function listImages(dir) {
  if (!existsSync(dir)) return []
  return readdirSync(dir).filter((f) => {
    const p = join(dir, f)
    return statSync(p).isFile() && IMG_EXTS.has(extname(f).toLowerCase())
  })
}

/** 清洗表情描述（去系列前缀/编号，保留语义部分） */
function cleanStickerDesc(filename) {
  let desc = basename(filename, extname(filename)).trim()

  // ChineseBQB 格式：系列名 + 编号(4位以上数字) + 连字符 + 含义
  // 例：「滑稽大佬00001-360度鄙视你」→「360度鄙视你」
  const bqb = desc.match(/^.*?\d{4,}\s*[-_—]\s*(.+)$/)
  if (bqb && bqb[1].trim()) {
    desc = bqb[1].trim()
  } else {
    // 纯编号开头（「000000001」之类）没有语义，原样保留让人工处理
    // 一般格式：去掉开头独立的编号段「123-xxx」
    const numPrefix = desc.match(/^\d{3,}\s*[-_—]\s*(.+)$/)
    if (numPrefix && numPrefix[1].trim()) desc = numPrefix[1].trim()
  }

  // 全下划线转空格、压缩连续空白
  desc = desc.replace(/_/g, ' ').replace(/\s+/g, ' ').trim()
  return desc
}

// ===== 表情包 =====
const stickers = []
const seenDescs = new Set()
const dupSkipped = []
const sizeWarned = []
const noMeaning = []

for (const file of listImages(STICKER_DIR)) {
  const desc = cleanStickerDesc(file)

  // 纯数字/空描述：无语义，跳过并提醒（这类文件名对 AI 没用）
  if (!desc || /^\d+$/.test(desc)) {
    noMeaning.push(file)
    continue
  }

  if (seenDescs.has(desc)) {
    dupSkipped.push(`${file} → 「${desc}」已存在`)
    continue
  }
  seenDescs.add(desc)

  const size = statSync(join(STICKER_DIR, file)).size
  if (size > SIZE_WARN_BYTES) {
    sizeWarned.push(`${file}（${Math.round(size / 1024)}KB）`)
  }

  stickers.push({ file, desc })
}

// ===== 头像（含 male/female 子目录，移动到平级并加前缀） =====
const avatars = []

/**
 * 从文件名前缀推断标签。
 * 兼容两种来源：
 *   - 子目录移动后加的前缀：male_xxx / female_xxx / elder_male_xxx ...
 *   - 爬虫直接下到根目录的带前缀文件：male_wyg_m001.jpg / female_wyg_f000.jpg / elder_wyg_e001.jpg
 * 注意顺序：先判更长的 elder_male_ / elder_female_，再判 elder_ / male_ / female_。
 */
function tagsFromFilename(file) {
  const f = file.toLowerCase()
  if (f.startsWith('elder_male_') || f.startsWith('elder_male')) return ['长辈', '男']
  if (f.startsWith('elder_female_') || f.startsWith('elder_female')) return ['长辈', '女']
  if (f.startsWith('male_')) return ['男']
  if (f.startsWith('female_')) return ['女']
  if (f.startsWith('elder_')) return ['长辈']
  return []
}

// 根目录散放的：按文件名前缀推断标签（兼容已带前缀的爬虫文件）
for (const file of listImages(AVATAR_DIR)) {
  avatars.push({ file, tags: tagsFromFilename(file) })
}

// 子目录 → 标签映射
const TAG_DIRS = {
  male: ['男'],
  female: ['女'],
  elder: ['长辈'],
  elder_male: ['长辈', '男'],
  elder_female: ['长辈', '女'],
}
for (const [sub, tags] of Object.entries(TAG_DIRS)) {
  const subDir = join(AVATAR_DIR, sub)
  if (!existsSync(subDir)) continue
  for (const file of listImages(subDir)) {
    // 移动到 avatars/ 平级，加前缀避免重名
    const newName = `${sub}_${file}`
    renameSync(join(subDir, file), join(AVATAR_DIR, newName))
    avatars.push({ file: newName, tags })
  }
}

const manifest = {
  version: Date.now(), // 用时间戳做版本号，每次重新生成都会触发增量导入
  stickers,
  avatars,
}

writeFileSync(join(ROOT, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf-8')

console.log(`manifest.json 已生成：表情 ${stickers.length} 个，头像 ${avatars.length} 张，version=${manifest.version}`)
if (noMeaning.length > 0) {
  console.log(`\n⚠ ${noMeaning.length} 个表情文件名无语义（纯编号），已跳过：`)
  noMeaning.slice(0, 10).forEach((f) => console.log(`  - ${f}`))
  if (noMeaning.length > 10) console.log(`  ...等 ${noMeaning.length} 个`)
}
if (dupSkipped.length > 0) {
  console.log(`\n⚠ ${dupSkipped.length} 个表情描述重复，已跳过：`)
  dupSkipped.slice(0, 10).forEach((f) => console.log(`  - ${f}`))
  if (dupSkipped.length > 10) console.log(`  ...等 ${dupSkipped.length} 个`)
}
if (sizeWarned.length > 0) {
  console.log(`\n⚠ ${sizeWarned.length} 个表情超过 400KB（仍已收录，建议剔除过大的以控制存储体积）：`)
  sizeWarned.slice(0, 10).forEach((f) => console.log(`  - ${f}`))
  if (sizeWarned.length > 10) console.log(`  ...等 ${sizeWarned.length} 个`)
}