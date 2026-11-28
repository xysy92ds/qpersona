package com.jianyie.app.push;

/**
 * App 前后台可见状态。
 *
 * 原生轮询在 App 可见时不弹通知（只推进 since、记录消息 id），
 * 因为此时网页层 {@code human.poll()} 会自己拉取、入库并提醒，避免同一条消息提醒两次。
 */
public final class DmPushState {

    private static volatile boolean appVisible = false;

    private DmPushState() {}

    public static void setAppVisible(boolean visible) {
        appVisible = visible;
    }

    public static boolean isAppVisible() {
        return appVisible;
    }
}
