# Android APK（Capacitor）

## 现在有什么

- `capacitor.config.ts`：应用名「笺页」，applicationId `com.jianyie.app`，`webDir: dist`；
- `android/`：Capacitor 生成的 Android 工程；
- 权限：录音、相机、图片/视频读取、通知；
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

## 注意

- WebView 里访问模型接口可能遇到 CORS，和浏览器不同；需要模型服务允许 `https://localhost` 或走代理；
- 麦克风、相册、文件的权限在首次使用时弹窗；
- 数据仍存在 WebView 的 IndexedDB 里；卸载 App 会丢，换机用「导出数据」；
- 修改网页后要重新 `pnpm build && cap sync android`，再重新打包；
- 图标和开屏图已经换成「笺页」原创素材；改图后重新 build/sync 即可。
