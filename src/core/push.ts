import { Capacitor, registerPlugin } from '@capacitor/core'
import { LocalNotifications } from '@capacitor/local-notifications'

/**
 * 不依赖 FCM 的 Android 后台真人消息通知。
 *
 * <p>Android 侧由原生前台服务常驻（每 25 秒调一次 {@code /api/dm/poll}），App 退到后台
 * 或 WebView 定时器被系统冻结后仍能弹好友消息通知；token 由这里写入原生
 * SharedPreferences，原生不再依赖 WebView 是否活着。</p>
 *
 * <p>用法（App 登录后调用，退出登录时 stop；网页/非 Android 平台是安全的 no-op）：</p>
 *
 * ```ts
 * import { start, stop } from '@/core/push'
 *
 * if (cloud.loggedIn) void start({ token: cloud.token, baseUrl: settings.cloudUrl })
 * else void stop()
 * ```
 *
 * <p>完整说明见 docs/capacitor.md「后台真人消息通知」。</p>
 */

/** 默认云端地址，与 src/store/settings.ts 的 DEFAULTS.cloudUrl 一致；不要用 workers.dev 旧域名 */
export const DEFAULT_CLOUD_URL = 'https://jianyie.pages.dev'

/** 原生服务的轮询间隔（毫秒），与 DmPollService.POLL_INTERVAL_MS 保持一致 */
export const POLL_INTERVAL_MS = 25_000

export interface DmPushAuth {
  /** 云端登录 token，取自 localStorage 的 jianyie.cloud.token */
  token: string
  /** 云端 API 地址，缺省用 https://jianyie.pages.dev */
  baseUrl?: string
}

export type DmPushNotificationPermission = 'granted' | 'denied' | 'unknown'

export interface DmPushStatus {
  /** 当前平台是否有原生实现（仅 Android） */
  supported: boolean
  /** 原生前台服务是否正在运行 */
  running: boolean
  /** 用户是否开启过后台消息通知（原生持久化，退出登录会被清掉） */
  enabled?: boolean
  /** 原生侧是否已保存 token */
  hasAuth?: boolean
  /** 原生实际使用的云端地址 */
  baseUrl?: string
  /** 原生侧的 poll since 时间戳（诊断用） */
  since?: number
  /** 轮询间隔（毫秒） */
  intervalMs?: number
  /** 最近一次原生轮询的错误（诊断用） */
  lastError?: string
  /** Android 13+ 通知权限状态 */
  notificationPermission?: DmPushNotificationPermission
}

interface DmPushNativePlugin {
  start(options: { token: string; baseUrl: string }): Promise<DmPushStatus>
  stop(): Promise<{ running?: boolean } | void>
  setAuth(options: { token: string; baseUrl: string }): Promise<DmPushStatus>
  getStatus(): Promise<DmPushStatus>
}

/** 原生插件：android/app/src/main/java/com/jianyie/app/push/DmPushPlugin.java */
const native = registerPlugin<DmPushNativePlugin>('DmPush')

const WEB_STATUS: DmPushStatus = { supported: false, running: false }

/** 只有 Android 原生壳支持；浏览器 / PWA 上是 no-op */
export function isSupported(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android'
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  if (typeof error === 'string') return error
  return '后台消息服务调用失败'
}

/** 规范化云端地址：空值 / 旧 workers.dev 域名 / 非法 scheme 一律回落到默认地址 */
export function normalizeBaseUrl(baseUrl?: string): string {
  const raw = (baseUrl || '').trim()
  if (!raw || raw.includes('workers.dev')) return DEFAULT_CLOUD_URL
  if (!/^https?:\/\//i.test(raw)) return DEFAULT_CLOUD_URL
  return raw.replace(/\/+$/, '')
}

/**
 * Android 13+ 需要 POST_NOTIFICATIONS 才能看到通知。
 * App.vue 启动时已经申请过一次；这里只做兜底，被拒绝也不阻止服务运行
 * （前台服务照跑，只是通知栏不可见，用户之后可在系统设置里打开）。
 */
export async function ensureNotificationPermission(): Promise<DmPushNotificationPermission> {
  if (!isSupported()) return 'unknown'
  try {
    const current = await LocalNotifications.checkPermissions()
    if (current.display === 'granted') return 'granted'
    if (current.display === 'prompt' || current.display === 'prompt-with-rationale') {
      const asked = await LocalNotifications.requestPermissions()
      return asked.display === 'granted' ? 'granted' : 'denied'
    }
    return 'denied'
  } catch {
    return 'unknown'
  }
}

/**
 * 保存登录凭证并启动常驻前台服务。
 *
 * <p>幂等：重复调用只会刷新 token / baseUrl，不会重复起服务。
 * 必须在 App 处于前台时调用（Android 12+ 不允许后台启动前台服务），
 * 推荐在登录成功 / App 启动时调用。</p>
 */
export async function start(auth: DmPushAuth): Promise<DmPushStatus> {
  if (!isSupported()) return { ...WEB_STATUS }

  const token = (auth?.token || '').trim()
  const baseUrl = normalizeBaseUrl(auth?.baseUrl)
  if (!token) {
    return { supported: true, running: false, hasAuth: false, baseUrl, lastError: '还没有登录云端账号' }
  }

  const notificationPermission = await ensureNotificationPermission()
  try {
    const status = await native.start({ token, baseUrl })
    return {
      ...status,
      supported: true,
      baseUrl: status?.baseUrl || baseUrl,
      notificationPermission: status?.notificationPermission || notificationPermission,
    }
  } catch (error) {
    return {
      supported: true,
      running: false,
      hasAuth: true,
      baseUrl,
      notificationPermission,
      lastError: errorMessage(error),
    }
  }
}

/** 停止轮询并移除常驻通知（退出登录 / 用户关闭通知时调用） */
export async function stop(): Promise<void> {
  if (!isSupported()) return
  try {
    await native.stop()
  } catch {
    // 服务已经停了或系统不允许，忽略
  }
}

/**
 * 只更新凭证，不动服务：token 刷新、切换云端地址、换账号时调用。
 * 服务运行中会在下一轮轮询自动读取新 token。
 */
export async function setAuth(auth: DmPushAuth): Promise<DmPushStatus> {
  if (!isSupported()) return { ...WEB_STATUS }
  const token = (auth?.token || '').trim()
  if (!token) {
    await stop()
    return { supported: true, running: false, hasAuth: false }
  }
  const baseUrl = normalizeBaseUrl(auth?.baseUrl)
  try {
    const status = await native.setAuth({ token, baseUrl })
    return { ...status, supported: true, baseUrl: status?.baseUrl || baseUrl }
  } catch (error) {
    return { supported: true, running: false, hasAuth: true, baseUrl, lastError: errorMessage(error) }
  }
}

/** 查询原生服务状态（诊断 / 设置页显示用）；非 Android 恒为未支持 */
export async function getStatus(): Promise<DmPushStatus> {
  if (!isSupported()) return { ...WEB_STATUS }
  try {
    const status = await native.getStatus()
    return { ...status, supported: true }
  } catch (error) {
    return { supported: true, running: false, lastError: errorMessage(error) }
  }
}

export const dmPush = {
  isSupported,
  start,
  stop,
  setAuth,
  getStatus,
  ensureNotificationPermission,
  normalizeBaseUrl,
  DEFAULT_CLOUD_URL,
  POLL_INTERVAL_MS,
}

export default dmPush
