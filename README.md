# Q伴 / QPersona

> 看起来是 QQ，用起来也是 QQ —— 但好友列表里全都是 AI 角色。

一个本地优先的 AI 角色扮演客户端：以 QQ 为交互外壳，以 SillyTavern V2 角色卡为角色人格内核，
用聊天记录统计蒸馏来造角色。项目真正的技术含量不在 UI 复刻，而在**调度层**——
同一张角色卡在 QQ 短消息与酒馆叙事两种场景里共享设定与记忆，但注入不同的提示词。

- 开源、非商业，仅用于学习与技术演示
- 不连接真实 QQ 协议，不添加真实好友，所有数据存在本地
- 界面风格致敬 QQ，相关素材版权归腾讯所有

---

## 现在能做什么（v0.1.0 · Phase 0 + Phase 1）

| 模块 | 状态 |
| --- | --- |
| QQ 外壳：状态栏 / 消息列表 / 联系人 / 我的 / 底部导航 | ✅ |
| 单聊：流式回复、打字动画、时间分隔、错误气泡、QQ 短消息自动拆成多条 | ✅ |
| 酒馆角色卡导入（JSON / PNG 内嵌卡，V2 / V3 兼容）+ 预览 + 确认 | ✅ |
| 自定义新建角色（名字 / 简介 / 性格 / 开场白 / 兴趣标签） | ✅ |
| 双端：一个角色同时拥有 QQ 会话与酒馆会话，独立路由 `/tavern` | ✅ |
| AI 设置：多方案管理、7 个能力槽位、连接测试、功能开关 | ✅ |
| 深色模式、置顶、角色级开关、提示词预览 | ✅ |
| 聊天记录蒸馏（上传 → 解析 → 统计 → 两轮反馈） | 🚧 Phase 2 |
| 群聊（兴趣值 + 激活/屏蔽） | 🚧 Phase 3 |
| 记忆总结（memory_summary 槽位） | 🚧 Phase 3 |
| 语音消息 / WebRTC 通话 / 屏幕共享 | 🚧 Phase 4 |

首次打开会自动创建一个演示角色「林知夏」，可以直接点进去看聊天界面；
不配模型也能看到完整的 UI，发消息会提示你去 AI 设置里填接口。

---

## 快速开始

```bash
pnpm install
pnpm dev          # http://localhost:5173
pnpm build        # 产物在 dist/，可静态部署
pnpm typecheck
pnpm test:smoke   # 三组冒烟测试：核心逻辑 / Dexie 存储 / 假模型 SSE 端到端
```

手机和电脑在同一局域网时，可以 `pnpm dev` 后用手机访问电脑的 `http://<IP>:5173`。
数据存在浏览器 IndexedDB 里，换浏览器 / 清缓存 = 重置。

### 配置模型

1. 「我的 → AI 设置 → 添加模型方案」
2. 填 Base URL、API Key、模型名（面板里有 DeepSeek / OpenAI / 硅基流动 / Ollama 的快捷预设）
3. 点「测试」确认连通，再保存
4. 回到聊天，直接发消息

> 每个角色都可以在「角色资料」里覆盖槽位绑定；不填就用全局的。

---

## 架构：三层，但不过度抽象

```
src/
├─ core/                 # 与 UI 无关的领域层
│  ├─ types.ts           # 角色卡 / 会话 / 消息 / 槽位 / API 方案
│  ├─ card.ts            # parsecard 封装：V2/V3 + PNG 解析、导出、自定义建卡
│  ├─ prompt.ts          # ★ 调度层：qq_profile / tavern_profile 两套提示词
│  ├─ llm.ts             # OpenAI 兼容流式适配器（SSE）
│  ├─ db.ts              # Dexie / IndexedDB（characters / conversations / messages / profiles / kv）
│  ├─ avatar.ts          # 无资源头像（SVG dataURL）
│  ├─ demo.ts            # 内置演示角色
│  └─ util.ts
├─ store/                # Pinia：settings / contacts / chat
├─ ui/
│  ├─ chat/              # ChatPage · MessageItem · Composer
│  ├─ pages/             # 消息 / 联系人 / 我的 / 设置 / AI 设置 / 角色资料 / 酒馆
│  ├─ add/               # 添加好友（导入 / 新建 / 蒸馏入口）
│  ├─ common/            # StatusBar / Avatar / BottomSheet / Toast
│  └─ shell/             # BottomNav
└─ styles/base.css       # 设计变量 + 通用组件样式
```

