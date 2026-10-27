package com.mkbcorp.ridertrack;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(ForegroundTrackingPlugin.class);
        registerPlugin(DeviceSecurityPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
