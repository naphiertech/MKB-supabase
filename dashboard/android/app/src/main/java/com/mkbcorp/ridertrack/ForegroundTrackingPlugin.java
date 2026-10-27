package com.mkbcorp.ridertrack;

import android.content.Context;
import android.content.Intent;
import android.util.Log;

import androidx.core.content.ContextCompat;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "ForegroundTracking")
public class ForegroundTrackingPlugin extends Plugin {
    private static final String TAG = "ForegroundTracking";
    private static ForegroundTrackingPlugin sInstance;

    @Override
    public void load() {
        super.load();
        sInstance = this;
    }

    public static void onLocation(double lat, double lng, float accuracy, long timestamp) {
        if (sInstance != null) {
            JSObject data = new JSObject();
            data.put("lat", lat);
            data.put("lng", lng);
            data.put("accuracy", accuracy);
            data.put("timestamp", timestamp);
            sInstance.notifyListeners("onLocationUpdate", data);
        }
    }

    public static void onMockLocationDetected(double lat, double lng) {
        if (sInstance != null) {
            JSObject data = new JSObject();
            data.put("lat", lat);
            data.put("lng", lng);
            data.put("timestamp", System.currentTimeMillis());
            sInstance.notifyListeners("onMockLocationDetected", data);
        }
    }

    @PluginMethod
    public void startTracking(PluginCall call) {
        String riderId = call.getString("riderId");
        if (riderId == null || riderId.trim().isEmpty()) {
            call.reject("Missing riderId");
            return;
        }

        String hubName = call.getString("hubName", "Assigned Hub");
        String supabaseUrl = call.getString("supabaseUrl");
        String supabaseAnonKey = call.getString("supabaseAnonKey");
        String authToken = call.getString("authToken");

        Context context = getContext();
        Intent intent = new Intent(context, RiderForegroundService.class);
        intent.putExtra("riderId", riderId);
        intent.putExtra("hubName", hubName);
        intent.putExtra("supabaseUrl", supabaseUrl);
        intent.putExtra("supabaseAnonKey", supabaseAnonKey);
        intent.putExtra("authToken", authToken);

        try {
            ContextCompat.startForegroundService(context, intent);
            JSObject res = new JSObject();
            res.put("status", "started");
            call.resolve(res);
        } catch (Exception e) {
            Log.e(TAG, "Failed to start RiderForegroundService:", e);
            call.reject("Failed to start foreground service: " + e.getMessage());
        }
    }

    @PluginMethod
    public void stopTracking(PluginCall call) {
        Context context = getContext();
        Intent intent = new Intent(context, RiderForegroundService.class);
        intent.setAction("STOP");

        try {
            context.startService(intent);
            context.stopService(intent);
            JSObject res = new JSObject();
            res.put("status", "stopped");
            call.resolve(res);
        } catch (Exception e) {
            Log.e(TAG, "Failed to stop RiderForegroundService:", e);
            call.reject("Failed to stop foreground service: " + e.getMessage());
        }
    }

    @PluginMethod
    public void isTracking(PluginCall call) {
        JSObject res = new JSObject();
        res.put("active", RiderForegroundService.isRunning());
        call.resolve(res);
    }
}
