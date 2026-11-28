package com.jianyie.app.push;

import android.content.Context;
import android.content.SharedPreferences;

import java.util.Iterator;
import java.util.LinkedHashSet;

/**
 * 后台好友消息轮询用到的原生持久化（SharedPreferences）。
 *
 * <p>token / baseUrl 由网页层通过 {@link DmPushPlugin} 写入；since、last_poll_at、
 * 最近通知过的消息 id 只保存在原生侧，保证进程被杀后重新拉起时不重复弹通知。</p>
 *
 * <p>字段对应 JS 传参见 src/core/push.ts：token 来自 localStorage 的
 * {@code jianyie.cloud.token}，baseUrl 来自设置里的云端地址。</p>
 */
final class DmPushPrefs {

    private static final String FILE = "jianyie_dm_push";

    private static final String KEY_TOKEN = "token";
    private static final String KEY_BASE_URL = "base_url";
    private static final String KEY_ENABLED = "enabled";
    private static final String KEY_SINCE = "since";
    private static final String KEY_LAST_POLL_AT = "last_poll_at";
    private static final String KEY_LAST_ERROR = "last_error";
    private static final String KEY_RECENT_IDS = "recent_ids";

    /** 与 src/store/settings.ts 的 DEFAULTS.cloudUrl 保持一致；不要用 workers.dev 域名 */
    static final String DEFAULT_BASE_URL = "https://jianyie.pages.dev";

    /** 最多记住多少条已经弹过通知的消息 id，用于防重复 */
    private static final int RECENT_LIMIT = 200;
    private static final int ERROR_LIMIT = 300;

    private DmPushPrefs() {}

    private static SharedPreferences prefs(Context context) {
        return context.getSharedPreferences(FILE, Context.MODE_PRIVATE);
    }

    /** 规范化云服务地址：只接受 http(s)，去掉末尾斜杠，workers.dev 旧域名回落到默认地址。 */
    static String normalizeBaseUrl(String raw) {
        String value = raw == null ? "" : raw.trim();
        if (value.isEmpty() || value.contains("workers.dev")) return DEFAULT_BASE_URL;
        if (!value.startsWith("https://") && !value.startsWith("http://")) return DEFAULT_BASE_URL;
        while (value.endsWith("/")) value = value.substring(0, value.length() - 1);
        return value;
    }

    static String token(Context context) {
        String value = prefs(context).getString(KEY_TOKEN, "");
        return value == null ? "" : value;
    }

    static String baseUrl(Context context) {
        return normalizeBaseUrl(prefs(context).getString(KEY_BASE_URL, DEFAULT_BASE_URL));
    }

    static boolean hasAuth(Context context) {
        return !token(context).isEmpty();
    }

    static void setAuth(Context context, String token, String baseUrl) {
        prefs(context)
                .edit()
                .putString(KEY_TOKEN, token == null ? "" : token.trim())
                .putString(KEY_BASE_URL, normalizeBaseUrl(baseUrl))
                .apply();
    }

    static boolean enabled(Context context) {
        return prefs(context).getBoolean(KEY_ENABLED, false);
    }

    static void setEnabled(Context context, boolean enabled) {
        prefs(context).edit().putBoolean(KEY_ENABLED, enabled).apply();
    }

    static long since(Context context) {
        return prefs(context).getLong(KEY_SINCE, 0L);
    }

    static void setSince(Context context, long since) {
        prefs(context).edit().putLong(KEY_SINCE, Math.max(0L, since)).apply();
    }

    static long lastPollAt(Context context) {
        return prefs(context).getLong(KEY_LAST_POLL_AT, 0L);
    }

    static void setLastPollAt(Context context, long at) {
        prefs(context).edit().putLong(KEY_LAST_POLL_AT, Math.max(0L, at)).apply();
    }

    static String lastError(Context context) {
        String value = prefs(context).getString(KEY_LAST_ERROR, "");
        return value == null ? "" : value;
    }

    static void setLastError(Context context, String message) {
        String value = message == null ? "" : message.trim();
        if (value.length() > ERROR_LIMIT) value = value.substring(0, ERROR_LIMIT);
        prefs(context).edit().putString(KEY_LAST_ERROR, value).apply();
    }

    /**
     * 记录一条已经弹过通知的消息 id。
     *
     * @return true 表示第一次见到（可以弹通知），false 表示重复消息
     */
    static synchronized boolean rememberId(Context context, String id) {
        if (id == null || id.isEmpty()) return false;
        SharedPreferences sp = prefs(context);
        LinkedHashSet<String> ids = new LinkedHashSet<>();
        String raw = sp.getString(KEY_RECENT_IDS, "");
        if (raw != null && !raw.isEmpty()) {
            for (String part : raw.split(",")) {
                if (!part.isEmpty()) ids.add(part);
            }
        }
        if (!ids.add(id)) return false;
        while (ids.size() > RECENT_LIMIT) {
            Iterator<String> it = ids.iterator();
            it.next();
            it.remove();
        }
        StringBuilder sb = new StringBuilder();
        for (String item : ids) {
            if (sb.length() > 0) sb.append(',');
            sb.append(item);
        }
        sp.edit().putString(KEY_RECENT_IDS, sb.toString()).apply();
        return true;
    }
}
