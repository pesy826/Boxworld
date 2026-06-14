/**
 * 从头像聚合站「我要个性网」批量爬取中国风网络头像。
 * 该站本身就是头像分享下载站（用户上传供他人取用），有男生/女生分类。
 *
 * 用法：
 *   node scripts/crawl-avatars.mjs            # 默认男女各爬 5 个列表页（约各100+张）
 *   node scripts/crawl-avatars.mjs 10         # 各爬 10 页
 *   node scripts/crawl-avatars.mjs 5 120      # 各爬 5 页，每个性别最多存 120 张
 *
 * 下载到 public/builtin-assets/avatars/male|female/，完成后跑：
 *   node scripts/build-asset-manifest.mjs
 *
 * 注意：
 * - 站点结构可能变化，若解析不到图片会打印提示（可把列表页 URL 换成站内其他头像分类）
 * - 控制了请求频率（列表页间隔 800ms），别把页数开太大
 */
import { mkdirSync, writeFileSync, existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const AVATAR_DIR = join(process.cwd(), 'public', 'builtin-assets', 'avatars')
const MALE_DIR = join(AVATAR_DIR, 'male')
const FEMALE_DIR = join(AVATAR_DIR, 'female')
const ELDER_DIR = join(AVATAR_DIR, 'elder')
mkdirSync(MALE_DIR, { recursive: true })
mkdirSync(FEMALE_DIR, { recursive: true })
mkdirSync(ELDER_DIR, { recursive: true })

const PAGES = Math.min(parseInt(process.argv[2] || '5', 10), 30)
const MAX_PER_GENDER = parseInt(process.argv[3] || '150', 10)

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36'

/**
 * 分类配置：listUrl(page) 返回第 page 页地址（第 1 页无 index 后缀）。
 * 站内"男生/女生"分类本身就以动漫、卡通、猫猫狗狗、背影侧脸等网络风头像为主
 * （抖音/小红书用户的头像很多就来自这类聚合站），不是真人照片。
 * 想加别的分类（如卡通 /touxiang/katong/、情侣 /touxiang/qinglv/），照着加一项即可；
 * 无性别倾向的分类把 dir 指到 AVATAR_DIR 平级会缺标签，建议仍归到 male/female 之一或手动分。
 */
const CATEGORIES = [
  {
    gender: 'male',
    dir: MALE_DIR,
    prefix: 'wyg_m',
    listUrl: (p) => p === 1
      ? 'https://www.woyaogexing.com/touxiang/nan/'
      : `https://www.woyaogexing.com/touxiang/nan/index_${p}.html`,
  },
  {
    gender: 'female',
    dir: FEMALE_DIR,
    prefix: 'wyg_f',
    listUrl: (p) => p === 1
      ? 'https://www.woyaogexing.com/touxiang/nv/'
      : `https://www.woyaogexing.com/touxiang/nv/index_${p}.html`,
  },
  {
    // 长辈头像：风景分类（花草/山水/夕阳这类，正是中国长辈最常用的头像风格）
    gender: 'elder',
    dir: ELDER_DIR,
    prefix: 'wyg_e',
    listUrl: (p) => p === 1
      ? 'https://www.woyaogexing.com/touxiang/fengjing/'
      : `https://www.woyaogexing.com/touxiang/fengjing/index_${p}.html`,
  },
]

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function fetchText(url) {
  const res = await fetch(url, { headers: { 'User-Agent': UA, Referer: 'https://www.woyaogexing.com/' } })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.text()
}

/** 从列表页 HTML 提取头像图片 URL（站内 CDN img*.woyaogexing.com） */
function extractImageUrls(html) {
  const urls = new Set()
  // 匹配 src="//img2.woyaogexing.com/....jpeg!360x360" 这类缩略图（360px 足够做 256px 头像）
  const re = /(?:src|data-src)=["']((?:https?:)?\/\/img\d*\.woyaogexing\.com\/[^"'\s]+?\.(?:jpe?g|png|webp)(?:![\w\d]+)?)["']/gi
  let m
  while ((m = re.exec(html)) !== null) {
    let u = m[1]
    if (u.startsWith('//')) u = 'https:' + u
    urls.add(u)
  }
  return [...urls]
}

function extFromUrl(url) {
  const m = url.match(/\.(jpe?g|png|webp)/i)
  return m ? `.${m[1].toLowerCase().replace('jpeg', 'jpg')}` : '.jpg'
}

async function downloadImage(url, destPath) {
  if (existsSync(destPath)) return 'skip'
  const res = await fetch(url, { headers: { 'User-Agent': UA, Referer: 'https://www.woyaogexing.com/' } })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const buf = Buffer.from(await res.arrayBuffer())
  if (buf.length < 3000) throw new Error('文件过小，疑似无效')
  writeFileSync(destPath, buf)
  return 'ok'
}

async function batchDownload(items, concurrency = 6) {
  let ok = 0, skip = 0, fail = 0
  let i = 0
  async function worker() {
    while (i < items.length) {
      const t = items[i++]
      try {
        const r = await downloadImage(t.url, t.dest)
        if (r === 'skip') skip++
        else ok++
      } catch (e) {
        fail++
      }
    }
  }
  await Promise.all(Array.from({ length: concurrency }, worker))
  return { ok, skip, fail }
}

for (const cat of CATEGORIES) {
  console.log(`\n===== ${cat.gender}（${PAGES} 个列表页，上限 ${MAX_PER_GENDER} 张）=====`)
  const existing = readdirSync(cat.dir).length
  const allUrls = []

  for (let p = 1; p <= PAGES; p++) {
    const pageUrl = cat.listUrl(p)
    try {
      const html = await fetchText(pageUrl)
      const urls = extractImageUrls(html)
      console.log(`  列表页 ${p}：解析到 ${urls.length} 张图`)
      if (urls.length === 0 && p === 1) {
        console.log('  ⚠ 第一页就解析不到图片——站点结构可能变了，需要调整 extractImageUrls 的正则')
      }
      allUrls.push(...urls)
    } catch (e) {
      console.log(`  列表页 ${p} 抓取失败：${e.message}`)
    }
    await sleep(800)
    if (allUrls.length >= MAX_PER_GENDER) break
  }

  const unique = [...new Set(allUrls)].slice(0, MAX_PER_GENDER)
  const items = unique.map((url, idx) => ({
    url,
    dest: join(cat.dir, `${cat.prefix}${String(existing + idx).padStart(3, '0')}${extFromUrl(url)}`),
  }))

  console.log(`  开始下载 ${items.length} 张...`)
  const r = await batchDownload(items)
  console.log(`  完成：成功 ${r.ok}，跳过 ${r.skip}，失败 ${r.fail}`)
}

console.log('\n全部完成。下一步：node scripts/build-asset-manifest.mjs')