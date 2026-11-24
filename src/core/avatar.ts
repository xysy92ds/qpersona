import type { Character } from './types'
import { charGlyph, hashHue } from './util'

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/**
 * 用 SVG 生成默认头像：零资源、离线可用、每个名字颜色稳定。
 * 角色卡带 PNG 立绘时优先用立绘。
 */
export function avatarSvg(name: string): string {
  const hue = hashHue(name || 'q')
  const glyph = esc(charGlyph(name || '?'))
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="240" height="240" viewBox="0 0 240 240">
<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
<stop offset="0" stop-color="hsl(${hue},82%,70%)"/><stop offset="1" stop-color="hsl(${(hue + 42) % 360},74%,50%)"/>
</linearGradient></defs>
<rect width="240" height="240" fill="url(#g)"/>
<circle cx="196" cy="44" r="56" fill="rgba(255,255,255,0.16)"/>
<circle cx="36" cy="212" r="48" fill="rgba(0,0,0,0.06)"/>
<text x="120" y="150" font-size="102" font-weight="600" fill="#ffffff" text-anchor="middle"
 font-family="-apple-system,BlinkMacSystemFont,'PingFang SC','Noto Sans SC',sans-serif">${glyph}</text>
</svg>`
  // 气泡组件用未加引号的 CSS url() 设置头像，括号会截断 URL，必须一起转义
  const encoded = encodeURIComponent(svg)
    .replace(/\(/g, '%28')
    .replace(/\)/g, '%29')
    .replace(/'/g, '%27')
  return `data:image/svg+xml;charset=utf-8,${encoded}`
}

export function characterAvatar(ch?: Character): string {
  if (!ch) return avatarSvg('?')
  return ch.ext.qq.avatar || avatarSvg(ch.card.name)
}
