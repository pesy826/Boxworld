# 盒世界（BoxWorld）项目开发文档总结

> 本文档用于上下文交接，记录项目全貌、架构约定、当前进度与待办事项。
> 最后更新：2026-06-13（全面核查版：ComfyUI 文生图、角色/朋友圈发图、群聊双模式、安卓打包均已实装）

---

## 一、项目概况

**盒世界（BoxWorld）** 是一个微信界面风格的 AI 角色聊天应用，灵感来自 SillyTavern（酒馆），但核心差异是：

- **微信 IM 形态**：角色以第一人称、多条短消息的方式聊天（非小说式长文）
- **角色有"生命感"**：基于虚拟时间系统，角色会主动发消息、发朋友圈、评论互动
- **双形态共存**：微信模式（IM）+ 场景模式（线下见面的传统 RP，支持流式输出）
- **兼容酒馆生态**：可导入 SillyTavern 角色卡（PNG/JSON），支持世界书、预设系统

**技术栈**：React + TypeScript + Vite（v8/rolldown）+ TailwindCSS + Dexie(IndexedDB) + Zustand + Tauri 2（桌面/安卓打包）

**部署形态**：纯前端应用，无后端。已成功打包 **Windows 桌面版（Tauri，msi + nsis 安装包，产物在 `src-tauri/target/release/bundle/`）** 与 **安卓 apk**（环境 JDK17 + Android Studio + NDK + Rust 安卓四架构目标；release 签名已配 `boxworld.keystore` + `keystore.properties`）。GitHub 公开仓库。

**Tauri 配置**（src-tauri）：Tauri 2.11，identifier `com.boxworld.app`，桌面窗口标题"盒世界" 1000×800。依赖插件：`tauri-plugin-http`（features `unsafe-headers`，给 ComfyUI 跨域 HTTP 请求用）、`tauri-plugin-log`。安卓 `build.gradle.kts`：minSdk 24 / targetSdk 36 / compileSdk 36，release 走 minify + 签名，debug 加 `.debug` 后缀且允许明文流量。

---

## 二、核心架构与关键模块

### 1. 数据层（Dexie / IndexedDB，当前 schema v11）

| 表 | 用途 |
|---|---|
| characters | 角色（主卡 + NPC 共用，靠 isNpc/parentWorldId 区分；isContact 区分好友/仅群内 NPC） |
| chats / messages | 会话与消息（messages 有 sequence 排序键 + batchId 批次 + senderId 群发言人） |
| moments / momentComments | 朋友圈及评论（含 visibility 可见范围） |
| lorebooks / lorebookEntries | 世界书 |
| presets | 预设（im / scene / utility 三种 mode） |
| sceneSummaries | 场景模式剧情摘要（每 chat 一份，角色第一人称回忆） |
| worldSummaries | 单卡世界统一事件记忆（每世界一份，含 scannedSeq 增量扫描位置） |
| momentSummaries | 朋友圈摘要 |
| tickLogs | 补算日志 |
| stickers | 表情包素材（v11 新增：id, desc, image base64, createdAt） |
| avatarLibrary | 头像库（v11 新增：id, image, tags, usedBy, createdAt） |
| settings | 全局设置（单例） |

### 2. 关键服务

- **timeService**：虚拟时间核心。全局时间 + 每卡独立时间线（`nowForCharacter`）+ 锁定判断（`isLocked`）。NPC 时间跟随所属世界主卡
- **tickService（补算心跳）**：角色主动行为调度中枢。流程：图片解析 → 朋友圈摘要 → 世界记忆更新 → 启发式过滤 → AI 粗筛（辅助模型 batch）→ 深思（主模型逐角色）
- **thinkingService（深思）**：单角色综合决策，一次调用输出：私聊消息/发朋友圈/回复评论/点赞评论用户朋友圈/mood/internal_notes/memory_sync。私聊消息支持发表情（type:'sticker'）
- **messageScheduler**：聊天节奏调度。用户输入缓冲（停止输入 N 秒才发 API）+ 角色消息逐条分发（打字节奏）+ 中断机制。整批消息共用 batchId
- **sceneService**：场景模式（流式输出 + 用户输入时间词解析推进卡时间）
- **promptBuilder**：按预设槽位拼 prompt，按模式过滤消息类型（im 模式不带场景叙事）；IM 模式自动注入可用表情列表（`buildStickerListText`）
- **soloModeService**：单卡模式进入/退出/推进卡时间/锁定豁免判断
- **worldSummaryService**：增量扫描世界内角色聊天，辅助模型提炼"已发生客观事件"
- **backupService**：分类导入导出（角色精简包/完整包、世界书、预设、完整备份；默认不含 API 密钥）
- **npcService**：NPC 生成（主模型按用户需求生成 1-3 个 NPC，自动从头像库分配头像）
- **groupChatService**：群聊调度。支持两种模式（settings.groupChatMode）：coarse（粗略，默认）一次调用扮演所有成员；fine（精细）多轮调用，每轮只选 1~2 个最该接话的角色发言（详见第 6 节）
- **aiGroupService**：AI 智能拉群（阶段 4，用户主动触发版，详见第 6 节）
- **builtinAssets**：内置素材包启动导入（详见第 9 节）

### 3. 预设系统

