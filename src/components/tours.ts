import type { TourDef } from '../stores/tourStore'

/**
 * 各页面教程定义。
 * target 对应页面元素上的 data-tour 属性；不填 target 的步骤显示居中说明卡。
 * 每个教程只在用户第一次进入对应页面时触发。
 */

export const chatsTour: TourDef = {
  id: 'chats',
  steps: [
    {
      title: '欢迎来到盒世界',
      content: '这里是微信聊天列表。和角色的所有对话都会出现在这里。角色拥有自己的生活——TA 们会按自己的节奏主动给你发消息、发朋友圈。',
    },
    {
      target: 'group-create',
      title: '发起群聊',
      content: '点这里可以建微信群：手动挑选成员，或者用「AI 智能拉群」——说一句"帮我建个家庭群"，AI 自动挑人、起群名、安排开场。',
    },
    {
      target: 'tab-contacts',
      title: '去通讯录添加角色',
      content: '第一步从通讯录开始：导入酒馆角色卡（PNG/JSON）或新建角色，然后就可以开聊了。',
    },
  ],
}

export const contactsTour: TourDef = {
  id: 'contacts',
  steps: [
    {
      target: 'add-character',
      title: '添加角色',
      content: '点这里新建角色或导入 SillyTavern 角色卡（PNG/JSON 都支持）。',
    },
    {
      title: '单卡模式（重要玩法）',
      content: '长按（或右键）任意角色，可进入「单卡模式」：该角色获得独立时间线，你可以自由推进/回拨 TA 世界的时间，还能在 TA 的世界里生成 NPC 配角、建专属群聊，打造完整的小世界。',
    },
    {
      target: 'solo-banner',
      title: '调整单卡时间',
      content: '进入单卡模式后这里会出现橙色横幅。点击横幅上的时间，即可直接进入「单卡时间」页快进/回拨该角色世界的时间——不必再去场景模式里调了。',
    },
    {
      title: '角色会"活着"',
      content: '点开角色 → 发消息即可开聊。退出应用后角色的生活仍在继续：再次打开时会"补算"离线期间 TA 们做了什么（主动消息、朋友圈等）。',
    },
  ],
}

export const momentsTour: TourDef = {
  id: 'moments',
  steps: [
    {
      title: '朋友圈',
      content: '角色会像真人一样发朋友圈记录生活，也会给你的朋友圈点赞、评论。你评论 TA 的朋友圈，TA 也可能回复你。',
    },
    {
      target: 'moment-post',
      title: '发布你的朋友圈',
      content: '点相机发自己的动态，可以配图。角色们刷到后可能来互动——这是聊天之外培养感情的好方式。',
    },
  ],
}

export const meTour: TourDef = {
  id: 'me',
  steps: [
    {
      target: 'time-control',
      title: '虚拟时间',
      content: '盒世界有自己的时间系统。这里可以暂停、加速或手动推进全局时间——时间流逝会影响角色的作息和主动行为。',
    },
    {
      target: 'menu-lorebooks',
      title: '世界书',
      content: '管理世界观设定条目，聊天时按关键词自动注入，兼容酒馆世界书。',
    },
    {
      target: 'menu-presets',
      title: '预设',
      content: '管理 Prompt 预设：微信聊天、场景模式、以及各种内部任务（补算决策、摘要等）的提示词都可在此自定义。',
    },
    {
      target: 'menu-ticklog',
      title: '补算日志',
      content: '角色的每次"主动行为决策"都有记录：谁被选中了、做了什么、为什么。想了解角色后台在干嘛就看这里。',
    },
    {
      target: 'menu-settings',
      title: '设置',
      content: '最重要的一步：先去设置里填好 API（模型服务），否则角色无法回复。',
    },
  ],
}

export const settingsTour: TourDef = {
  id: 'settings',
  steps: [
    {
      target: 'api-primary',
      title: '配置主模型',
      content: '填入兼容 OpenAI 格式的 Base URL、API Key，点刷新按钮拉取模型列表并选择。主模型负责正式对话，建议用质量较好的模型。',
    },
    {
      target: 'api-utility',
      title: '辅助模型（可选）',
      content: '内部任务（粗筛、摘要）用的模型，可以填便宜的；留空则自动用主模型。',
    },
    {
      target: 'tick-section',
      title: '什么是"补算"？',
      content: '补算 = 角色的"后台生活引擎"。每隔一段时间，系统让 AI 判断哪些角色此刻想主动做点什么（给你发消息、发朋友圈、评论互动）。这里可以调整补算的频率、并发和触发时机。默认配置即可正常使用。',
    },
  ],
}

export const characterDetailTour: TourDef = {
  id: 'character-detail',
  steps: [
    {
      target: 'user-profile',
      title: '用户人设',
      content: '告诉这个角色"你是谁、你们什么关系"（如：刚认识的网友 / TA 的青梅竹马）。强烈建议设置，角色对你的态度会完全不同。',
    },
    {
      target: 'send-message',
      title: '开始聊天',
      content: '点这里进入微信聊天。聊天页右上角菜单还能切换到「场景模式」——线下见面的小说式角色扮演。',
    },
  ],
}

export const chatTour: TourDef = {
  id: 'chat-single',
  steps: [
    {
      title: '微信聊天',
      content: '角色会像真人一样：分多条短消息回复、有打字节奏、会发表情包。你连发多条消息时，TA 会等你说完再回。右键/长按消息可复制、编辑、重发、删除。',
    },
    {
      target: 'chat-menu',
      title: '场景模式入口',
      content: '点右上角菜单 → 「切换到场景模式」：和角色线下见面，进行传统的小说式角色扮演（动作、神态、环境描写）。线上聊天和线下剧情的记忆是互通的。',
    },
  ],
}

export const groupCreateTour: TourDef = {
  id: 'group-create',
  steps: [
    {
      target: 'ai-group',
      title: 'AI 智能拉群',
      content: '推荐用法：直接说你想建什么群（如"建个公司同事群"），AI 自动挑选成员、起群名、写开场消息，在单卡模式下还会按需创造新配角。',
    },
    {
      title: '手动建群',
      content: '也可以在下方手动勾选成员（至少 2 人）。群里所有角色都由 AI 同时扮演，他们之间会互相聊天、互相调侃，不只是回复你。',
    },
  ],
}

export const sceneTour: TourDef = {
  id: 'scene',
  steps: [
    {
      title: '场景模式',
      content: '这里是和角色"线下见面"的舞台：用文字描写你的行动和对白，角色会以小说叙事风格回应（"引号"对白、*星号*动作）。',
    },
    {
      target: 'scene-time',
      title: '时间推进',
      content: '在输入中自然写出时间词（如"第二天早上""睡了一下午"）即可推进剧情时间；也可点顶部时间手动调整。线下发生的事会变成角色的回忆，回到微信聊天时 TA 记得。',
    },
  ],
}