package com.jianyie.app;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;
import com.jianyie.app.push.DmPushPlugin;
import com.jianyie.app.push.DmPushState;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // 自定义插件必须在 super.onCreate 之前注册（Capacitor BridgeActivity 约定）
        registerPlugin(DmPushPlugin.class);
        super.onCreate(savedInstanceState);
    }

    @Override
    public void onResume() {
        super.onResume();
        DmPushState.setAppVisible(true);
    }

    @Override
    public void onPause() {
        super.onPause();
        // 退到后台后由 DmPollService 负责弹通知；前台时交给网页层，避免一条消息两次提醒
        DmPushState.setAppVisible(false);
    }
}
