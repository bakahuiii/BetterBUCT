package io.github.bakahuiii.theia.mobile;

import android.util.Base64;
import android.util.Log;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.PluginMethod;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.InetSocketAddress;
import java.net.Proxy;
import java.net.URL;
import java.net.URLConnection;
import java.nio.charset.StandardCharsets;
import java.util.Iterator;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Campus-only HTTP transport for Android.
 *
 * CapacitorHttp delegates DNS to the emulator's resolver. When Private DNS is
 * broken, the login WebView can use CampusDnsProxy but ordinary API requests
 * still fail before JavaScript sees a response. This plugin sends the same
 * requests through the loopback CONNECT proxy, preserving the original HTTPS
 * hostname/SNI while the proxy supplies the verified campus-IP fallback.
 */
@CapacitorPlugin(name = "TheiaHttp")
public class TheiaHttpPlugin extends Plugin {
    private static final int MAX_RESPONSE_BYTES = 32 * 1024 * 1024;
    private static final ExecutorService WORKERS = Executors.newCachedThreadPool(r -> {
        Thread thread = new Thread(r, "theia-campus-http");
        thread.setDaemon(true);
        return thread;
    });
    private static final Object PROXY_LOCK = new Object();
    private static volatile CampusDnsProxy campusProxy;

    private static CampusDnsProxy proxy() throws IOException {
        CampusDnsProxy current = campusProxy;
        if (current != null) return current;
        synchronized (PROXY_LOCK) {
            current = campusProxy;
            if (current == null) {
                current = CampusDnsProxy.start();
                campusProxy = current;
            }
            return current;
        }
    }

    @PluginMethod
    public void request(PluginCall call) {
        String rawUrl = call.getString("url");
        if (!isAllowedUrl(rawUrl)) {
            call.reject("仅允许访问北化校园网络地址");
            return;
        }
        // Android's resolver may prefer an unreachable IPv6 answer for the
        // legacy THEOL host. The loopback proxy already has the verified IPv4
        // fallback and preserves the original Host header, so use it first for
        // this one HTTP-only endpoint instead of waiting for a 60-second DNS
        // socket timeout before retrying.
        boolean preferProxy = prefersCampusProxy(rawUrl);
        WORKERS.execute(() -> perform(call, rawUrl, preferProxy));
    }

