package com.jianyie.app.push;

import android.Manifest;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.pm.ServiceInfo;
import android.media.AudioAttributes;
import android.media.RingtoneManager;
import android.net.Uri;
import android.os.Build;
import android.os.Handler;
import android.os.HandlerThread;
import android.os.IBinder;
import android.util.Log;

import com.jianyie.app.MainActivity;
import com.jianyie.app.R;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;

/**
 * 常驻前台服务：不依赖 FCM，直接轮询云端 {@code /api/dm/poll?since=} 拉取真人好友新消息，
 * 收到新消息时弹本地通知。
 *
 * <p>约定：</p>
 * <ul>
 *   <li>每 {@link #POLL_INTERVAL_MS} 毫秒轮询一次，接口返回 {items:[{id,senderName,text,createdAt}], now}；</li>
 *   <li>since / 已通知的消息 id 持久化在 SharedPreferences，进程重启后不重复提醒；</li>
 *   <li>App 在前台时只推进 since 不弹通知，前台提醒由网页层负责，避免一消息两提醒；</li>
 *   <li>通知 id 与网页层 {@code human.poll()} 的算法对齐（"dm_" + id 的 Java 字符串 hash），
 *       同一条消息即使两边都提醒也会替换同一条通知而不是并列两条。</li>
 * </ul>
 *
 * <p>限制见 docs/capacitor.md：Android 15+ 的 dataSync 前台服务有 6 小时 / 24 小时的时长上限，
 * 各家 OEM 还可能直接杀进程。</p>
 */
public class DmPollService extends Service {

    private static final String TAG = "JianyieDmPush";

    private static final String ACTION_START = "com.jianyie.app.action.DM_POLL_START";
    private static final String ACTION_STOP = "com.jianyie.app.action.DM_POLL_STOP";

    /** 轮询间隔：20~30 秒之间，兼顾及时性与耗电 */
    public static final long POLL_INTERVAL_MS = 25_000L;

    /** 服务中断超过这个时间就不再补发积压旧消息（回前台后网页层会自己拉取入库） */
    private static final long MAX_BACKLOG_GAP_MS = 10 * 60 * 1000L;

    private static final int SERVICE_NOTIFICATION_ID = 761001;
    private static final int SUMMARY_NOTIFICATION_ID = 761002;
    private static final int LOGIN_EXPIRED_NOTIFICATION_ID = 761003;
    private static final int PAUSED_NOTIFICATION_ID = 761004;

    private static final int MAX_INDIVIDUAL_NOTIFICATIONS = 3;
    private static final int MAX_RESPONSE_CHARS = 512 * 1024;
    private static final int MAX_TEXT_CHARS = 140;

    /** 常驻通知通道（低优先级、无声） */
    private static final String CHANNEL_SERVICE = "jianyie-dm-service";
    /** 消息通知复用 @capacitor/local-notifications 的默认通道；不存在时按相同参数补建 */
    private static final String CHANNEL_MESSAGES = "default";

    private static volatile boolean running = false;

    private HandlerThread pollThread;
    private Handler pollHandler;

    // ---------------------------------------------------------------- 生命周期

    public static boolean isRunning() {
        return running;
    }

