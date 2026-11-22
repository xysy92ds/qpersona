# 视频通话与屏幕共享：选型调研（2026-11）

> 结论先行：**和 AI 通话不需要 WebRTC**。本地采集 + 截帧 + 现有 `stt` / `tts` / `vision` 槽位就能做，
> 不引入服务器和依赖。只有「和另一个真人通话」才需要 WebRTC；那时优先 LiveKit，其次 PeerJS。

## 1. 先拆成三个需求

| 需求 | 是否有第二个真人 | 需要 WebRTC 吗 |
| --- | --- | --- |
| 和 AI 语音/视频通话 | 没有 | 不需要 |
| 让 AI 看你的屏幕 | 没有 | 不需要（截帧即可） |
| 和另一台设备/真人视频、共享屏幕 | 有 | 需要 |

项目现在是本地优先、单人使用，所以前两个先做，第三个作为可选项。

## 2. 和 AI 视频通话

### 现实约束

- 现在的文本模型（DeepSeek）不支持实时视频；
- 浏览器可以拿到摄像头，但「连续视频理解」既贵又慢；
- 真正影响体验的是**语音延迟**，不是画面帧率。

### 方案 A：本地链路（推荐第一版）

```
摄像头预览（本地，不上传）
麦克风 → PTT/VAD → STT → 文本模型 → TTS → 播放
每 8~10 秒截一帧 → vision 槽位 → 注入一句「[画面：……]」
```

- 视频画面只用来给角色「看一眼」，不是实时理解；
- 用户能看到自己的画面和「TA 正在看」的提示；
- 不依赖任何 RTC 库，现有 `getUserMedia` + canvas + `describeImage()` 就够；
- 成本可控：截帧频率、通话时长都能设上限。

### 方案 B：OpenAI Realtime API（可选）

官方提供 WebRTC 接入的实时语音对话，支持 VAD、打断、低延迟语音到语音。
适合「像打电话一样和 AI 说话」，但：

- 只对 OpenAI 模型有效，DeepSeek 用不了；
- 需要先创建 Realtime session（本地应用可以直接用本地 Key 换临时凭证）；
- 单价明显高于「STT + 文本 + TTS」；
- 仍然不解决视频理解。

> 建议：把它做成 `stt`/`tts` 之外的**第三种语音适配器**，等基础通话跑通再考虑。
> 文档：<https://developers.openai.com/zh-Hans/api/docs/guides/realtime>

## 3. 屏幕共享

### 和 AI 共享

```js
const stream = await navigator.mediaDevices.getDisplayMedia({ video: true })
// 隐藏 <video> 播放，定时 drawImage 到 canvas → JPEG dataURL → vision 槽位
```

- 默认 8 秒一帧，或用户点「让 TA 看看」时截一帧；
- 压缩到 1280px / JPEG 0.72 再发；
- 结果以 `[屏幕：……]` 注入对话；
- 常驻「正在共享」提示，随时停止；不录像、不落盘原图。
- 浏览器 API：<https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getDisplayMedia>

### 和真人共享

`getDisplayMedia` 拿到的视频轨可以直接 `addTrack` 到 WebRTC 连接，不需要额外库。
选型见下。

## 4. 真人通话：LiveKit vs PeerJS

| | LiveKit | PeerJS |
| --- | --- | --- |
| 架构 | SFU（服务端转发） | P2P |
| 依赖 | 自建/Cloud + Token 服务 | PeerServer 信令（可用公共或自建） |
| 多人 | 原生支持 | 适合 1:1 |
| 屏幕共享 | SDK 内置 `setScreenShareEnabled` | 自己替换 track / 重协商 |
| 断线重连 | 内置 | 自己处理 |
| 包体积 | 较大（`livekit-client`） | 小 |
| 适用 | 群通话、屏幕共享、录制、AI Agent 入会 | 1:1 演示、无后端 |

- LiveKit 文档：<https://docs.livekit.io/intro/basics/connect/>，屏幕共享：<https://docs.livekit.io/transport/media/screenshare/>
- PeerJS 文档：<https://peerjs.com/client/getting-started>

**推荐**：

- 如果只做「两台设备 1:1 打个视频」，用 PeerJS，几行代码，公共 PeerServer 就能跑；
- 如果以后要群通话、录制、AI 作为第三方入会，直接上 LiveKit，别在 PeerJS 上叠功能；
- 两者都需要 TURN 才能保证跨网络可用，纯 P2P 在移动网络下成功率有限。

## 5. 落到项目里的结构

```
src/core/rtc/
├─ types.ts        # CallProvider 接口：join/leave/toggleMic/toggleCam/shareScreen
├─ local-ai.ts     # AI 通话：本地采集 + 截帧 + 现有槽位（无 WebRTC）
├─ peer.ts         # PeerJS 1:1（可选）
└─ livekit.ts      # LiveKit（可选，需要 token 接口）
```

UI 只有一个 `CallOverlay.vue`：通话计时、麦克风/摄像头/屏幕共享/挂断，切换 provider 即可。

## 6. 建议的落地顺序

1. **AI 语音通话（PTT）**：复用语音消息的 MediaRecorder，加 `stt` / `tts` 槽位；
2. **AI 视频通话**：本地摄像头预览 + 每 10 秒截帧给 vision，告诉角色「看到了什么」；
3. **AI 屏幕共享**：`getDisplayMedia` + 截帧，和视频共用一条「视觉帧 → 描述 → 注入」管线；
4. **真人 1:1**：PeerJS 试水；需要多人再换 LiveKit；
5. 全双工/打断/降噪：最后做，别在第一版追求。

## 7. 别踩的坑

- 浏览器要求 `getUserMedia` / `getDisplayMedia` 必须由用户手势触发；
- 屏幕共享在移动端支持很差（iOS Safari 基本不可用），桌面端优先；
- 不落盘原始视频/屏幕帧；只保留文字描述；
- WebRTC 需要 HTTPS 或 localhost，部署时注意；
- 公共 PeerServer 不适合长期使用，生产要自建或换 LiveKit。

> 一起看视频不属于通话：用字幕时间轴比连续视觉便宜得多，见 [watch-together.md](watch-together.md)。
