package io.github.bakahuiii.theia.mobile;

import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.PowerManager;
import android.provider.Settings;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/** Android battery-optimization status and settings intents for background sync. */
@CapacitorPlugin(name = "TheiaBattery")
public class TheiaBatteryPlugin extends Plugin {
    @PluginMethod
    public void getStatus(PluginCall call) {
        JSObject result = new JSObject();
        result.put("supported", Build.VERSION.SDK_INT >= Build.VERSION_CODES.M);
        result.put("ignoringBatteryOptimizations", isIgnoringBatteryOptimizations());
        call.resolve(result);
    }

    @PluginMethod
    public void requestIgnoreBatteryOptimizations(PluginCall call) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) {
            call.resolve(status(false));
            return;
        }
        try {
            Intent intent = new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS);
            intent.setData(Uri.parse("package:" + getContext().getPackageName()));
            getContext().startActivity(intent);
            call.resolve(status(false));
        } catch (Exception error) {
            call.reject("无法打开电池优化设置", error);
        }
    }

    @PluginMethod
    public void openSettings(PluginCall call) {
        try {
            Intent intent = new Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS);
            getContext().startActivity(intent);
            call.resolve(status(false));
        } catch (Exception error) {
            call.reject("无法打开电池优化列表", error);
        }
    }

    private boolean isIgnoringBatteryOptimizations() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) return true;
        PowerManager manager = (PowerManager) getContext().getSystemService(Context.POWER_SERVICE);
        return manager == null || manager.isIgnoringBatteryOptimizations(getContext().getPackageName());
    }

    private JSObject status(boolean supported) {
        JSObject result = new JSObject();
        result.put("supported", supported || Build.VERSION.SDK_INT >= Build.VERSION_CODES.M);
        result.put("ignoringBatteryOptimizations", isIgnoringBatteryOptimizations());
        return result;
    }
}
