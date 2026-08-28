package io.github.bakahuiii.theia.mobile;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.Context;
import android.content.SharedPreferences;
import android.os.Build;

import androidx.work.Data;
import androidx.work.ExistingPeriodicWorkPolicy;
import androidx.work.PeriodicWorkRequest;
import androidx.work.WorkManager;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.util.concurrent.TimeUnit;

/**
 * TheiaBackground plugin — WorkManager-based periodic sync reminder.
 * WebView JS can't run reliably in the background; this schedules a periodic
 * worker that reminds the user when campus data is stale. The actual sync
 * runs on next app open / resume / network reconnect (JS side).
 */
@CapacitorPlugin(name = "TheiaBackground")
public class TheiaBackgroundPlugin extends Plugin {

    public static final String WORK_NAME = "theia-sync-reminder";

    @PluginMethod
    public void scheduleSync(PluginCall call) {
        int intervalMinutes = call.getInt("intervalMinutes", 180);
        long staleAfterMs = call.getLong("staleAfterMs", 6L * 60 * 60 * 1000);
        if (intervalMinutes < 15) intervalMinutes = 15;

        createNotificationChannelIfNeeded();

        Data input = new Data.Builder()
            .putLong("staleAfterMs", staleAfterMs)
            .build();
        PeriodicWorkRequest request = new PeriodicWorkRequest.Builder(TheiaSyncWorker.class, intervalMinutes, TimeUnit.MINUTES)
            .setInputData(input)
            .build();
        WorkManager.getInstance(getContext()).enqueueUniquePeriodicWork(
            WORK_NAME, ExistingPeriodicWorkPolicy.UPDATE, request);

        JSObject result = new JSObject();
        result.put("scheduled", true);
        result.put("intervalMinutes", intervalMinutes);
        call.resolve(result);
    }

    @PluginMethod
    public void cancelSync(PluginCall call) {
        WorkManager.getInstance(getContext()).cancelUniqueWork(WORK_NAME);
        call.resolve();
    }

    @PluginMethod
    public void recordSyncNow(PluginCall call) {
        SharedPreferences prefs = getContext().getSharedPreferences(TheiaSyncWorker.PREF_NAME, Context.MODE_PRIVATE);
        prefs.edit().putLong(TheiaSyncWorker.KEY_LAST_SYNC_AT, System.currentTimeMillis()).apply();
        call.resolve();
    }

    @PluginMethod
    public void getLastSyncAt(PluginCall call) {
        SharedPreferences prefs = getContext().getSharedPreferences(TheiaSyncWorker.PREF_NAME, Context.MODE_PRIVATE);
        JSObject result = new JSObject();
        result.put("lastSyncAt", prefs.getLong(TheiaSyncWorker.KEY_LAST_SYNC_AT, 0L));
        call.resolve(result);
    }

    private void createNotificationChannelIfNeeded() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationManager manager = getContext().getSystemService(NotificationManager.class);
            NotificationChannel channel = new NotificationChannel(
                TheiaSyncWorker.NOTIFICATION_CHANNEL_ID,
                "THEIA 同步提醒",
                NotificationManager.IMPORTANCE_DEFAULT
            );
            channel.setDescription("校园数据更新的周期提醒");
            if (manager != null) manager.createNotificationChannel(channel);
        }
    }
}