- 三类：**微信预设**（多槽位拖拽）、**场景预设**、**内部任务预设**（utility，单段 system prompt）
- 内部任务类型：screening（粗筛）/ thinking（深思）/ scene_summary / world_summary / npc_generate / im_greeting_rewrite / moment_generate / comment_reply / moment_summary / image_describe / group_chat（群聊扮演·粗略）/ group_fine（群聊扮演·精细）/ group_generate（AI 智能拉群）
- 每种内部任务可多预设并切换"当前使用"（utilityPresetMap）。粗筛自带两个内置预设：`builtin-util-screening`（默认，保守）和 `builtin-util-screening-aggressive`（**激进版，角色更爱主动出现/发朋友圈，可在预设页切换**）
- **预设 prompt 措辞原则（2026-06 改版）**：主提示词用"你是 {{char}}，正在用微信/经历场景和 {{user}}…"的**代入式**写法（强调"你就是这个人"，不用"扮演/盒世界 App"等出戏字眼）；不替 {{user}} 发言
- **破限（jailbreak）槽位**：IM/场景预设各有独立可编辑的"越狱破限"槽——强调成人私密虚构创作、可呈现复杂/黑暗/情欲人性、不说教不回避不软化（不止为色情，更为探讨人性）。**utility 任务统一破限**：`getActiveUtilityPrompt` 给所有内部任务（NPC 生成/深思/群聊/拉群等）自动拼一段中性破限前缀，修复过"NPC 生成被模型用免责声明顶掉、破坏 JSON"的问题（`getActiveUtilityPromptRaw` 取不含前缀的原文供编辑展示）
- **文风 / 禁词槽位**（SillyTavern 风格）：IM 预设带"文风与禁词"槽但**默认关闭**（微信聊天通常不需要）；场景预设带专属文风/禁词槽且**默认开启**（剧情写作更需约束文笔——禁翻译腔/万能金句/替用户描写心理等）
- 槽位类型（SlotRole）含：角色字段、世界书前后、历史、用户人设、用户/角色朋友圈、朋友圈互动、场景回忆（scene_summary）、私有记忆（private_memory，**已实装**，内置 IM/场景预设含此槽位，db init 会给老数据迁移补槽位）
- **槽位 content 是标题前缀**，运行时与真实数据拼接（wrapField 已修复"含宏标题导致内容丢失"的 bug）

### 4. 双 API 配置

- **主模型**：对话、深思、NPC 生成、AI 拉群等用户可见输出
- **辅助模型**：粗筛、各类摘要、图片描述（vision）。未配置时回退主模型

### 5. 单卡模式（重大架构，已完成大部分）

- **全局 + 单卡并存**：每卡可进入单卡模式获得独立时间线（**进入时起始时间 = 当时的全局时间，选项 A**，之后才独立）
- **单卡时间可以往回调**；锁定状态按"单卡时间 vs 全局时间"**实时判断**
- **时间锁定机制**：卡的独立时间 > 全局时间 → 全局视角下锁定（仅暂停后台主动行为/补算、读不到全局朋友圈；聊天红色警告**但允许聊，用户自负后果**）；**当前激活世界豁免锁定**
- **朋友圈可见范围**：**简单二选一**——public / solo（仅某卡世界），精细分组后期再说。单卡模式发的自动 solo
- **用户人设**：全局只留 name + avatar（description 已删除，具体人设写进角色卡）
- 入口：通讯录长按角色 → 进入单卡模式；橙色横幅显示状态

