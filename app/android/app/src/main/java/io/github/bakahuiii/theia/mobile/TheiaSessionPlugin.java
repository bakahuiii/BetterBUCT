package io.github.bakahuiii.theia.mobile;

import android.app.Activity;
import android.content.Intent;
import android.webkit.CookieManager;

import androidx.activity.result.ActivityResult;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.util.ArrayList;
import java.util.List;

/**
 * TheiaSession plugin — restricted WebView CAS login + cookie jar for the
 * mobile THEIA bridge. Credentials never touch app logs or exports.
 */
@CapacitorPlugin(name = "TheiaSession")
public class TheiaSessionPlugin extends Plugin {

    @PluginMethod
    public void openRestrictedLogin(PluginCall call) {
        String url = call.getString("url");
        if (url == null || url.isEmpty()) {
            call.reject("url is required");
            return;
        }
        JSArray whitelistArg = call.getArray("whitelist", new JSArray());
        List<String> whitelist = new ArrayList<>();
        for (int i = 0; i < whitelistArg.length(); i++) {
            String value = whitelistArg.optString(i, null);
            if (value != null && !value.isEmpty()) whitelist.add(value);
        }

        Intent intent = new Intent(getContext(), RestrictedLoginActivity.class);
        intent.putExtra(RestrictedLoginActivity.EXTRA_URL, url);
        intent.putStringArrayListExtra(RestrictedLoginActivity.EXTRA_WHITELIST, new ArrayList<>(whitelist));

        startActivityForResult(call, intent, "loginFinished");
    }

    @ActivityCallback
    private void loginFinished(PluginCall call, ActivityResult result) {
        if (result.getResultCode() == Activity.RESULT_OK && result.getData() != null) {
            String cookies = result.getData().getStringExtra("theia_cookies");
            JSObject response = new JSObject();
            response.put("canceled", false);
            response.put("cookies", cookies == null ? "" : cookies);
            call.resolve(response);
        } else {
            JSObject response = new JSObject();
            response.put("canceled", true);
            response.put("cookies", "");
            call.resolve(response);
        }
    }

    @PluginMethod
    public void getCookies(PluginCall call) {
        String host = call.getString("host");
        if (host == null || host.isEmpty()) {
            call.reject("host is required");
            return;
        }
        String url = (host.startsWith("http") ? host : "https://" + host + "/");
        String cookies = CookieManager.getInstance().getCookie(url);
        JSObject result = new JSObject();
        result.put("cookies", cookies == null ? "" : cookies);
        call.resolve(result);
    }

    @PluginMethod
    public void clearCookies(PluginCall call) {
        String host = call.getString("host");
        if (host != null && !host.isEmpty()) {
            String url = (host.startsWith("http") ? host : "https://" + host + "/");
            CookieManager.getInstance().setCookie(url, "");
        }
        call.resolve();
    }
}
