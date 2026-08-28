package io.github.bakahuiii.theia.mobile;

import android.content.Context;
import android.content.SharedPreferences;

import androidx.annotation.NonNull;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import androidx.work.Worker;
import androidx.work.WorkerParameters;

import java.util.Date;

/**
 * Periodic background worker: checks data freshness and nudges the user to
 * sync when campus data is stale. WebView JS cannot run reliably in the
 * background, so this worker only reminds; the actual sync happens on next
 * app open / resume / network reconnect (see mobile-bridge).
 */
public class TheiaSyncWorker extends Worker {

    public static final String PREF_NAME = "theia-background";
    public static final String KEY_LAST_SYNC_AT = "last_sync_at";
    static final String NOTIFICATION_CHANNEL_ID = "theia-sync-reminder";
    private static final int NOTIFICATION_ID = 4201;

    public TheiaSyncWorker(@NonNull Context context, @NonNull WorkerParameters params) {
        super(context, params);
    }

    @NonNull
    @Override
    public Result doWork() {
        Context context = getApplicationContext();
        SharedPreferences prefs = context.getSharedPreferences(PREF_NAME, Context.MODE_PRIVATE);
        long lastSyncAt = prefs.getLong(KEY_LAST_SYNC_AT, 0L);
        long staleAfterMs = getInputData().getLong("staleAfterMs", 6L * 60 * 60 * 1000);

        long age = System.currentTimeMillis() - lastSyncAt;
        if (lastSyncAt > 0 && age < staleAfterMs) {
            // Data is fresh enough; nothing to do.
            return Result.success();
        }

        showReminder(context);
        return Result.success();
    }

    private void showReminder(Context context) {
        try {
            NotificationCompat.Builder builder = new NotificationCompat.Builder(context, NOTIFICATION_CHANNEL_ID)
                .setSmallIcon(android.R.drawable.stat_sys_download_done)
                .setContentTitle("THEIA 校园数据待更新")
                .setContentText("本地数据已较旧，打开应用同步课表与成绩")
                .setPriority(NotificationCompat.PRIORITY_DEFAULT)
                .setAutoCancel(true);
            NotificationManagerCompat manager = NotificationManagerCompat.from(context);
            manager.notify(NOTIFICATION_ID, builder.build());
        } catch (SecurityException ignored) {
            // POST_NOTIFICATIONS not granted; skip the reminder.
        }
    }
}