### 6. 群聊系统（✅ 阶段 2/3/4 已完成并实测通过）
- Chat 扩展：`type`（single/group，旧数据迁移补 single）+ `name` + `memberIds`（不含用户）+ `worldId`（单卡世界群）；Message 加 `senderId`（群内发言人）。db schema v10
- **建群**：微信列表页右上角 Users 图标 → `/group-create`；全局模式可选所有主卡，单卡模式可选该世界主卡+好友 NPC（`isContact !== false`）；至少 2 人；群名留空自动生成
- **群聊调度**（groupChatService）：独立于单聊调度器。一次 API 调用让主模型同时扮演所有成员（group_chat utility prompt，输出 `{messages:[{speaker,type,content}]}`，content 支持 text/sticker），按打字节奏逐条分发；speaker 名字匹配优先级：精确 → 去括号注释后精确 → speaker 以成员名开头（取最长）→ 成员名以 speaker 开头 → 成员名在 speaker 中出现位置最早；全部失败才丢弃（prompt 已要求 speaker 只写名字禁止括号注释，修复过"姜海（裴振山的邻居）"错配成裴振山的 bug）
- **群 UI**（GroupChatView，ChatPage 检测 type=group 切换）：发言人头像+名字标签（**点击可进角色详情页**）、群头像四宫格、左下角"催一下"按钮（手动触发一轮 AI 发言）、群菜单（成员列表含用户且成员可点进详情/改群名/清空/解散）、消息操作（复制/编辑/重发这一轮/删除）；群人数显示 = AI 成员 + 用户
- 清空群消息用 `scheduler.reset()` 而非 dispose（dispose 会让组件订阅悬空在已销毁实例上，曾导致"Cannot read properties of null (reading 'signal')"报错——abortController 也已改为局部变量防竞态）
- 群时间：单卡世界群用主卡时间；全局群用全局时间
- **世界记忆接入**：worldSummaryService 也扫描该世界的群聊（scannedSeq 用 `group:chatId` 作 key），群事件 → 统一世界记忆 → 经深思 memory_sync 流入各成员私有记忆；**群聊记忆只同步给群聊成员**
- 群聊 prompt 注入各成员人设上限：描述 6000 字 / 性格 2000 / 背景(scenario) 1500 / 私有记忆 1000（曾因截到 600 字丢失关键人设导致角色行为 OOC，已修复）
- 设计决策："一次调用扮演所有角色"是已确认的**方案甲**（保证角色间对话连贯）；AI 自己决定哪些角色发言（不是人人每句都回应）
- **群聊精细模式（✅ 已完成）**：设置页"群聊模式"可在 coarse（粗略，默认省钱）/ fine（精细）间切换（settings.groupChatMode，默认 coarse；db v 不变，靠 defaults + init merge 给旧数据补 coarse）。精细模式 = "调度判断 + 少数角色扮演"合一的单次调用，每轮用 group_fine prompt 只选 1~2 个最该接话的角色发言（输出同 `{messages:[{speaker,type,content,image_prompt?}]}`，speaker 匹配复用 matchMember），分发完这批再读最新历史判断下一轮，messages 空数组=本轮无人发言、结束循环。实现：groupChatService 的 runApiAndDeliver 按 groupChatMode 分流 → fine 走 runFineRounds（多轮循环）+ deliverBatch（Promise 化的按打字节奏分批分发，发完 resolve）；新增 fineAborted 标志，用户发消息/发表情/催一下/reset 时复用 cancelDelivery/cancelInflight 置位打断循环。内置预设 builtin-util-group-fine（"群聊扮演·精细（默认）"），原 group_chat 预设名改为"群聊扮演·粗略"
  - **轮数上限可调（2026-06）**：`settings.groupFineMaxRounds`（默认 6，设置页"群聊模式 → 精细模式轮数上限"，仅 fine 时显示，范围 1~30）。轮数越大角色之间越能自己聊开，但 API 开销越大
  - **AI 角色自主互聊 + 自然收尾（2026-06）**：fine prompt 注入"群聊氛围"引导（角色之间可互相搭话/接梗/闲聊，不必每句都等用户；没话说就返回空数组）。关键体验优化：`buildGroupPrompt` 增加 `opts.windingDown`，`runFineRounds` 在**最后一轮**（round >= maxRounds-1）传 windingDown=true → 注入"收尾提示"让正发言的角色用符合人设的方式自然把话题收住（说去吃饭/睡觉/有事先走/下次再聊），而不是因轮数上限戛然而止
- **群内加好友（阶段 3，✅ 已完成）**：Character 新增 `isContact?: boolean` 字段——`false` = 仅存在于群聊中的 NPC，`undefined` 视为 `true`（旧数据兼容）。群消息发言人名字标签显示"·非好友"橙色标记，点击进角色详情页；详情页对非好友显示"加为好友"按钮 → 置 `isContact: true` → 出现在通讯录、可单聊。通讯录/手动建群/AI 拉群候选列表均过滤 `isContact !== false`
- **AI 智能拉群（阶段 4，✅ 已完成——用户主动触发版）**：aiGroupService.generateGroupChat。入口在建群页顶部"AI 智能拉群"区，用户输入一句话需求 → 主模型一次调用决定：群名 / 拉哪些已有角色（member_names）/ 是否生成新 NPC（new_npcs，仅单卡模式、最多 3 个，含 gender 用于头像分配）/ 开场消息（first_messages，最多 5 条）。新 NPC 标记 `isContact: false`（只在群里，加好友后才进通讯录）+ 自动从头像库按性别标签分配头像。全局模式禁止生成新 NPC（prompt 强制 new_npcs 给 []）。prompt 注入：世界背景（主卡档案）、用户信息（含 userProfile）、可拉入角色列表、已有群列表（防重复建群）。utility 类型 `group_generate`，内置预设 `builtin-util-group-generate`。匹配到的成员不足 2 人则报错让用户换说法重试

### 7. NPC 系统（阶段 1 已完成）
- NPC 复用 Character 表：`isNpc: true` + `parentWorldId`（所属世界主卡 id）+ `npcRelation`
- **NPC 能读到主卡信息**：promptBuilder 的 char_description 槽位对 NPC 自动追加所属世界主卡的档案（描述 3000 字 + 性格 800 字）；深思 prompt 同样追加（2000 字）。修复过"NPC 不知道主卡是用户爸爸，瞎编成哥哥"的 bug。**措辞必须中性**——标注"是否认识、了解多少以你自己的人设和关系设定为准；若没有交集则你并不认识 TA"（NPC 不一定认识主卡，可能只是用户的同事，不能硬编码"你认识 TA"）
- **userProfile 字段（用户人设/与用户的关系）**：每张卡可写"该角色视角下的用户是谁"。**入口在角色详情页顶部**（不在编辑页）——未填时显示高亮"设置用户人设"按钮，已填时显示内容卡片，点击均可内联编辑。生效优先级：角色自己的 userProfile → NPC 回退所属世界主卡的 → 全局昵称。注入位置：user_persona 槽位（单聊/场景）、群聊 prompt 用户信息、深思 prompt 用户信息。注意：主卡与用户的关系也不可预设（可能刚认识），所以只靠这个字段描述，不做任何硬编码假设
- 生成方式："用户一句话需求 + 懒人快捷下拉框"（输入框右侧下拉，含"根据世界观自动生成"等预置项）；入口：单卡模式通讯录"+生成"
- NPC 人设**精简**，重点描述与主角/用户的关系（不要喧宾夺主）
- **NPC 头像自动分配**：npcService / aiGroupService 生成 NPC 时调用 `useAvatarLibStore.takeAvatar(npcId, preferTags)`（AI 输出 gender 字段 → 按"男/女"标签优先随机取未占用头像并标记 usedBy）；删角色（含连带删世界 NPC）时 characterStore 调 `releaseByCharacter` 释放头像回库
- 通讯录按模式过滤：全局模式下 NPC **完全不显示、不参与补算**；单卡显示主卡+该世界好友 NPC（`isContact !== false`）
- NPC 只在所属世界激活时参与补算；时间/锁定跟随主卡
- 删主卡连带删 NPC

