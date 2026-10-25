package com.mkbcorp.ridertrack;

import android.annotation.SuppressLint;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.pm.ServiceInfo;
import android.location.Location;
import android.location.LocationListener;
import android.location.LocationManager;
import android.os.Build;
import android.os.Bundle;
import android.os.IBinder;
import android.os.PowerManager;
import android.util.Log;

import androidx.annotation.Nullable;
import androidx.core.app.NotificationCompat;
import androidx.core.content.ContextCompat;

import org.json.JSONObject;

import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;
import java.util.TimeZone;
import java.util.UUID;

public class RiderForegroundService extends Service implements LocationListener {
    private static final String TAG = "RiderForegroundService";
    private static final String CHANNEL_ID = "mkb_foreground_tracking";
    private static final int NOTIFICATION_ID = 9901;

    private static volatile boolean sIsRunning = false;

    private LocationManager locationManager;
    private PowerManager.WakeLock wakeLock;

    private String riderId = null;
    private String hubName = "Assigned Hub";
    private String supabaseUrl = null;
    private String supabaseAnonKey = null;
    private String authToken = null;

    public static boolean isRunning() {
        return sIsRunning;
    }

    @Override
    public void onCreate() {
        super.onCreate();
        createNotificationChannel();
    }

    @SuppressLint("WakelockTimeout")
    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent != null && "STOP".equals(intent.getAction())) {
            stopTracking();
            stopSelf();
            return START_NOT_STICKY;
        }

        if (intent != null) {
            riderId = intent.getStringExtra("riderId");
            String customHub = intent.getStringExtra("hubName");
            if (customHub != null && !customHub.trim().isEmpty()) {
                hubName = customHub;
            }
            supabaseUrl = intent.getStringExtra("supabaseUrl");
            supabaseAnonKey = intent.getStringExtra("supabaseAnonKey");
            authToken = intent.getStringExtra("authToken");
        }

        Notification notification = buildNotification("Realtime GPS tracking is active for " + hubName);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION);
        } else {
            startForeground(NOTIFICATION_ID, notification);
        }

        // Acquire WakeLock to keep CPU executing when screen is locked
        try {
            PowerManager powerManager = (PowerManager) getSystemService(Context.POWER_SERVICE);
            if (powerManager != null) {
                wakeLock = powerManager.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "MKB:RiderLocationWakeLock");
                wakeLock.acquire(12 * 60 * 60 * 1000L); // 12 hours max
            }
        } catch (Exception e) {
            Log.w(TAG, "Failed to acquire partial wake lock:", e);
        }

        startLocationTracking();
        sIsRunning = true;

        return START_STICKY;
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                    CHANNEL_ID,
                    "Active Shift Location Tracking",
                    NotificationManager.IMPORTANCE_LOW
            );
            channel.setDescription("Ongoing location synchronization during active rider duty shifts.");
            channel.setShowBadge(false);
            NotificationManager manager = getSystemService(NotificationManager.class);
            if (manager != null) {
                manager.createNotificationChannel(channel);
            }
        }
    }

    private Notification buildNotification(String text) {
        Intent notificationIntent = new Intent(this, MainActivity.class);
        notificationIntent.setFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent pendingIntent = PendingIntent.getActivity(
                this,
                0,
                notificationIntent,
                PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M ? PendingIntent.FLAG_IMMUTABLE : 0)
        );

        int smallIcon = android.R.drawable.ic_menu_mylocation;
        try {
            int appIconRes = getResources().getIdentifier("ic_stat_icon", "drawable", getPackageName());
            if (appIconRes != 0) {
                smallIcon = appIconRes;
            }
        } catch (Exception ignored) {}

        return new NotificationCompat.Builder(this, CHANNEL_ID)
                .setContentTitle("MKB RiderTrack · On Active Duty")
                .setContentText(text)
                .setSmallIcon(smallIcon)
                .setColor(0xFFB85A00)
                .setOngoing(true)
                .setPriority(NotificationCompat.PRIORITY_LOW)
                .setContentIntent(pendingIntent)
                .build();
    }

    private void updateNotification(String text) {
        try {
            NotificationManager manager = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
            if (manager != null && sIsRunning) {
                manager.notify(NOTIFICATION_ID, buildNotification(text));
            }
        } catch (Exception e) {
            Log.w(TAG, "Failed to update notification text:", e);
        }
    }

    private void startLocationTracking() {
        locationManager = (LocationManager) getSystemService(Context.LOCATION_SERVICE);
        if (locationManager == null) return;

        boolean fineGranted = ContextCompat.checkSelfPermission(this, android.Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED;
        boolean coarseGranted = ContextCompat.checkSelfPermission(this, android.Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED;

        if (!fineGranted && !coarseGranted) {
            Log.e(TAG, "Location permissions not granted for background tracking.");
            return;
        }

        try {
            if (locationManager.isProviderEnabled(LocationManager.GPS_PROVIDER)) {
                locationManager.requestLocationUpdates(LocationManager.GPS_PROVIDER, 15000L, 5f, this);
            }
            if (locationManager.isProviderEnabled(LocationManager.NETWORK_PROVIDER)) {
                locationManager.requestLocationUpdates(LocationManager.NETWORK_PROVIDER, 15000L, 5f, this);
            }
        } catch (SecurityException se) {
            Log.e(TAG, "SecurityException requesting location updates:", se);
        } catch (Exception e) {
            Log.e(TAG, "Exception requesting location updates:", e);
        }
    }

    private void stopTracking() {
        sIsRunning = false;
        if (locationManager != null) {
            try {
                locationManager.removeUpdates(this);
            } catch (Exception ignored) {}
        }
        if (wakeLock != null && wakeLock.isHeld()) {
            try {
                wakeLock.release();
            } catch (Exception ignored) {}
        }
        stopForeground(true);
    }

    @Override
    public void onDestroy() {
        stopTracking();
        super.onDestroy();
    }

    @Nullable
    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    @Override
    public void onLocationChanged(Location location) {
        if (location == null) return;

        final double lat = location.getLatitude();
        final double lng = location.getLongitude();
        final float accuracy = location.getAccuracy();
        final long time = location.getTime();

        SimpleDateFormat timeFormat = new SimpleDateFormat("HH:mm:ss", Locale.US);
        String formattedTime = timeFormat.format(new Date(time));
        updateNotification("Active duty · GPS synced at " + formattedTime);

        // Notify Capacitor Plugin listener
        ForegroundTrackingPlugin.onLocation(lat, lng, accuracy, time);

        // Directly post breadcrumb to Supabase in background thread
        if (riderId != null && supabaseUrl != null && (authToken != null || supabaseAnonKey != null)) {
            new Thread(() -> postLocationToSupabase(lat, lng)).start();
        }
    }

    private void postLocationToSupabase(double lat, double lng) {
        HttpURLConnection conn = null;
        try {
            SimpleDateFormat isoFormat = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US);
            isoFormat.setTimeZone(TimeZone.getTimeZone("UTC"));
            String isoTimestamp = isoFormat.format(new Date());

            URL url = new URL(supabaseUrl.replaceAll("/$", "") + "/rest/v1/rider_locations");
            conn = (HttpURLConnection) url.openConnection();
            conn.setRequestMethod("POST");
            conn.setRequestProperty("Content-Type", "application/json");
            conn.setRequestProperty("Prefer", "return=minimal");

            String key = (authToken != null && !authToken.isEmpty()) ? authToken : supabaseAnonKey;
            conn.setRequestProperty("apikey", supabaseAnonKey != null ? supabaseAnonKey : key);
            conn.setRequestProperty("Authorization", "Bearer " + key);

            conn.setDoOutput(true);
            conn.setConnectTimeout(10000);
            conn.setReadTimeout(10000);

            JSONObject payload = new JSONObject();
            payload.put("id", UUID.randomUUID().toString());
            payload.put("rider_id", riderId);
            payload.put("lat", lat);
            payload.put("lng", lng);
            payload.put("status", "active");
            payload.put("recorded_at", isoTimestamp);

            byte[] outputBytes = payload.toString().getBytes(StandardCharsets.UTF_8);
            conn.setFixedLengthStreamingMode(outputBytes.length);
            try (OutputStream os = conn.getOutputStream()) {
                os.write(outputBytes);
            }

            int responseCode = conn.getResponseCode();
            if (responseCode >= 200 && responseCode < 300) {
                Log.d(TAG, "Background GPS breadcrumb posted to Supabase successfully: " + responseCode);
            } else {
                Log.w(TAG, "Supabase breadcrumb post returned code: " + responseCode);
            }
        } catch (Exception e) {
            Log.w(TAG, "Failed to send background GPS breadcrumb to Supabase:", e);
        } finally {
            if (conn != null) {
                conn.disconnect();
            }
        }
    }

    @Override
    public void onStatusChanged(String provider, int status, Bundle extras) {}

    @Override
    public void onProviderEnabled(String provider) {}

    @Override
    public void onProviderDisabled(String provider) {}
}
