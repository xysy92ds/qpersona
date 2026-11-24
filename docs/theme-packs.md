# 主题包

## 是什么

笺页的主题包是一个 JSON 文件，里面存：

```json
{
  "app": "qpersona-theme",
  "version": 1,
  "theme": "light",
  "appearance": {
    "fontScale": "normal",
    "bubble": "sakura",
    "textStyle": "default",
    "chatBackground": "data:image/jpeg;base64,..."
  }
}
```

包含：浅色/深色、字号、气泡配色、气泡文字字体、聊天背景（图片以 dataURL 内嵌）。
「设置 → 外观 → 导出主题 / 导入主题」即可分享或换回来。

## 为什么不直接导入外部主题包

不同聊天软件的主题包是私有格式，结构、加密和资源组织都不公开；其中的素材、字体、图标
也可能有独立授权。笺页不做私格式解析，避免兼容和维护风险。

**能做的**：把外部主题里的背景图另存为图片，在「设置 → 外观 → 聊天背景」上传，
或者作为个人/角色主页封面使用。

## 导入失败

- 只接受 `app: "qpersona-theme"` 的 JSON；
- 图片内嵌在文件里，包可能较大（几 MB），属于正常；
- 导入只改外观，不动角色、聊天记录和 API 配置。