### 8. 世界记忆系统（✅ 已完成并实测通过）

- **统一世界记忆**（WorldSummary）只记"**已发生的客观事件**"：
  - ✅ 记：搬家、一起吃了饭、去了某地、冲突、身份变化等既成事实
  - ❌ 不记：纯对话内容、**未兑现的约定**（"约好明天看电影"不算事件）、内心想法情绪
- **增量扫描**：只扫描各角色上次扫描位置（scannedSeq）之后的新消息，避免重复消耗 token
- **私有记忆同步判据（关键）**：深思时 AI 判断的是——世界记忆中"**我自己的聊天上下文里没有** + **按我的身份合理会知道**"的事件，才写入 privateMemory。例：用户和主卡聊了搬家 → 主卡上下文已有，不写；房东 NPC 上下文没有但身份上该知道 → 写入房东私有记忆
- **记忆同步白嫖深思调用**：不是独立 API 调用，是深思那一次调用顺便输出 memory_sync 字段，零额外成本。thinkingService 去重后追加写入 privateMemory（上限 2000 字，超限丢最老行）
- **统一世界记忆只在深思阶段使用**（给 AI 做同步判断），角色日常聊天 prompt **只注入私有记忆**（private_memory 槽位），信息隔离才彻底
- 主卡和 NPC 一视同仁走这套（主卡上下文最全，其私有记忆通常很少，符合预期）；NPC 用所属世界主卡的 WorldSummary
- 深思日志（decide 行）会显示"记忆同步 N"条数，可在补算日志页验证
- **用户可手动修正记忆**：角色详情页"记忆管理"区块——私有记忆（所有角色可编辑）+ 世界事件记忆（仅主卡可编辑），用于纠正 AI 错误写入（如截断人设导致的错误事件被同步进记忆）
- ⚠️ 曾有隐藏 bug：worldSummaryStore 从未在启动时 load（main.tsx 漏调），导致内存里读不到已有 WorldSummary、scannedSeq 失效每次从零重扫。已修复（启动加载链补上 useWorldSummaryStore.load）

### 9. 素材库系统（表情包 + 头像库，✅ 已完成并实测通过）

**定位**：表情包主要给**角色（AI）发**；头像库主要给 **NPC 自动分配**。

- **数据层**：db v11 新增 `stickers` + `avatarLibrary` 两表；类型 `Sticker`（desc 即 AI 看到的"表情名"，通常来自文件名）、`AvatarItem`（tags 标签 + usedBy 占用标记）
- **assetStore**（src/stores/assetStore.ts）：
  - `useStickerStore`：批量导入（文件名去扩展名即描述，重名跳过；**<300KB 直接存原文件保留 GIF 动画/PNG 透明，大文件压缩 256px JPEG**）、updateDesc、remove/removeAll、`findByDesc`（精确 → 双向包含模糊匹配，取描述最长的更具体者）
  - `useAvatarLibStore`：批量导入统一打 tags（压缩 256px）、updateTags、`takeAvatar`（按 preferTags 优先随机取未占用头像并标记 usedBy）、`releaseByCharacter`（删角色释放）
  - 两个 store 在 main.tsx 启动加载链中 load
