/**
 * 批量下载头像到 public/builtin-assets/avatars/male|female/
 * 用法：
 *   node scripts/download-avatars.mjs                 # 默认：真人风 100男+100女（randomuser.me）
 *   node scripts/download-avatars.mjs dicebear 50     # 插画风：DiceBear 各 50 张（数量可改，可无限）
 *   node scripts/download-avatars.mjs both 80         # 两种都下
 *
 * 来源说明：
 *   - randomuser.me：固定 100 男 + 100 女真人照片风头像（免费可商用于演示）
 *   - DiceBear（api.dicebear.com）：开源头像生成器，按 seed 无限生成；
 *     男用 adventurer 风格、女用 lorelei 风格（偏女性向插画）
 *
 * 下载完成后运行：node scripts/build-asset-manifest.mjs
 */
import { mkdirSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const AVATAR_DIR = join(process.cwd(), 'public', 'builtin-assets', 'avatars')
const MALE_DIR = join(AVATAR_DIR, 'male')
const FEMALE_DIR = join(AVATAR_DIR, 'female')
mkdirSync(MALE_DIR, { recursive: true })
mkdirSync(FEMALE_DIR, { recursive: true })

const mode = process.argv[2] || 'randomuser'   // randomuser | dicebear | both
const count = Math.min(parseInt(process.argv[3] || '100', 10), 500)

async function download(url, destPath) {
  if (existsSync(destPath)) return 'skip'
  const res = await fetch(url)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const buf = Buffer.from(await res.arrayBuffer())
  writeFileSync(destPath, buf)
  return 'ok'
}

async function batch(tasks, concurrency = 8) {
  let ok = 0, skip = 0, fail = 0
  let i = 0
  async function worker() {
    while (i < tasks.length) {
      const t = tasks[i++]
      try {
        const r = await download(t.url, t.dest)
        if (r === 'skip') skip++
        else ok++
      } catch (e) {
        fail++
        console.warn(`  ✗ ${t.dest.split(/[\\/]/).pop()}: ${e.message}`)
      }
    }
  }
  await Promise.all(Array.from({ length: concurrency }, worker))
  return { ok, skip, fail }
}

const tasks = []

if (mode === 'randomuser' || mode === 'both') {
  // randomuser.me 固定 0-99 共 100 张/性别
  const n = Math.min(count, 100)
  for (let i = 0; i < n; i++) {
    tasks.push({
      url: `https://randomuser.me/api/portraits/men/${i}.jpg`,
      dest: join(MALE_DIR, `photo_m${String(i).padStart(2, '0')}.jpg`),
    })
    tasks.push({
      url: `https://randomuser.me/api/portraits/women/${i}.jpg`,
      dest: join(FEMALE_DIR, `photo_f${String(i).padStart(2, '0')}.jpg`),
    })
  }
}

if (mode === 'dicebear' || mode === 'both') {
  // DiceBear：seed 任意字符串，无限生成。男 adventurer / 女 lorelei
  for (let i = 0; i < count; i++) {
    tasks.push({
      url: `https://api.dicebear.com/9.x/adventurer/png?seed=bw-male-${i}&size=256`,
      dest: join(MALE_DIR, `art_m${String(i).padStart(3, '0')}.png`),
    })
    tasks.push({
      url: `https://api.dicebear.com/9.x/lorelei/png?seed=bw-female-${i}&size=256`,
      dest: join(FEMALE_DIR, `art_f${String(i).padStart(3, '0')}.png`),
    })
  }
}

console.log(`开始下载 ${tasks.length} 张头像（mode=${mode}）...`)
const r = await batch(tasks)
console.log(`完成：成功 ${r.ok}，已存在跳过 ${r.skip}，失败 ${r.fail}`)
console.log('下一步：node scripts/build-asset-manifest.mjs')