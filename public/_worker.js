/**
 * Cloudflare Pages 高级模式：/api/* 转到 Worker，其余走静态资源。
 * 这样网页和 APK 都只需要访问 jianyie.pages.dev，不依赖 workers.dev 的连通性。
 */
const API_ORIGIN = 'https://jianyie-api.jianyie.workers.dev'

export default {
  async fetch(request, env) {
    const url = new URL(request.url)
    if (url.pathname.startsWith('/api/')) {
      const target = new URL(url.pathname + url.search, API_ORIGIN)
      const headers = new Headers(request.headers)
      headers.delete('host')
      const init = {
        method: request.method,
        headers,
        body: request.method === 'GET' || request.method === 'HEAD' ? undefined : request.body,
        redirect: 'manual',
      }
      const res = await fetch(target.toString(), init)
      return new Response(res.body, { status: res.status, statusText: res.statusText, headers: res.headers })
    }
    return env.ASSETS.fetch(request)
  },
}