- **AI 发表情链路**：消息 type `'sticker'`，content = 表情描述名。promptBuilder 在 IM 模式自动注入 `buildStickerListText`（可用表情名列表，**上限 100 个超出随机抽样**，每次调用随机抽不同子集长期覆盖全库）；群聊 prompt（groupChatService）、深思 private_messages（thinkingService）同样支持；replyParser/messageScheduler 解析分发 sticker 类型；渲染用 `StickerImage` 组件（按 desc 从 store 查图，ChatPage / GroupChatView 已接入，查不到显示文字回退）
- **⚠ 表情触发率关键经验（实测有效）**：曾因指令措辞被动（"发送表情时 content 必须…"只说怎么发）导致 AI **从不发表情**。修复：buildStickerListText 改为**主动行为引导**——明确"何时该发"（开心/无语/调侃/震惊等情绪场景）+"像真人一样发表情活跃气氛"+"聊得起劲时大胆用但别每条都发"。一处改动单聊/群聊/深思全生效
- **NPC 头像分配匹配链**（`src/utils/avatarTags.ts`，曾两轮错配 bug，已修复实测）：① `normalizeGender` 归一化 AI 输出的 gender（"男性"/"male"/"女生"→"男"/"女"）；② AI 没给 gender 时 `inferGenderFromText` 从名字+关系+描述推断（"钱婶/老板娘"→女）；③ `detectElder` 识别长辈角色（爸妈爷奶叔姨师父房东等）；④ `buildAvatarPreference` 构建 AND 标签组优先级（长辈男 → [['长辈','男'],['长辈'],['男']]）；⑤ takeAvatar 按组降级匹配，全落空才全库随机。**教训：直接拿 AI 原始输出当标签匹配必错；优先级组必须有性别兜底**
- **用户发表情**：`StickerPanel` 组件（聊天输入栏笑脸按钮弹出网格面板）；chatStore.appendUserSticker + 单聊/群聊调度器 submitUserSticker（与文本同等对待：进缓冲、buffer 记 `[表情：xxx]`、中断 AI 分发、停止操作后触发 API）
- **表情面板改造（2026-06，仿微信"添加的单个表情"）**：`Sticker` 新增 `favorite?: boolean`。`StickerPanel` 默认**只展示用户收藏的表情**（favorite=true），不再铺满整个素材库；左上角 `+` 可上传自己的表情（`importUserStickers`，favorite=true，重名自动加后缀）。长按聊天里角色发的表情/图片可"添加到喜欢"（`favoriteByDesc` / `addImageAsFavorite`——后者把角色发的 ComfyUI 图片存成新表情供复用）。`buildStickerListText` 改为**优先把收藏表情全量放进给 AI 的可用列表**，剩余名额再随机补内置库——实现"角色偷用户表情包"的活人感
- **用户聊天发图（2026-06，vision 直读）**：单聊输入栏新增图片按钮 → `chatStore.appendUserImage`（type=image + imageData，1024px JPEG）+ `scheduler.submitUserImage`；promptBuilder 的 `renderHistory` 对带 imageData 的图片消息**以 OpenAI 多模态格式（image_url）直接喂给模型**，不转文字描述（`OpenAIMessage.content` 已支持 `string | ContentPart[]`，`mergeAdjacent` 跳过数组内容）。需用支持 vision 的模型
- **图片放大查看**：`ImageLightbox` 组件，单聊/群聊图片消息点击全屏放大
- **手动挑头像**：`AvatarPickerDialog` 组件（角色编辑/新建页"从头像库选择"），选中后写 avatar 并标记 usedBy 防自动分配撞同款
- **素材库管理页** `/assets`（AssetLibraryPage）：**"我"页入口已移除**（几百张 base64 图一次渲染太卡，内置包模式下用户也无需管理）；路由保留，需要时手动输 `/assets` 仍可进
- **内置素材包机制**（**定位关键**：库是内置给最终用户开箱即用的，不指望用户自己攒素材；开发者负责填充）：
  - 素材放 `public/builtin-assets/stickers/`（文件名即描述）和 `public/builtin-assets/avatars/`（支持 male/ female/ elder/ elder_male/ elder_female/ 子目录 → 自动打对应标签并移到平级加前缀；elder 系=长辈风景/花草头像）；附 README 说明放置约定
  - `scripts/build-asset-manifest.mjs` 扫描生成 manifest.json（version 用时间戳，每次重新生成触发增量导入）；**已支持 ChineseBQB 文件名自动清洗**——「滑稽大佬00001-360度鄙视你.gif」→ 描述「360度鄙视你」（去系列前缀+编号；多别名「打不着-打不到」保留，findByDesc 双向包含可命中任一别名）；纯编号文件名（无语义）跳过并提示；同描述去重；>400KB 大文件警告（仍收录）
  - 启动时 `builtinAssets.importBuiltinAssetsIfNeeded` 后台 fetch manifest，按 localStorage 记录的已导入版本增量导入（表情按 desc 去重；key=`boxworld_builtin_assets_version`，清掉可强制重导）
  - `temp-bqb/` 目录 = ChineseBQB 表情包仓库的临时源素材（zip 包，文件名即含义），**不入库**；素材挑选解压由开发者手动完成 → 放进 builtin-assets → 跑脚本生成内置包
- **头像获取脚本**：`scripts/crawl-avatars.mjs` 爬「我要个性网」（中国网络风头像聚合站——抖音/小红书用户头像的源头站，动漫/猫狗/背影风格；男生/女生/风景三分类对应 male/female/elder）。设计决策：**不爬抖音/小红书**（强反爬签名算法 + 真实用户头像肖像权风险），爬聚合站等效且干净。`scripts/download-avatars.mjs` 为备选（randomuser 真人风/DiceBear 插画风，质量低不符合中国用户习惯，已弃用）

### 10. ComfyUI 文生图（角色发图，✅ 已完成，仅桌面端）

**定位**：让角色在「微信聊天」和「朋友圈」里像真人一样发出 AI 生成的照片。仅桌面端（Tauri）生效——移动端/浏览器 `isComfyAvailable()` 返回 false，相关能力提示词不注入，AI 不会输出发图字段。

- **配置**（`ComfyConfig`，存 settings.comfyConfig，默认 `enabled:false`；设置页"ComfyUI 文生图（仅电脑端）"区，`isDesktop()` 才渲染）：
  - 服务地址（默认 `http://127.0.0.1:8188`）；**模型模式**二选一：`checkpoint`（单文件大模型）/ `unet`（UNet + CLIP + VAE 分离式，Flux/SD3 等用）
  - checkpoint 模式选 Checkpoint 模型；unet 模式分别选 UNet / 权重精度 / CLIP1 / CLIP2（单 CLIP 留空）/ CLIP 类型 / VAE（点"拉取模型列表"一次性从 `/object_info` 解析全部枚举）
  - 通用参数：画风前缀（positivePrefix，拼在 AI 提示词前）、宽高、steps、cfg、采样器、调度器、负面提示词、出图超时秒数、自定义工作流 JSON（API 格式，支持占位符 `%prompt% %negative% %seed%`，留空用内置工作流）
  - 设置页有"测试连接"（GET /system_stats）和"测试出图"两个按钮