    /** 由插件调用；App 在前台时启动是允许的（Android 12+ 后台启动前台服务会受限）。 */
    public static void start(Context context) {
        Intent intent = new Intent(context, DmPollService.class).setAction(ACTION_START);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            context.startForegroundService(intent);
        } else {
            context.startService(intent);
        }
    }

    public static void stop(Context context) {
        context.stopService(new Intent(context, DmPollService.class));
    }

    @Override
    public void onCreate() {
        super.onCreate();
        ensureChannels();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent != null && ACTION_STOP.equals(intent.getAction())) {
            DmPushPrefs.setEnabled(this, false);
            stopCleanly();
            return START_NOT_STICKY;
        }
        // 退出登录 / 用户关闭后即使被系统粘性重启也不要再跑
        if (!DmPushPrefs.enabled(this) || !DmPushPrefs.hasAuth(this)) {
            stopCleanly();
            return START_NOT_STICKY;
        }
        if (!running) {
            if (!startForegroundWithType()) {
                // 常见原因：Android 12+ 从后台启动前台服务被系统拦截；下一次 App 回到前台时
                // JS 再 start() 即可恢复，所以这里不把 enabled 置 false。
                stopSelf();
                return START_NOT_STICKY;
            }
            if (DmPushPrefs.since(this) <= 0L) {
                // 第一次启动：从现在开始，避免把历史消息一次性全弹出来
                DmPushPrefs.setSince(this, System.currentTimeMillis());
            }
            running = true;
            startPolling();
        } else {
            // 重复 start()（App 每次启动都会调用）：重新贴一下常驻通知，
            // 因为 Android 13+ 允许用户划掉前台服务通知。
            startForegroundWithType();
        }
        // 被系统杀掉后尽量自动拉起；OEM 限制见文档
        return START_STICKY;
    }

    @Override
    public void onTaskRemoved(Intent rootIntent) {
        // android:stopWithTask="false" 让服务在用户从最近任务划掉 App 后继续跑；
        // 部分 OEM 仍会连同进程一起杀，这里不做额外拉活（后台启动前台服务会被系统拦截）。
        super.onTaskRemoved(rootIntent);
        Log.i(TAG, "task removed, foreground polling keeps running");
    }

    /**
     * Android 15（API 35）起，dataSync 类型的前台服务在每个 24 小时窗口内最多运行 6 小时，
     * 超时后系统回调这里；停下服务并提示用户下次打开 App 时恢复。
     */
    @Override
    public void onTimeout(int startId, int fgsType) {
        Log.w(TAG, "foreground service timeout, type=" + fgsType);
        DmPushPrefs.setEnabled(this, false);
        DmPushPrefs.setLastError(this, "系统限制后台服务时长，已自动暂停；打开应用可恢复");
        if (!DmPushState.isAppVisible()) {
            postSimpleNotification(
                    PAUSED_NOTIFICATION_ID,
                    "后台消息通知已暂停",
                    "系统限制了后台运行时长，打开「笺页」可重新开启",
                    CHANNEL_SERVICE);
        }
        stopCleanly();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    @Override
    public void onDestroy() {
        running = false;
        stopPolling();
        try {
            stopForeground(STOP_FOREGROUND_REMOVE);
        } catch (Throwable ignored) {
            // ignore
        }
        super.onDestroy();
    }

    private void stopCleanly() {
        running = false;
        stopPolling();
        try {
            stopForeground(STOP_FOREGROUND_REMOVE);
        } catch (Throwable ignored) {
            // ignore
        }
        stopSelf();
    }

    // ---------------------------------------------------------------- 前台通知

    private boolean startForegroundWithType() {
        try {
            Notification notification = buildServiceNotification();
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                startForeground(SERVICE_NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC);
            } else {
                startForeground(SERVICE_NOTIFICATION_ID, notification);
            }
            return true;
        } catch (Throwable t) {
            DmPushPrefs.setLastError(this, "startForeground 失败：" + describe(t));
            Log.w(TAG, "startForeground failed", t);
            return false;
        }
    }

    private Notification buildServiceNotification() {
        Notification.Builder builder = builderFor(CHANNEL_SERVICE)
                .setSmallIcon(R.drawable.ic_stat_dm)
                .setContentTitle("笺页 · 后台接收好友消息")
                .setContentText("每 25 秒检查一次新消息，点按回到应用")
                .setOngoing(true)
                .setShowWhen(false)
                .setCategory(Notification.CATEGORY_SERVICE)
                .setContentIntent(openAppIntent());
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            builder.setPriority(Notification.PRIORITY_LOW);
        }
        return builder.build();
    }

    private void ensureChannels() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager manager = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager == null) return;
        if (manager.getNotificationChannel(CHANNEL_SERVICE) == null) {
            NotificationChannel channel = new NotificationChannel(
                    CHANNEL_SERVICE, "后台消息接收", NotificationManager.IMPORTANCE_LOW);
            channel.setDescription("保持与云端的好友消息连接（常驻通知）");
            channel.setShowBadge(false);
            channel.setSound(null, null);
            manager.createNotificationChannel(channel);
        }
        // 正常情况下 @capacitor/local-notifications 已在 App 启动时建好 "default" 通道；
        // 若原生服务先于 WebView 启动（如进程被系统重启后），按插件的参数补建，保证通知能弹出来。
        if (manager.getNotificationChannel(CHANNEL_MESSAGES) == null) {
            NotificationChannel channel = new NotificationChannel(
                    CHANNEL_MESSAGES, "Default", NotificationManager.IMPORTANCE_DEFAULT);
            channel.setDescription("Default");
            Uri sound = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION);
            if (sound != null) {
                AudioAttributes attributes = new AudioAttributes.Builder()
                        .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                        .setUsage(AudioAttributes.USAGE_ALARM)
                        .build();
                channel.setSound(sound, attributes);
            }
            manager.createNotificationChannel(channel);
        }
    }

    private Notification.Builder builderFor(String channelId) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            return new Notification.Builder(this, channelId);
        }
        @SuppressWarnings("deprecation")
        Notification.Builder builder = new Notification.Builder(this);
        return builder;
    }

    private PendingIntent openAppIntent() {
        Intent open = new Intent(this, MainActivity.class);
        open.setAction(Intent.ACTION_MAIN);
        open.addCategory(Intent.CATEGORY_LAUNCHER);
        open.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_RESET_TASK_IF_NEEDED);
        return PendingIntent.getActivity(
                this,
                0,
                open,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    // ---------------------------------------------------------------- 轮询

    private void startPolling() {
        if (pollThread != null) return;
        pollThread = new HandlerThread("jianyie-dm-poll");
        pollThread.start();
        pollHandler = new Handler(pollThread.getLooper());
        pollHandler.post(pollRunnable);
    }

    private void stopPolling() {
        if (pollHandler != null) {
            pollHandler.removeCallbacksAndMessages(null);
            pollHandler = null;
        }
        if (pollThread != null) {
            pollThread.quitSafely();
            pollThread = null;
        }
    }

    private final Runnable pollRunnable = new Runnable() {
        @Override
        public void run() {
            if (!running) return;
            try {
                pollOnce();
            } catch (Throwable t) {
                DmPushPrefs.setLastError(DmPollService.this, describe(t));
                Log.w(TAG, "poll failed", t);
            }
            if (running) {
                Handler handler = pollHandler;
                if (handler != null) handler.postDelayed(this, POLL_INTERVAL_MS);
            }
        }
    };

    private void pollOnce() throws Exception {
        final String token = DmPushPrefs.token(this);
        final String baseUrl = DmPushPrefs.baseUrl(this);
        if (token.isEmpty()) {
            stopCleanly();
            return;
        }
        long since = DmPushPrefs.since(this);
        long lastPollAt = DmPushPrefs.lastPollAt(this);
        long wallNow = System.currentTimeMillis();
        if (lastPollAt > 0 && since > 0 && wallNow - lastPollAt > MAX_BACKLOG_GAP_MS) {
            // 服务中断太久：跳过积压，避免一次弹几十条旧消息；回到前台后网页层会重新拉取入库
            since = wallNow;
            DmPushPrefs.setSince(this, since);
        }

        HttpURLConnection connection = null;
        try {
            URL url = new URL(baseUrl + "/api/dm/poll?since=" + since);
            connection = (HttpURLConnection) url.openConnection();
            connection.setRequestMethod("GET");
            connection.setConnectTimeout(10_000);
            connection.setReadTimeout(15_000);
            connection.setUseCaches(false);
            connection.setRequestProperty("Accept", "application/json");
            connection.setRequestProperty("Authorization", "Bearer " + token);
            int code = connection.getResponseCode();
            InputStream stream = code >= 200 && code < 300
                    ? connection.getInputStream()
                    : connection.getErrorStream();
            String body = readLimited(stream);

            if (code == 401 || code == 403) {
                onAuthExpired();
                return;
            }
            if (code < 200 || code >= 300) {
                DmPushPrefs.setLastError(this, "轮询失败：HTTP " + code + (body.isEmpty() ? "" : " " + trim(body, 120)));
                DmPushPrefs.setLastPollAt(this, System.currentTimeMillis());
                return;
            }

            JSONObject json = new JSONObject(body);
            JSONArray items = json.optJSONArray("items");
            long serverNow = json.optLong("now", 0L);

            List<JSONObject> fresh = new ArrayList<>();
            long maxCreatedAt = 0L;
            if (items != null) {
                for (int i = 0; i < items.length(); i++) {
                    JSONObject item = items.optJSONObject(i);
                    if (item == null) continue;
                    String id = item.optString("id", "");
                    if (id.isEmpty()) continue;
                    maxCreatedAt = Math.max(maxCreatedAt, item.optLong("createdAt", 0L));
                    if (DmPushPrefs.rememberId(this, id)) fresh.add(item);
                }
            }

            // 先提醒再推进 since：即使提醒中途异常，最多重复一次也不会漏提醒
            if (!fresh.isEmpty()) {
                maybeNotify(fresh);
            }

            long nextSince = serverNow > 0 ? serverNow : Math.max(maxCreatedAt, since);
            DmPushPrefs.setSince(this, Math.max(nextSince, since));
            DmPushPrefs.setLastPollAt(this, System.currentTimeMillis());
            DmPushPrefs.setLastError(this, "");
        } finally {
            if (connection != null) connection.disconnect();
        }
    }

    private void onAuthExpired() {
        DmPushPrefs.setEnabled(this, false);
        DmPushPrefs.setLastError(this, "登录已过期，请重新登录后再开启后台通知");
        if (!DmPushState.isAppVisible()) {
            postSimpleNotification(
                    LOGIN_EXPIRED_NOTIFICATION_ID,
                    "笺页 · 登录已过期",
                    "重新登录后才能继续接收好友消息通知",
                    CHANNEL_MESSAGES);
        }
        stopCleanly();
    }

    // ---------------------------------------------------------------- 通知

    private void maybeNotify(List<JSONObject> fresh) {
        // App 在前台：网页层 human.poll() 会处理提醒，这里静默推进即可
        if (DmPushState.isAppVisible()) return;
        if (!canPostNotifications(this)) {
            DmPushPrefs.setLastError(this, "通知权限未授予，消息提醒不可见");
            return;
        }
        if (fresh.size() > MAX_INDIVIDUAL_NOTIFICATIONS) {
            postSummaryNotification(fresh);
            return;
        }
        for (JSONObject item : fresh) {
            postMessageNotification(item);
        }
    }

    private void postMessageNotification(JSONObject item) {
        String sender = item.optString("senderName", "");
        if (sender.isEmpty()) sender = "好友";
        String text = item.optString("text", "");
        String body = text.length() > MAX_TEXT_CHARS ? text.substring(0, MAX_TEXT_CHARS) + "…" : text;
        long createdAt = item.optLong("createdAt", 0L);
        int id = notificationIdFor(item.optString("id", ""));

        Notification.Builder builder = builderFor(CHANNEL_MESSAGES)
                .setSmallIcon(R.drawable.ic_stat_dm)
                .setContentTitle(sender)
                .setContentText(body)
                .setStyle(new Notification.BigTextStyle().bigText(body))
                .setAutoCancel(true)
                .setShowWhen(true)
                .setWhen(createdAt > 0 ? createdAt : System.currentTimeMillis())
                .setContentIntent(openAppIntent());
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            builder.setPriority(Notification.PRIORITY_HIGH);
            builder.setDefaults(Notification.DEFAULT_ALL);
        }
        notifySafely(id, builder.build());
    }

    private void postSummaryNotification(List<JSONObject> fresh) {
        JSONObject latest = fresh.get(fresh.size() - 1);
        String sender = latest.optString("senderName", "");
        if (sender.isEmpty()) sender = "好友";
        String text = latest.optString("text", "");
        if (text.length() > MAX_TEXT_CHARS) text = text.substring(0, MAX_TEXT_CHARS) + "…";
        String title = fresh.size() + " 条新好友消息";
        String body = sender + "：" + text;

        Notification.Builder builder = builderFor(CHANNEL_MESSAGES)
                .setSmallIcon(R.drawable.ic_stat_dm)
                .setContentTitle(title)
                .setContentText(body)
                .setStyle(new Notification.BigTextStyle().bigText(body))
                .setNumber(fresh.size())
                .setAutoCancel(true)
                .setShowWhen(true)
                .setWhen(System.currentTimeMillis())
                .setContentIntent(openAppIntent());
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            builder.setPriority(Notification.PRIORITY_HIGH);
            builder.setDefaults(Notification.DEFAULT_ALL);
        }
        notifySafely(SUMMARY_NOTIFICATION_ID, builder.build());
    }

    private void postSimpleNotification(int id, String title, String text, String channelId) {
        Notification.Builder builder = builderFor(channelId)
                .setSmallIcon(R.drawable.ic_stat_dm)
                .setContentTitle(title)
                .setContentText(text)
                .setAutoCancel(true)
                .setShowWhen(false)
                .setContentIntent(openAppIntent());
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            builder.setPriority(Notification.PRIORITY_DEFAULT);
        }
        notifySafely(id, builder.build());
    }

    private void notifySafely(int id, Notification notification) {
        try {
            NotificationManager manager = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
            if (manager != null) manager.notify(id, notification);
        } catch (Throwable t) {
            DmPushPrefs.setLastError(this, "通知发送失败：" + describe(t));
            Log.w(TAG, "notify failed", t);
        }
    }

    private static boolean canPostNotifications(Context context) {
        if (Build.VERSION.SDK_INT >= 33) {
            return context.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)
                    == PackageManager.PERMISSION_GRANTED;
        }
        NotificationManager manager = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        return manager == null || manager.areNotificationsEnabled();
    }

    /**
     * 与网页层 src/store/human.ts 的通知 id 算法保持一致：字符串 "dm_" + 消息 id 的 31 进制 hash。
     * 这样两边都提醒时是替换同一条通知，而不是叠两条。
     */
    static int notificationIdFor(String messageId) {
        String mid = "dm_" + (messageId == null ? "" : messageId);
        int hash = 0;
        for (int i = 0; i < mid.length(); i++) hash = hash * 31 + mid.charAt(i);
        int id = hash == Integer.MIN_VALUE ? 1 : Math.abs(hash);
        if (id == 0) id = (int) (System.currentTimeMillis() % 1_000_000_000L) + 1;
        // 避开保留 id
        if (id == SERVICE_NOTIFICATION_ID || id == SUMMARY_NOTIFICATION_ID
                || id == LOGIN_EXPIRED_NOTIFICATION_ID || id == PAUSED_NOTIFICATION_ID) {
            id += 1;
        }
        return id;
    }

    // ---------------------------------------------------------------- 工具

    private static String readLimited(InputStream stream) {
        if (stream == null) return "";
        StringBuilder sb = new StringBuilder();
        try (BufferedReader reader = new BufferedReader(new InputStreamReader(stream, StandardCharsets.UTF_8))) {
            char[] buffer = new char[4096];
            int count;
            while ((count = reader.read(buffer)) > 0) {
                if (sb.length() + count > MAX_RESPONSE_CHARS) break;
                sb.append(buffer, 0, count);
            }
        } catch (Exception ignored) {
            // 读取中断就当本轮失败，下一轮重试
        }
        return sb.toString();
    }

    private static String trim(String value, int max) {
        if (value == null) return "";
        String text = value.trim();
        return text.length() > max ? text.substring(0, max) : text;
    }

    private static String describe(Throwable t) {
        if (t == null) return "unknown";
        String message = t.getMessage();
        return t.getClass().getSimpleName() + (message == null ? "" : "：" + message);
    }
}