    private void perform(PluginCall call, String rawUrl, boolean forceProxy) {
        HttpURLConnection connection = null;
        String method = call.getString("method", "GET");
        try {
            URL url = new URL(rawUrl);
            boolean directHttp = "http".equalsIgnoreCase(url.getProtocol());
            URLConnection opened;
            if (directHttp && !forceProxy) {
                // The task feed is an official legacy HTTP endpoint. Prefer a
                // direct connection when Android DNS works; if private DNS is
                // broken, the catch block retries through CampusDnsProxy.
                opened = url.openConnection(Proxy.NO_PROXY);
            } else {
                CampusDnsProxy dnsProxy = proxy();
                Proxy httpProxy = new Proxy(Proxy.Type.HTTP,
                        new InetSocketAddress("127.0.0.1", dnsProxy.port()));
                opened = url.openConnection(httpProxy);
            }
            if (!(opened instanceof HttpURLConnection)) throw new IOException("unsupported campus protocol");
            connection = (HttpURLConnection) opened;
            connection.setConnectTimeout(call.getInt("connectTimeout", 30_000));
            connection.setReadTimeout(call.getInt("readTimeout", 30_000));
            connection.setInstanceFollowRedirects(!call.getBoolean("disableRedirects", true));
            connection.setUseCaches(false);

            if (method == null || !method.matches("[A-Za-z]+")) throw new IOException("invalid HTTP method");
            connection.setRequestMethod(method.toUpperCase(java.util.Locale.ROOT));
            JSObject inputHeaders = call.getObject("headers");
            if (inputHeaders != null) {
                Iterator<String> keys = inputHeaders.keys();
                while (keys.hasNext()) {
                    String name = keys.next();
                    if (name == null || name.isEmpty()) continue;
                    // HttpURLConnection owns these hop-by-hop/request-target
                    // headers. Cookie, Referer and Origin are intentionally
                    // preserved because they carry the campus session.
                    String lower = name.toLowerCase(java.util.Locale.ROOT);
                    if (lower.equals("host") || lower.equals("content-length") || lower.equals("connection")) continue;
                    Object value = inputHeaders.opt(name);
                    if (value == null || value == org.json.JSONObject.NULL) continue;
                    connection.setRequestProperty(name, String.valueOf(value));
                }
            }

            String data = call.getString("data");
            if (data != null && !data.isEmpty() && !method.equalsIgnoreCase("GET")
                    && !method.equalsIgnoreCase("HEAD") && !method.equalsIgnoreCase("OPTIONS")) {
                connection.setDoOutput(true);
                byte[] body = data.getBytes(StandardCharsets.UTF_8);
                connection.setFixedLengthStreamingMode(body.length);
                try (OutputStream output = connection.getOutputStream()) {
                    output.write(body);
                }
            }

            int status = connection.getResponseCode();
            InputStream stream = status >= 400 ? connection.getErrorStream() : connection.getInputStream();
            byte[] body = stream == null ? new byte[0] : readBounded(stream, MAX_RESPONSE_BYTES);
            String contentType = connection.getContentType();
            JSObject headers = new JSObject();
            for (Map.Entry<String, List<String>> entry : connection.getHeaderFields().entrySet()) {
                String name = entry.getKey();
                if (name == null || name.isEmpty()) continue;
                List<String> values = entry.getValue();
                if (values == null || values.isEmpty()) continue;
                StringBuilder joined = new StringBuilder();
                for (String value : values) {
                    if (value == null) continue;
                    if (joined.length() > 0) joined.append(", ");
                    joined.append(value);
                }
                if (joined.length() > 0) headers.put(name, joined.toString());
            }
            if (contentType != null && !headers.has("Content-Type") && !headers.has("content-type")) {
                headers.put("Content-Type", contentType);
            }

            JSObject result = new JSObject();
            result.put("status", status);
            result.put("url", connection.getURL().toString());
            result.put("headers", headers);
            // Keep the bridge representation unambiguous. This also avoids
            // Capacitor/Android JSON auto-parsing differences for HTML/JSON.
            result.put("data", Base64.encodeToString(body, Base64.NO_WRAP));
            result.put("dataEncoding", "base64");
            call.resolve(result);
        } catch (Exception error) {
            // HTTP task-list requests are safe to retry once through the
            // campus proxy after a direct DNS/socket failure. Do not retry
            // POSTs because a server may already have received their body.
            boolean safeHttpRetry = !forceProxy
                    && rawUrl.regionMatches(true, 0, "http://", 0, "http://".length())
                    && ("GET".equalsIgnoreCase(method) || "HEAD".equalsIgnoreCase(method));
            if (safeHttpRetry) {
                perform(call, rawUrl, true);
                return;
            }
            // Do not include URL query parameters, request bodies, cookies, or
            // exception details in the user-visible/native log. Keep only a
            // bounded class/message diagnostic in logcat for troubleshooting.
            String kind = error == null ? "unknown" : error.getClass().getSimpleName();
            String detail = error == null ? "" : String.valueOf(error.getMessage());
            if (detail.length() > 120) detail = detail.substring(0, 120);
            String failedEndpoint = "campus";
            try {
                URL failedUrl = new URL(rawUrl);
                failedEndpoint = failedUrl.getHost() + failedUrl.getPath();
            } catch (Exception ignored) { }
            android.util.Log.w("TheiaHttp", "campus request failed " + failedEndpoint +
                    " transport=" + (forceProxy ? "proxy" : "campus") + " " + kind +
                    (detail.isEmpty() ? "" : ": " + detail));
            call.reject("校园网络请求失败");
        } finally {
            if (connection != null) connection.disconnect();
        }
    }
    private static byte[] readBounded(InputStream input, int maximum) throws IOException {
        try (InputStream stream = input; ByteArrayOutputStream output = new ByteArrayOutputStream()) {
            byte[] buffer = new byte[16 * 1024];
            int total = 0;
            int count;
            while ((count = stream.read(buffer)) >= 0) {
                if (count == 0) continue;
                total += count;
                if (total > maximum) throw new IOException("response too large");
                output.write(buffer, 0, count);
            }
            return output.toByteArray();
        }
    }

    private static boolean prefersCampusProxy(String rawUrl) {
        try {
            URL url = new URL(String.valueOf(rawUrl));
            return "http".equalsIgnoreCase(url.getProtocol())
                    && "course.buct.edu.cn".equalsIgnoreCase(url.getHost());
        } catch (Exception ignored) {
            return false;
        }
    }

    private static boolean isAllowedUrl(String rawUrl) {
        try {
            URL url = new URL(String.valueOf(rawUrl));
            String scheme = url.getProtocol();
            String host = String.valueOf(url.getHost()).toLowerCase(java.util.Locale.ROOT);
            return ("https".equalsIgnoreCase(scheme) || "http".equalsIgnoreCase(scheme))
                    && ("buct.edu.cn".equals(host) || host.endsWith(".buct.edu.cn"));
        } catch (Exception ignored) {
            return false;
        }
    }
}