- **comfyService**（src/services/comfyService.ts）：
  - `comfyFetch`：Tauri 端走 `@tauri-apps/plugin-http`（Rust 侧发请求，无 CORS 限制，ComfyUI 无需加 `--enable-cors-header`）；浏览器开发环境回退原生 fetch。**关键坑**：① 伪装 Origin/Referer/Host 为 ComfyUI 同源，否则新版 ComfyUI 校验跨站 403；② baseUrl 不带协议时自动补 `http://`，否则 Tauri 当相对路径拼到 tauri.localhost；③ 超时用 AbortController + setTimeout 手动实现，不用 `AbortSignal.timeout()`（Tauri HTTP 插件兼容性差会直接失败）
  - `generateComfyImage(prompt)`：组装 workflow（内置 txt2img / 自定义）→ POST /prompt → 轮询 /history/{id}（1.5s 间隔，到 timeoutSec 超时）→ GET /view 取图 → 压缩成 1024px/0.85 JPEG dataURL。内置工作流按 modelMode 分支（CheckpointLoaderSimple 单文件 / UNETLoader+DualCLIPLoader 或 CLIPLoader+VAELoader 分离式）。纯 HTTP 轮询，不依赖 websocket
  - `isComfyAvailable()` = 桌面端 + enabled + 填了地址
- **聊天发图链路**：promptBuilder 的 `buildChatImageHint()`（仅 IM 模式 + isComfyAvailable 时注入）告诉 AI 可发 `{type:"image", content:"中文描述", image_prompt:"英文SD提示词"}`；replyParser 解析 image 类型（缺 image_prompt 降级为文字）；messageScheduler 在**分发该条时实时出图**（出图成功存 imageData 的 image 消息，失败降级为纯文字描述，对话不中断）
- **朋友圈发图链路**：thinkingService 的 `buildComfyHint()`（仅 isComfyAvailable 时注入深思 prompt）告诉 AI 发朋友圈时可额外输出 `moment_image_prompt`（英文 SD 提示词）+ `moment_image_desc`（中文描述）；applyThinkingResult 里先出图再发朋友圈（出图存进 moment.images，描述存 imageDescriptions 供别的角色"看图"；失败则发纯文字朋友圈）
- **群聊发图**：groupChatService 同样注入 buildChatImageHint、解析 image 类型、分发时实时出图（失败降级文字）
- **设计经验**：发图措辞同表情包——主动行为引导（"聊到我给你看/拍给你时更应该发"）+ 别滥发约束（一次最多 1 张、自然聊天为主）；image_prompt 要求不出现人名（人物外貌按人设描述，避免 SD 乱画）
- **提示词前/后缀**：ComfyConfig 有 `positivePrefix`（画风前缀）+ `positiveSuffix`（质量后缀，2026-06 新增），`generateComfyImage` 出图时拼成 `前缀, AI提示词, 后缀`
- **采样器/调度器下拉**（2026-06 新增）：设置页"采样器""调度器"改为下拉选择，点"拉取模型列表"时一并从 `/object_info/KSampler` 拉真实枚举（`fetchComfySamplers`），未拉到用内置常见列表兜底（`EnumSelectRow` 组件 + DEFAULT_SAMPLERS/SCHEDULERS）
- **辅助模型改写提示词**（2026-06 新增，解决"模型给中文/糙提示词导致糊图"）：ComfyConfig.`promptGenEnabled` 开关（设置页"辅助模型改写提示词"）。开启后出图前调 `generateImagePrompt(中文描述)`——用辅助模型按 `image_prompt_gen` utility 预设把描述改写成规范英文提示词。**该预设可在「预设 → 文生图提示词改写」编辑**，方便针对不同 SD 模型（tag 风 / 自然语言）和侧重点（人物 / 场景）定制。聊天（messageScheduler）、群聊（groupChatService 两处）、朋友圈（thinkingService）出图链路都接了这一步；失败/未配置回退原文，不阻塞出图

### 11. 语音通话（微信式全屏通话，✅ 已完成，路线 B：STT→LLM→TTS 回合制 + 前端伪实时）

**定位**：仿微信的全屏语音通话页（不是聊天里的语音气泡，也不是语音输入）。底层回合制：用户说话 → STT 转文字 → 走现有聊天链路拿 AI 文字回复（复用人设/世界书/记忆）→ TTS 合成语音播放。前端做"伪实时"优化逼近真实通话。桌面端 + 移动端都可用（不限平台），需中转站支持 `/audio/transcriptions`（STT）和 `/audio/speech`（TTS）接口。

