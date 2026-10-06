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
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/**
 * TheiaSession plugin — restricted WebView CAS login + cookie jar for the
 * mobile THEIA bridge. Credentials never touch app logs or exports.
 */
@CapacitorPlugin(name = "TheiaSession")
public class TheiaSessionPlugin extends Plugin {
    private static final String SESSION_COOKIE_KEY = "theia-session-cookies-v1";

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
        intent.putExtra(RestrictedLoginActivity.EXTRA_AUTO_FILL, call.getBoolean("autoFill", true));
        intent.putStringArrayListExtra(RestrictedLoginActivity.EXTRA_WHITELIST, new ArrayList<>(whitelist));

        startActivityForResult(call, intent, "loginFinished");
    }

    @ActivityCallback
    private void loginFinished(PluginCall call, ActivityResult result) {
        if (result.getResultCode() == Activity.RESULT_OK && result.getData() != null) {
            String cookies = result.getData().getStringExtra("theia_cookies");
            if (cookies != null && !cookies.isEmpty()) {
                try { TheiaVaultPlugin.writeStoredSecret(getContext(), SESSION_COOKIE_KEY, cookies); } catch (Exception ignored) { }
            }
            JSObject response = new JSObject();
            response.put("canceled", false);
            response.put("cookies", cookies == null ? "" : cookies);
            response.put("theolConnected", result.getData().getBooleanExtra("theia_theol_authenticated", false));
            call.resolve(response);
        } else {
            JSObject response = new JSObject();
            response.put("canceled", true);
            response.put("cookies", "");
            call.resolve(response);
        }
    }

    private String normalizeHost(String value) {
        String normalized = String.valueOf(value == null ? "" : value).trim().toLowerCase(Locale.ROOT);
        if (normalized.startsWith("https://")) normalized = normalized.substring("https://".length());
        if (normalized.startsWith("http://")) normalized = normalized.substring("http://".length());
        int slash = normalized.indexOf('/');
        return slash >= 0 ? normalized.substring(0, slash) : normalized;
    }

    private String[] cookieProbeUrls(String host) {
        if ("jwglxt.buct.edu.cn".equals(host)) {
            return new String[] {
                "https://" + host + "/",
                "https://" + host + "/sso/",
                "https://" + host + "/jwglxt/",
                "https://" + host + "/jwglxt/xtgl/",
            };
        }
        if ("course.buct.edu.cn".equals(host)) {
            return new String[] {
                // THEOL's legacy mobile API is HTTP and commonly scopes its
                // JSESSIONID to /mobile. CookieManager.getCookie is path-aware,
                // so HTTPS /meol/ probes alone silently lose the session used
                // by stuUnDoTaskList.do and homeworkView.do.
                "https://" + host + "/",
                "https://" + host + "/meol/",
                "https://" + host + "/meol/homepage/",
                "http://" + host + "/",
                "http://" + host + "/mobile/",
            };
        }
        if ("authserver.buct.edu.cn".equals(host)) {
            return new String[] {
                "https://" + host + "/",
                "https://" + host + "/authserver/",
            };
        }
        return new String[] {
            "https://" + host + "/",
            "https://" + host + "/sso/",
            "https://" + host + "/login/",
        };
    }

    private void mergeCookieHeader(Map<String, String> target, String raw) {
        if (raw == null || raw.isEmpty()) return;
        for (String pair : raw.split(";")) {
            int separator = pair.indexOf('=');
            if (separator <= 0) continue;
            String name = pair.substring(0, separator).trim();
            if (!name.isEmpty()) target.put(name, pair.substring(separator + 1).trim());
        }
    }

    private void storedCookiesForHost(String host, Map<String, String> target) {
        try {
            String stored = TheiaVaultPlugin.readStoredSecret(getContext(), SESSION_COOKIE_KEY);
            if (stored == null) return;
            for (String line : stored.split("\\n")) {
                int separator = line.indexOf('|');
                if (separator <= 0) continue;
                String lineHost = normalizeHost(line.substring(0, separator));
                if (!host.equals(lineHost)) continue;
                // CookieManager has already supplied every live path-scoped
                // value above. Use the encrypted snapshot only to fill gaps.
                Map<String, String> fallback = new LinkedHashMap<>();
                mergeCookieHeader(fallback, line.substring(separator + 1));
                for (Map.Entry<String, String> entry : fallback.entrySet()) {
                    target.putIfAbsent(entry.getKey(), entry.getValue());
                }
            }
        } catch (Exception ignored) { }
    }

    private String getCookiesForHost(String host) {
        Map<String, String> mergedCookies = new LinkedHashMap<>();
        for (String url : cookieProbeUrls(host)) {
            mergeCookieHeader(mergedCookies, CookieManager.getInstance().getCookie(url));
        }
        // CookieManager can expose a route cookie at / while hiding the
        // path-scoped JSESSIONID. Always merge the encrypted snapshot too;
        // otherwise a non-empty root response masks the useful fallback.
        storedCookiesForHost(host, mergedCookies);
        StringBuilder result = new StringBuilder();
        for (Map.Entry<String, String> entry : mergedCookies.entrySet()) {
            if (result.length() > 0) result.append(';');
            result.append(entry.getKey()).append('=').append(entry.getValue());
        }
        return result.toString();
    }

    @PluginMethod
    public void getCookies(PluginCall call) {
        String rawHost = call.getString("host");
        String host = normalizeHost(rawHost);
        if (host.isEmpty()) {
            call.reject("host is required");
            return;
        }
        JSObject result = new JSObject();
        result.put("cookies", getCookiesForHost(host));
        call.resolve(result);
    }

    @PluginMethod
    public void clearCookies(PluginCall call) {
        CookieManager manager = CookieManager.getInstance();
        manager.removeAllCookies(value -> {
            manager.flush();
            TheiaVaultPlugin.removeStoredSecret(getContext(), SESSION_COOKIE_KEY);
            call.resolve();
        });
    }
}
