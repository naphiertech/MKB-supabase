package com.mkbcorp.ridertrack;

import android.annotation.SuppressLint;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.PowerManager;
import android.provider.Settings;
import android.util.Log;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;

@CapacitorPlugin(name = "DeviceSecurity")
public class DeviceSecurityPlugin extends Plugin {
    private static final String TAG = "DeviceSecurity";

    private static final String[] SU_PATHS = new String[] {
        "/system/app/Superuser.apk",
        "/sbin/su",
        "/system/bin/su",
        "/system/xbin/su",
        "/data/local/xbin/su",
        "/data/local/bin/su",
        "/system/sd/xbin/su",
        "/system/bin/failsafe/su",
        "/data/local/su",
        "/su/bin/su",
        "/sbin/.magisk"
    };

    private static final String[] KNOWN_MOCK_GPS_PACKAGES = new String[] {
        "com.lexa.fakegps",
        "com.incorporateapps.fakegps.fre",
        "com.incorporateapps.fakegps",
        "com.incorporateapps.fakegps_route",
        "com.blogspot.newapphorizons.fakegps",
        "com.gsmartstudio.fakegps",
        "com.lkr.fakelocation",
        "com.rosteam.gpsemulator",
        "com.theappninjas.fakegpsjoystick",
        "com.theappninjas.gpsjoystick"
    };

    private boolean detectRootedDevice() {
        String buildTags = Build.TAGS;
        if (buildTags != null && buildTags.contains("test-keys")) {
            return true;
        }
        for (String path : SU_PATHS) {
            try {
                if (new File(path).exists()) {
                    return true;
                }
            } catch (Exception ignored) {}
        }
        return false;
    }

    private JSArray detectInstalledMockApps(Context context) {
        JSArray detected = new JSArray();
        PackageManager pm = context.getPackageManager();
        if (pm == null) return detected;

        for (String pkg : KNOWN_MOCK_GPS_PACKAGES) {
            try {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                    pm.getPackageInfo(pkg, PackageManager.PackageInfoFlags.of(0));
                } else {
                    pm.getPackageInfo(pkg, 0);
                }
                detected.put(pkg);
            } catch (PackageManager.NameNotFoundException ignored) {
                // Not installed
            } catch (Exception ignored) {
                // Restricted by package visibility
            }
        }
        return detected;
    }

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

        boolean isRooted = detectRootedDevice();
        JSArray mockApps = detectInstalledMockApps(context);

        JSObject ret = new JSObject();
        ret.put("isDevelopmentSettingsEnabled", devOptionsEnabled);
        ret.put("isAdbEnabled", adbEnabled);
        ret.put("isDebugBuild", isDebug);
        ret.put("isRooted", isRooted);
        ret.put("detectedMockApps", mockApps);
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

    @SuppressLint("HardwareIds")
    @PluginMethod
    public void getHardwareDeviceInfo(PluginCall call) {
        Context context = getContext();
        String androidId = "";
        try {
            String raw = Settings.Secure.getString(context.getContentResolver(), Settings.Secure.ANDROID_ID);
            if (raw != null) {
                androidId = raw.trim();
            }
        } catch (Exception e) {
            Log.w(TAG, "Failed to read ANDROID_ID", e);
        }

        JSObject ret = new JSObject();
        ret.put("androidId", androidId);
        ret.put("manufacturer", Build.MANUFACTURER != null ? Build.MANUFACTURER : "Android");
        ret.put("model", Build.MODEL != null ? Build.MODEL : "Device");
        ret.put("sdkInt", Build.VERSION.SDK_INT);
        call.resolve(ret);
    }

    @PluginMethod
    public void checkBatteryOptimization(PluginCall call) {
        Context context = getContext();
        boolean ignoring = true;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            try {
                PowerManager pm = (PowerManager) context.getSystemService(Context.POWER_SERVICE);
                if (pm != null) {
                    ignoring = pm.isIgnoringBatteryOptimizations(context.getPackageName());
                }
            } catch (Exception e) {
                Log.w(TAG, "Failed to check battery optimization state", e);
            }
        }

        JSObject ret = new JSObject();
        ret.put("isIgnoringBatteryOptimizations", ignoring);
        call.resolve(ret);
    }

    @SuppressLint("BatteryLife")
    @PluginMethod
    public void requestIgnoreBatteryOptimization(PluginCall call) {
        Context context = getContext();
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) {
            JSObject ret = new JSObject();
            ret.put("success", true);
            call.resolve(ret);
            return;
        }

        try {
            Intent intent = new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS);
            intent.setData(Uri.parse("package:" + context.getPackageName()));
            intent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            context.startActivity(intent);
            JSObject ret = new JSObject();
            ret.put("success", true);
            call.resolve(ret);
        } catch (Exception e) {
            Log.w(TAG, "ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS failed, falling back to general list", e);
            try {
                Intent fallback = new Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS);
                fallback.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                context.startActivity(fallback);
                JSObject ret = new JSObject();
                ret.put("success", true);
                call.resolve(ret);
            } catch (Exception ex) {
                Log.e(TAG, "Failed to open battery optimization settings", ex);
                call.reject("Could not open battery settings: " + ex.getMessage());
            }
        }
    }
}