**交互层**（`ui/`）只发事件、只渲染数据，不知道模型是什么。
**调度层**（`store/chat.ts` + `core/prompt.ts`）决定这条消息发给谁、用哪个 profile、注入哪些记忆。
**能力层**（`core/llm.ts`）只负责把 token 吐出来，不关心自己是 GPT 还是 DeepSeek。

---

## 关键设计决策（记录理由）

1. **技术栈 Vue 3 + Vite + Pinia + Dexie**：参考资源几乎都是 Vue 生态；纯前端 + IndexedDB
   可以做到「打开网页就能用」，不需要跑后端进程。后续若要接 SQLite / 本地服务，`core/db.ts` 是唯一要换的地方。

2. **消息渲染层复用 [fake-qq-ui](https://github.com/Redlnn/FakeQQ-UI)**，外壳（列表 / 导航 / 设置 / 添加页）自建。
   气泡颜色、暗色变量、后续的语音/文件/转发消息都能直接沿用，避免手写一套 QQ 气泡 CSS。
   仅引入其构建好的 CSS，再按手机尺寸覆盖 `--qq-avatar_size_2` 等变量。

3. **角色卡解析用 [parsecard](https://www.npmjs.com/package/parsecard)**（零依赖、浏览器可用），
   自动兼容 V2 / V3 与 PNG `tEXt` 内嵌卡，不自己手写兼容逻辑。项目自有字段写入 `extensions.qpersona`，
   导出时能原样 round-trip。

4. **会话（Conversation）携带 `profile`**：同一角色在 QQ 端和酒馆端是两条会话，但共用一张角色卡。
   提示词不塞进同一个 system prompt 让模型自己判断——调度层在组装请求时二选一，避免模型在 QQ 里滑回酒馆腔。

5. **QQ 端回复自动拆气泡**：模型一次回多行时，按行拆成 2~4 条消息、间隔 220ms 依次出现；
   太长（>70 字/行）或行数过多则保持一条，避免刷屏。

6. **hash 路由**：`/#/tavern` 在任何静态托管（GitHub Pages、本地文件）都不会 404，同时保留独立路由语义。

7. **头像零资源**：没有立绘时按名字哈希生成 SVG 渐变头像，离线可用、颜色稳定。
   PNG 角色卡则直接压到 320px 后作为头像存本地。

8. **未配置模型时不阻塞 UI**：发送后会出现一条错误气泡引导去 AI 设置，而不是弹窗打断。

---

## 数据模型

角色卡以 SillyTavern V2 为基线（`name / description / personality / scenario / first_mes /
mes_example / system_prompt / post_history_instructions / alternate_greetings / character_book / tags …`），
项目扩展放在：

```ts
ext: {
  qq: { qqNumber, nickname, signature, avatar, interests[], aliases[] },
  prompts: { qq?, tavern? },        // 自定义提示词，留空用内置模板
  routing: { [slot]: apiProfileId }, // 角色级模型覆盖
  toggles: { chat, memory },         // 主对话 / 记忆总结开关
  origin: 'import' | 'custom' | 'distill',
}
```

消息表按 `conversationId + ts` 排序；会话列表按置顶 + 最近时间排序。

---

## 路线图

- **Phase 2 · 蒸馏与双端打磨**
  - `.txt` 聊天记录解析（`---- 2023-11-18 ----` / `[17:03:21] 昵称：内容`），部分匹配时提示「已识别 X 条，Y 行未识别」
  - 统计语感：句长、标点、口头禅、活跃时段、高频原话
  - 草稿 → 用户判断 → 建议 → 修改 → 再建议 → 定稿的两轮向导
  - 酒馆端更长上下文与叙事排版
- **Phase 3 · 群聊与记忆**
  - 兴趣值 + 激活/屏蔽调度（硬触发：@ / 叫名字；软触发：兴趣标签匹配）
  - 6 类记忆 + 独立 `memory_summary` 槽位，异步串行写入
  - 记忆召回（关键词 + importance），注入位置在 system 之后、历史之前
- **Phase 4 · 语音与插件**
  - TTS / STT 先做半双工语音消息
  - WebRTC 通话与屏幕共享复用开源方案，项目只写 ASR → LLM → TTS 串联

---

## 免责声明

本项目为个人学习与技术演示项目，不提供任何真实 QQ 服务，不涉及腾讯服务器。
界面中的 QQ 相关视觉元素版权归腾讯所有，本项目不用于商业用途。角色卡与对话内容由使用者自行负责。
