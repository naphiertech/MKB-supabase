package com.mkbcorp.ridertrack;

import android.content.Context;
import android.content.Intent;
import android.provider.Settings;
import android.util.Log;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "DeviceSecurity")
public class DeviceSecurityPlugin extends Plugin {
    private static final String TAG = "DeviceSecurity";

    @PluginMethod
    public void checkSecurity(PluginCall call) {
        Context context = getContext();
        boolean isDebug = (context.getApplicationInfo().flags & android.content.pm.ApplicationInfo.FLAG_DEBUGGABLE) != 0;
        boolean devOptionsEnabled = false;
        boolean adbEnabled = false;

        try {
            devOptionsEnabled = Settings.Global.getInt(
                context.getContentResolver(),
                Settings.Global.DEVELOPMENT_SETTINGS_ENABLED,
                0
            ) != 0;
        } catch (Exception e) {
            Log.w(TAG, "Error checking DEVELOPMENT_SETTINGS_ENABLED", e);
        }

        try {
            adbEnabled = Settings.Global.getInt(
                context.getContentResolver(),
                Settings.Global.ADB_ENABLED,
                0
            ) != 0;
        } catch (Exception e) {
            Log.w(TAG, "Error checking ADB_ENABLED", e);
        }

        JSObject ret = new JSObject();
        ret.put("isDevelopmentSettingsEnabled", devOptionsEnabled);
        ret.put("isAdbEnabled", adbEnabled);
        ret.put("isDebugBuild", isDebug);
        ret.put("blocked", devOptionsEnabled);
        call.resolve(ret);
    }

    @PluginMethod
    public void openDeveloperSettings(PluginCall call) {
        Context context = getContext();
        try {
            Intent intent = new Intent(Settings.ACTION_APPLICATION_DEVELOPMENT_SETTINGS);
            intent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            context.startActivity(intent);
            JSObject ret = new JSObject();
            ret.put("success", true);
            call.resolve(ret);
        } catch (Exception e) {
            Log.w(TAG, "Failed to launch ACTION_APPLICATION_DEVELOPMENT_SETTINGS, trying general settings", e);
            try {
                Intent fallback = new Intent(Settings.ACTION_SETTINGS);
                fallback.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                context.startActivity(fallback);
                JSObject ret = new JSObject();
                ret.put("success", true);
                call.resolve(ret);
            } catch (Exception ex) {
                Log.e(TAG, "Failed to open settings", ex);
                call.reject("Could not open settings: " + ex.getMessage());
            }
        }
    }
}