- **配置**（`VoiceConfig`，存 `settings.voiceConfig`，默认 `enabled:false`；设置页"语音通话"区，不限平台）：
  - `enabled` 启用开关、`sttModel`（默认 whisper-1）、`ttsModel`（默认 tts-1）、`ttsVoice`（默认 alloy）、`vadEnabled`（VAD 自动断句，默认开）、`vadSilenceMs`（静音判定，默认 800ms）、`sttLanguage`（默认 zh）
  - **语音端点独立可选（2026-06）**：`endpointSource`（`'custom'` 推荐 / `'primary'` / `'utility'`）+ `voiceBaseUrl` + `voiceApiKey`。因为支持语音的模型常与文字模型不在同一服务，所以可单独填一个语音端点；STT/TTS 模型可点"拉取模型列表"下拉选。兼容旧字段 `useUtilityEndpoint`（pickVoiceEndpoint 迁移换算）
  - 设置页有"测试 STT（录 2.5s 转文字）"和"测试 TTS（合成一句播放）"两个按钮
  - `createDefaultVoiceConfig()`（db/defaults.ts）+ `updateVoiceConfig`（settingsStore）+ init.ts 旧数据迁移补 voiceConfig
- **apiService 新增**：`transcribeAudio(endpoint, blob, {model,language,signal})` → POST `/audio/transcriptions`（FormData，不手动设 Content-Type）；`synthesizeSpeech(endpoint, text, {model,voice,format,signal})` → POST `/audio/speech` 返回音频 Blob。普通 fetch（中转站是普通 https，非本地服务，跨域由中转站处理）
- **voiceCallService**（src/services/voiceCallService.ts，通话引擎）：
  - `runVoiceTurn(chatId, characterId, userText, signal)`：通话每轮——把 STT 文字 append 成用户消息 → buildPrompt（复用 IM 预设/人设/世界书/记忆）→ callChatCompletion → parseReply 取文本合并 → append 成 AI text 消息（**通话与文字聊天共享上下文，每轮都写进聊天历史**）→ 返回纯文本供 TTS
  - `splitIntoSentences(text)`：按中文标点切句（合并过短碎句），供边收边播逐句 TTS
  - `pickVoiceEndpoint()`：按 voiceConfig.endpointSource 选 custom（独立端点）/ utility / primary，兼容旧 useUtilityEndpoint
- **VoiceCallPage**（src/pages/VoiceCallPage.tsx，全屏覆盖层，路由 `/voice-call/:id`，在 App.tsx 顶层不套导航壳）——前端伪实时发力点全做了：
  - 状态机：`idle → listening(录音) → transcribing(STT) → thinking(LLM) → speaking(TTS播放) → listening…`，可挂断
  - 录音：`getUserMedia({audio}) + MediaRecorder`（webm/mp4 兼容选择）
  - **VAD 自动断句**：Web Audio AnalyserNode 算 RMS 能量阈值（0.04），检测到说话→静音超 vadSilenceMs→自动结束本段提交 STT（requestAnimationFrame 主循环）
  - **边收边播 TTS**：回复按句切分，逐句送 TTS 排队播放（ttsQueueRef + playNextTts 串行）
  - **打断**：播放 AI 语音时 VAD 检测到用户开口（rms > 阈值*1.5）→ 停播+清队列+切回 listening（仿真实通话插话）
  - UI：对方大头像、名字、状态文案、通话计时、静音按钮、红色挂断按钮；显示最近一轮用户话/AI 回复文字
  - 挂断在聊天里留一条 `system_notice`「通话时长 mm:ss」
  - 所有 ref（stream/audioCtx/recorder/rafTimer/abortController 等）在卸载/挂断时清理；endedRef 防竞态
- **+ 号面板**（`src/components/PlusPanel.tsx`，仿微信九宫格）：可用项 = 相册（onPickImage）、语音通话（onVoiceCall，voiceConfig.enabled 才亮）；其余项（拍摄/视频通话/位置/红包/转账/礼物）灰显禁用占位。ChatPage 输入栏把原"图片"按钮换成"+"按钮（与表情面板互斥），图片逻辑移进 PlusPanel；语音通话项 → navigate(`/voice-call/:chatId`)
- **安卓权限**：AndroidManifest.xml 加 `RECORD_AUDIO` + `MODIFY_AUDIO_SETTINGS` + `microphone` feature（required=false）。运行时 WebView 会弹权限
- **设计决策**：① 通话每轮的用户话和 AI 回复都 append 成普通 text 消息存进该 chat（上下文连续、实现简单，已确认）；② 不做 Realtime/WebRTC；③ 不做聊天里的语音气泡；④ STT/TTS 能否用取决于中转站，给了测试按钮 + 失败兜底（识别失败/合成失败都不中断，回到聆听或跳过）

---

## 三、重要约定与已确认设计决策

