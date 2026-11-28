# Android APK（Capacitor）

## 现在有什么

- `capacitor.config.ts`：应用名「笺页」，applicationId `com.jianyie.app`，`webDir: dist`；
- `android/`：Capacitor 生成的 Android 工程；
- 权限：录音、相机、图片/视频读取、通知、前台服务（dataSync）；
- 后台真人好友消息通知：原生前台服务轮询，不依赖 FCM，见下文
  「[后台真人消息通知（不依赖 FCM）](#后台真人消息通知不依赖-fcm)」；
- GitHub Actions 会自动构建 debug APK，产物在 Actions 的 Artifacts 里。

## 本地构建

需要 JDK 21 + Android SDK，然后：

```bash
pnpm install
pnpm build
pnpm cap:sync
pnpm cap:open android   # 用 Android Studio 打开
pnpm cap:apk            # 或者直接 ./gradlew assembleDebug
```

APK 路径：`android/app/build/outputs/apk/debug/app-debug.apk`。

## 用 GitHub Actions 构建

推送到 `main` 后，Actions → Build Android APK → 下载 `jianyie-debug-apk`。
这是 debug 包，可以直接装；上架/长期分发需要自己生成签名 keystore，不要把它提交进仓库。

## 原生能力

- 语音识别使用系统 `SpeechRecognizer`（不依赖 WebView 的 Web Speech API）；
- 状态栏由应用自己绘制，Android 壳启动后会隐藏系统状态栏；
- 录音/相机权限在首次使用时弹窗。

## 固定签名

`android/app/debug.p12` 是固定的 debug keystore（别名/密码 `jianyie-debug`），
Android workflow 每次都用它签名，所以后续升级可以直接覆盖安装，不用每次卸载。

- 只用于 debug；正式分发请另生成 release keystore，不要把这个密码用于上架；
- 第一次从旧的临时签名版本换到这个 key，仍然需要卸载一次；之后不需要；
- 如果 keystore 丢失，签名会变，又需要卸载重装。

## 后台真人消息通知（不依赖 FCM）

国内设备普遍没有 Google Play 服务，FCM 不可用，所以真人好友消息的后台提醒走
「原生前台服务 + HTTPS 轮询」：

- 网页层登录云端后调用 `start({ token, baseUrl })`（`src/core/push.ts`），
  原生插件把凭证写进 SharedPreferences，并启动 `DmPollService`；
- 服务用 `startForeground()` 挂一条低优先级常驻通知，每 **25 秒**请求
  `GET https://jianyie.pages.dev/api/dm/poll?since=<last>`，
  请求头 `Authorization: Bearer <token>`；
- 接口返回 `{ items: [{ id, senderName, text, createdAt }], now }`，有新消息就弹本地通知，
  同时把 `since` 和最近 200 条「已通知过的消息 id」持久化，进程被杀后重启不会重复提醒；
- App 在前台时服务只推进 `since`、不弹通知：Android 端 `src/store/human.ts` 已经不再发网页层
  本地通知（避免和原生服务重复），所以 App 打开着的时候好友消息只更新会话和未读数、不弹系统通知，
  正在聊天时不会被自己已经看到的消息打扰；退到后台 / 被划掉后由原生服务提醒。

### 文件

| 文件 | 作用 |
| --- | --- |
| `android/app/src/main/java/com/jianyie/app/push/DmPollService.java` | 常驻前台服务、轮询、弹通知、since/去重持久化 |
| `android/app/src/main/java/com/jianyie/app/push/DmPushPlugin.java` | Capacitor 插件 `DmPush`：`start` / `stop` / `setAuth` / `getStatus` |
| `android/app/src/main/java/com/jianyie/app/push/DmPushPrefs.java` | 原生 SharedPreferences 存取（token、baseUrl、since、最近 id） |
| `android/app/src/main/java/com/jianyie/app/push/DmPushState.java` | App 前后台可见状态（前台不弹原生通知） |
| `android/app/src/main/java/com/jianyie/app/MainActivity.java` | 注册 `DmPushPlugin`，`onResume`/`onPause` 维护可见状态 |
| `android/app/src/main/res/drawable/ic_stat_dm.xml` | 通知栏单色小图标 |
| `src/core/push.ts` | 网页层封装：`registerPlugin` + Android 判断 + Web/浏览器 no-op |
| `android/app/src/main/AndroidManifest.xml` | 前台服务权限与 `DmPollService` 声明 |

### 网页层接口（src/core/push.ts）

```ts
import { start, stop, setAuth, getStatus, isSupported } from '@/core/push'

// 登录成功 / App 启动且已登录：保存 token 并启动常驻服务
await start({ token: cloud.token, baseUrl: settings.cloudUrl })

// 退出登录：停服务并移除常驻通知
await stop()

// token 刷新 / 切账号 / 换云端地址（不动服务，下一轮轮询生效）
await setAuth({ token: cloud.token, baseUrl: settings.cloudUrl })

// 诊断：{ supported, running, enabled, since, lastError, notificationPermission, ... }
const status = await getStatus()
```

- 接口本身**幂等**：重复 `start()` 只刷新凭证，不会重复起服务；
- `isSupported()` 只在 Android 原生壳返回 `true`，浏览器 / PWA / iOS 上所有调用都是安全 no-op；
- 必须在 App 处于前台时 `start()`（登录时调用即可）。**不要**在
  `visibilitychange` 里启动：Android 12+ 禁止后台启动前台服务，退到后台那一刻再启动会被系统拒绝；
- 退出登录务必 `stop()`，否则服务会继续用旧 token 轮询（401 时服务自己也会停并提示重新登录）。

### 权限与系统配置

- Manifest 权限：`FOREGROUND_SERVICE`、`FOREGROUND_SERVICE_DATA_SYNC`、`POST_NOTIFICATIONS`、`INTERNET`；
  （`INTERNET` / `POST_NOTIFICATIONS` 原有，这次新增前两个）
- `<service android:name=".push.DmPollService" android:foregroundServiceType="dataSync"
  android:stopWithTask="false" android:exported="false" />`
- Android 13+ 通知权限：`App.vue` 启动时已通过 `@capacitor/local-notifications` 申请；
  `push.start()` 里还会 check/request 兜底。即使被用户拒绝，服务仍会运行（只是通知栏不可见），
  下次可在系统设置里打开。

### 通知通道

- 好友消息通知**复用** `@capacitor/local-notifications` 的 `default` 通道；如果原生服务先于
  WebView 插件启动（进程被系统重启），会按相同参数补建该通道，不会影响插件已建的通道；
- 常驻通知使用单独的低优先级通道 `jianyie-dm-service`（无声、不显示角标），
  用户可以在系统设置里只关掉常驻通知而不影响消息提醒；
- 通知 id 与网页层 `human.poll()` 的算法对齐（`"dm_" + id` 的字符串 hash），同一条消息即使两边
  都提醒，也是替换同一条通知，而不是并列两条。

### 耗电与流量

- 每 25 秒一次 HTTPS 轮询：一天约 3456 次请求；无新消息时响应很小（不到 1KB），
  流量可以忽略，但**待机耗电会明显高于纯 FCM 推送**（FCM 设备上是长连接 + 系统统一调度）。
- 想省电可把 `DmPollService.POLL_INTERVAL_MS` 调大（比如 60 秒），代价是提醒变慢；
  不要低于 20 秒，否则耗电和服务被系统限制的概率都会上升。
- 这是本地通知，不需要服务器推送通道、不需要 `google-services.json`。

### 系统限制（重要）

- **Android 15（API 35）起，`dataSync` 前台服务每 24 小时最多运行 6 小时**，超时后系统回调
  `onTimeout()`：服务会自动停止、`enabled` 置为 false，并弹一条「后台消息通知已暂停」通知；
  用户下次打开 App 时 `start()` 会恢复。`targetSdk = 36`，所以这个限制一定会生效。
- **Android 12+ 不允许从后台启动前台服务**：只能在 App 前台（登录 / 启动）时 `start()`。
  用户从最近任务划掉 App 后，`stopWithTask="false"` + `START_STICKY` 会让系统尽量保留 / 重启服务；
  但被系统或 OEM 强杀后不保证自动恢复，**重新打开 App 是最可靠的方式**。
- **深度 Doze / 长时间息屏静止**：系统会延后所有 App 的网络请求（包括前台服务），提醒可能延迟到
  下次唤醒；这是轮询方案比系统级推送（FCM）弱的根本原因。
- **开机后不会自动启动**（没有用 `BOOT_COMPLETED`，Android 14+ 对开机启动 dataSync 前台服务也有
  限制）：重启手机后需要打开一次 App。
- 用户在系统设置里「强行停止」App 后，服务会被禁止，直到再次打开 App。

### OEM 后台限制（真机需手动放行）

各家的省电策略会直接杀进程，需要给「笺页」放行（不同 ROM 版本菜单名略有差异）：

- **小米 / Redmi（MIUI / HyperOS）**：设置 → 应用 → 笺页 → 省电策略 → 无限制；并允许自启动；
- **华为 / 荣耀（EMUI / HarmonyOS）**：应用启动管理 → 笺页 → 手动管理（允许自启动 / 关联启动 / 后台活动）；
- **OPPO / 一加（ColorOS）**：应用管理 → 笺页 → 耗电管理 → 允许完全后台行为；
- **vivo / iQOO（OriginOS）**：电池 → 后台耗电管理 → 允许后台高耗电；
- **三星**：电池 → 后台使用限制 → 把笺页加入「未监视的应用」；
- 通用：允许通知、关闭省电模式 / 超级省电；部分 ROM 还需要在最近任务里「锁定」笺页。

### 怎么验证

1. 装 debug 包并登录云端：通知栏应出现常驻通知「笺页 · 后台接收好友消息」；
2. 用另一个账号给本账号发一条好友消息：App 在前台时由网页层提醒，退到后台后 20~30 秒内由原生服务提醒；
3. 把 App 退到后台 / 从最近任务划掉，再发消息，应在 20~30 秒内弹通知；
4. 排查：
   - `adb shell dumpsys activity services com.jianyie.app | grep -A2 DmPollService` 看服务是否在跑；
   - `adb logcat -s JianyieDmPush` 看轮询日志；
   - 设置页/诊断可调 `getStatus()`，返回 `running`、`since`、`lastError`、`notificationPermission`。

### 已知限制

- **真机未测**：构建产物来自 GitHub Actions（`.github/workflows/android.yml`）或本地命令行构建，
  尚未装到真机上验证通知、后台存活与各 OEM 行为；OEM 放行方式见上一节。
- 前台不弹系统通知：Android 端 `human.poll()` 已关闭网页层本地通知，原生服务在 App 可见时也只推进
  `since`，所以 App 打开着时收到好友消息只更新会话 / 未读，不弹通知；回到前台时网页层会按自己的
  `since` 重新拉取后台期间的消息入库，不会重复提醒。
- 原生通知只有文字，点按只能打开 App 首页，不能直达对应会话（会话 id 由 WebView 侧生成，原生拿不到）；
  需要直达的话得在 App.vue / ChatPage 里把「当前会话」通知给原生，再加 PendingIntent 参数。
- App 在前台时服务照常轮询（静默只推进 since），流量和耗电轻微增加；不建议在
  `visibilitychange` 里 stop/start（后台启动前台服务会被 Android 12+ 拦截）。

## 注意

- WebView 里访问模型接口可能遇到 CORS，和浏览器不同；需要模型服务允许 `https://localhost` 或走代理；
- 麦克风、相册、文件的权限在首次使用时弹窗；
- 数据仍存在 WebView 的 IndexedDB 里；卸载 App 会丢，换机用「导出数据」；
- 修改网页后要重新 `pnpm build && cap sync android`，再重新打包；
- 图标和开屏图已经换成「笺页」原创素材；改图后重新 build/sync 即可。
