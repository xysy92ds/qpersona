package com.jianyie.app.push;

import android.Manifest;
import android.app.NotificationManager;
import android.content.Context;
import android.content.pm.PackageManager;
import android.os.Build;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * 后台真人消息通知的 Capacitor 插件（Android 原生实现）。
 *
 * <p>网页层在 {@code src/core/push.ts} 里通过 {@code registerPlugin('DmPush')} 调用，
 * 接口：</p>
 * <ul>
 *   <li>{@code start({token, baseUrl})}：保存登录凭证并启动常驻前台服务；</li>
 *   <li>{@code stop()}：停止服务、清掉常驻通知（退出登录时调用）；</li>
 *   <li>{@code setAuth({token, baseUrl})}：只更新凭证（token 刷新 / 切换账号），不动服务；</li>
 *   <li>{@code getStatus()}：返回是否运行中、since、通知权限等诊断信息。</li>
 * </ul>
 *
 * <p>不依赖 FCM / Google Play 服务，轮询逻辑全部在 {@link DmPollService} 里。</p>
 */
@CapacitorPlugin(name = "DmPush")
public class DmPushPlugin extends Plugin {

    @PluginMethod
    public void start(PluginCall call) {
        Context context = getContext();
        String token = call.getString("token", "");
        if (token == null || token.trim().isEmpty()) {
            call.reject("缺少 token，无法启动后台消息通知");
            return;
        }
        String baseUrl = call.getString("baseUrl", DmPushPrefs.DEFAULT_BASE_URL);
        DmPushPrefs.setAuth(context, token, baseUrl);
        DmPushPrefs.setEnabled(context, true);
        DmPushPrefs.setLastError(context, "");
        try {
            // Android 12+：App 在前台时启动前台服务是允许的；App 在后台时系统可能抛
            // ForegroundServiceStartNotAllowedException，交给 JS 侧下次回到前台再试。
            DmPollService.start(context);
        } catch (Throwable t) {
            DmPushPrefs.setEnabled(context, false);
            DmPushPrefs.setLastError(context, "启动前台服务失败：" + t.getClass().getSimpleName());
            call.reject("启动后台消息服务失败：" + t.getClass().getSimpleName());
            return;
        }
        call.resolve(status(context));
    }

    @PluginMethod
    public void stop(PluginCall call) {
        Context context = getContext();
        DmPushPrefs.setEnabled(context, false);
        DmPollService.stop(context);
        JSObject ret = new JSObject();
        ret.put("running", false);
        call.resolve(ret);
    }

    @PluginMethod
    public void setAuth(PluginCall call) {
        Context context = getContext();
        String token = call.getString("token", "");
        if (token == null || token.trim().isEmpty()) {
            // 习惯用法：传空 token 表示退出登录，清凭证并停服务
            DmPushPrefs.setAuth(context, "", DmPushPrefs.DEFAULT_BASE_URL);
            DmPushPrefs.setEnabled(context, false);
            DmPollService.stop(context);
            call.resolve(status(context));
            return;
        }
        String baseUrl = call.getString("baseUrl", DmPushPrefs.DEFAULT_BASE_URL);
        DmPushPrefs.setAuth(context, token, baseUrl);
        // 服务在运行中会在下一轮轮询读取新 token，无需重启
        call.resolve(status(context));
    }

    @PluginMethod
    public void getStatus(PluginCall call) {
        call.resolve(status(getContext()));
    }

    private JSObject status(Context context) {
        JSObject ret = new JSObject();
        ret.put("supported", true);
        ret.put("running", DmPollService.isRunning());
        ret.put("enabled", DmPushPrefs.enabled(context));
        ret.put("hasAuth", DmPushPrefs.hasAuth(context));
        ret.put("baseUrl", DmPushPrefs.baseUrl(context));
        ret.put("since", DmPushPrefs.since(context));
        ret.put("intervalMs", DmPollService.POLL_INTERVAL_MS);
        ret.put("lastError", DmPushPrefs.lastError(context));
        ret.put("notificationPermission", notificationPermission(context));
        return ret;
    }

    /** granted / denied / unknown（Android 13+ 的通知权限，未请求时也是 denied） */
    private String notificationPermission(Context context) {
        try {
            if (Build.VERSION.SDK_INT >= 33) {
                boolean granted = context.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)
                        == PackageManager.PERMISSION_GRANTED;
                return granted ? "granted" : "denied";
            }
            NotificationManager manager = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
            boolean enabled = manager == null || manager.areNotificationsEnabled();
            return enabled ? "granted" : "denied";
        } catch (Throwable t) {
            return "unknown";
        }
    }
}