1. **AI 控时**：场景模式用**方案 D**——纯代码正则解析用户输入的时间词（"一天后""睡了一下午"等）推进卡时间 + 顶部手动控时菜单兜底。不依赖 AI 输出标记（已验证不可靠），不额外调 API
2. **消息节奏**：用户停止输入 3 秒才触发 API；角色多条消息按打字速度逐条出现；用户插话丢弃未发出的剩余队列；重发也走节奏分发
3. **聊天功能**：右键/长按消息 → 复制/编辑（仅改文本不重新生成）/重发（仅 AI 消息，删整批重生成）/删除单条/删除整批
4. **场景模式**：左对齐卡片 + 头像名字标签；引号对白蓝色、星号动作灰斜体（中英引号都支持）；流式开关复用 apiConfig.stream（仅场景流式，微信不流式）
5. **微信不显示场景叙事**，通过 scene_summary 槽位（角色第一人称回忆，辅助模型增量生成）间接感知
6. **图片**：用户朋友圈可传图（压缩 1024px/0.85 JPEG base64）；tick 时辅助模型 vision 解析成文字描述存 imageDescriptions（失败标记不重试）；后续 prompt 用描述不重复读图。**角色发图（聊天 + 朋友圈）已实现**——经 ComfyUI 文生图（仅桌面端，详见第 10 节）；角色发"表情包"已实现（素材库，见第 9 节）
7. **朋友圈策略**：深思可主动点赞/评论用户朋友圈（user_moment_interactions 字段）；摘要功能可选开启（超阈值时老朋友圈压缩，保留最近 5 条原文）
8. **导入导出**：分类导出便于分享；导入冲突一律新建副本；完整备份导入会覆盖（保留当前 API 配置若备份无密钥）
9. **变量名被吞问题**：长 camelCase 变量名（deliveringAssistant、fromCharacter、setActiveSoloCharacter 等）在输出中会丢失字符，需人工核对
10. **Zustand 坑**：selector 里不可返回新数组/调用 filter 方法（无限循环白屏）；Dexie transaction 多表需用数组包裹
11. **移动端**：safe-area 适配已做（h-header-safe / pb-safe 等工具类 + viewport-fit=cover）
12. **消息时间戳**：聊天消息时间戳用 `chatNow(chatId)`（按 chat 对应角色取卡时间；群聊取所属世界主卡时间）；getOrCreateChat 创建会话用全局时间
12.5 **补算时间基准**：粗筛基准时间与各角色 sinceMs 计算、lastTickAt 写入均用 `nowForCharacter`（单卡模式=世界时间）；粗筛查最后消息时排除群聊 chat；补算日志页在单卡模式下只显示当前世界角色的条目并显示提示横幅
13. **activeLevel 字段保留但不再参与逻辑**（主动性由 AI 按人设判断）
14. **重置内置预设**：修改 builtinPresets.ts 后，已有库必须在预设页右上角"重置内置预设"才生效（db init 只在预设不存在时添加，不覆盖已有预设）
15. **素材压缩策略**：表情 <300KB 存原文件（保 GIF 动画/PNG 透明），大文件压缩 256px JPEG；头像统一压缩 256px JPEG；朋友圈图片 1024px/0.85 JPEG

---

## 四、当前进度与待办

### ✅ 已完成（核心功能可用）
- 微信 IM 聊天 + 场景模式（双形态）、消息节奏调度、消息操作
- 虚拟时间系统 + 补算心跳（粗筛/深思）+ 补算日志页
- 朋友圈（发图/点赞/评论/摘要/可见范围）
- 世界书、预设系统（IM/场景/utility 全套）、双 API 配置
- 酒馆角色卡导入（PNG/JSON）、分类导入导出/完整备份
- 单卡模式（独立时间线/锁定机制/橙色横幅）
- NPC 系统（阶段 1）：一句话生成、读主卡信息、userProfile、记忆管理
- 群聊系统（阶段 2/3/4，✅ 实测通过）：建群、群调度、群 UI、群内加好友（isContact）、AI 智能拉群（group_generate）
- 世界记忆系统（统一世界记忆 + 私有记忆同步，✅ 实测通过）
- 素材库系统（表情包 + 头像库，✅ 实测通过，见第 9 节）：db v11、assetStore、AI 发表情全链路（含主动触发措辞）、用户发表情面板、NPC 头像自动分配（含性别推断/长辈识别）、内置素材包已填充（BQB 表情 + 爬虫头像）
- **用户聊天发图（vision 直读）+ 表情面板改造（收藏/偷表情）+ 图片点击放大**（2026-06，见第 9 节）
- **ComfyUI 增强**（2026-06，见第 10 节）：采样器/调度器下拉、画风后缀（positiveSuffix）、辅助模型改写提示词（promptGenEnabled + image_prompt_gen 可编辑预设）
- 新建角色卡功能：路由 `/character-create`（CharacterEditPage 双模式复用），通讯录右上角 + 号弹菜单「新建角色 / 导入角色卡」
- 角色编辑页从头像库挑头像（AvatarPickerDialog）
- **群聊精细模式**（settings.groupChatMode，coarse/fine 切换，✅ 已完成，见第 6 节）
- **ComfyUI 文生图 + 角色发图**（聊天 + 朋友圈 + 群聊，仅桌面端，✅ 已完成，见第 10 节）
- **打包**：Windows 桌面端（Tauri，msi + nsis）已打包；安卓 apk（环境 + release 签名已配好，可出包）
- **语音通话**（路线 B：STT→LLM→TTS 回合制 + 前端伪实时，✅ 已完成，见第 11 节）：VoiceConfig 配置 + 设置页测试按钮、apiService STT/TTS、voiceCallService 通话引擎、VoiceCallPage 全屏通话页（VAD 自动断句/边收边播/打断/伪实时）、PlusPanel 九宫格、安卓麦克风权限

### 📋 待办 / 后续可优化
- 暂无硬性待办；核心功能已全部实装并打包。
- 可选优化方向（非必须）：朋友圈精细分组可见范围（多选定向可见/屏蔽，当前仅 public/solo 二选一已实装）、内置素材包持续扩充。
> 朋友圈可见范围 public/solo（仅某卡世界）已实装（MomentsPage 发布面板下拉 + momentContext 过滤）。群聊精细模式轮数上限已做成可调（groupFineMaxRounds）。

> 已确认不做：微信模式的 AI 控时（不需要）
