package io.github.bakahuiii.theia.mobile;

import android.util.Log;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.net.ServerSocket;
import java.net.Socket;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Small loopback HTTP CONNECT proxy used only by the restricted login WebView.
 *
 * Some Android emulator/private-DNS profiles resolve ordinary public names but
 * fail on BUCT's portal alias. CONNECT keeps the original TLS SNI and Host
 * header, while this proxy supplies a bounded static fallback for the known
 * campus aliases. Normal DNS is tried first; ordinary Android devices do not
 * need the fallback at all.
 */
public final class CampusDnsProxy {
    private static final String TAG = "TheiaCampusProxy";
    private static final int CONNECT_TIMEOUT_MS = 12_000;
    private static final int HEADER_LIMIT = 64 * 1024;
    private static final Map<String, String> FALLBACK_IPS = new HashMap<>();

    static {
        FALLBACK_IPS.put("portal.buct.edu.cn", "121.195.153.209");
        FALLBACK_IPS.put("experimental-auth-endpoint.buct.edu.cn", "222.199.255.27");
        FALLBACK_IPS.put("caddy.buct.edu.cn", "222.199.255.27");
        FALLBACK_IPS.put("east-campus-servers-cluster.buct.edu.cn", "222.199.255.27");
        FALLBACK_IPS.put("jwglxt.buct.edu.cn", "121.195.154.238");
        FALLBACK_IPS.put("course.buct.edu.cn", "121.195.154.229");
    }

    private final ServerSocket server;
    private final ExecutorService workers = Executors.newCachedThreadPool(r -> {
        Thread thread = new Thread(r, "theia-campus-proxy");
        thread.setDaemon(true);
        return thread;
    });
    private volatile boolean stopped;

    private CampusDnsProxy(ServerSocket server) {
        this.server = server;
    }

    public static CampusDnsProxy start() throws IOException {
        ServerSocket server = new ServerSocket(0, 16, InetAddress.getByName("127.0.0.1"));
        CampusDnsProxy proxy = new CampusDnsProxy(server);
        proxy.workers.execute(proxy::acceptLoop);
        return proxy;
    }

    public int port() {
        return server.getLocalPort();
    }

    private void acceptLoop() {
        while (!stopped) {
            try {
                Socket client = server.accept();
                workers.execute(() -> handle(client));
            } catch (IOException error) {
                if (!stopped) {
                    // A transient accept failure should not crash the login Activity.
                }
            }
        }
    }

    private void handle(Socket client) {
        try (Socket local = client) {
            local.setSoTimeout(CONNECT_TIMEOUT_MS);
            byte[] headerBytes = readHeaders(local.getInputStream());
            if (headerBytes.length == 0) return;
            String headers = new String(headerBytes, StandardCharsets.ISO_8859_1);
            String firstLine = headers.split("\\r?\\n", 2)[0];
            String[] requestParts = firstLine.split(" ", 3);
            if (requestParts.length < 2) return;

            if ("CONNECT".equalsIgnoreCase(requestParts[0])) {
                String authority = requestParts[1];
                Log.i(TAG, "CONNECT " + authority);
                String host = authority;
                int colon = authority.lastIndexOf(':');
                int port = 443;
                if (colon > 0 && colon < authority.length() - 1) {
                    host = authority.substring(0, colon);
                    try { port = Integer.parseInt(authority.substring(colon + 1)); } catch (NumberFormatException ignored) { }
                }
                try (Socket upstream = connect(host, port)) {
                    OutputStream output = local.getOutputStream();
                    output.write("HTTP/1.1 200 Connection Established\r\n\r\n".getBytes(StandardCharsets.ISO_8859_1));
                    output.flush();
                    local.setSoTimeout(0);
                    pipeBothWays(local, upstream);
                }
                return;
            }

            // Basic support for plain HTTP proxy requests. HTTPS campus traffic
            // uses CONNECT, but this keeps old course endpoints functional.
            // Android HttpURLConnection versions are not consistent about
            // proxy request-target form: accept both absolute-form URLs and
            // origin-form paths such as /mobile/stuUnDoTaskList.do.
            java.net.URI uri = null;
            try { uri = java.net.URI.create(requestParts[1]); } catch (Exception ignored) { }
            String host = uri == null ? null : uri.getHost();
            int port = uri != null && uri.getPort() > 0 ? uri.getPort() : 80;
            String path;
            if (host != null) {
                path = uri.getRawPath();
                if (path == null || path.isEmpty()) path = "/";
                if (uri.getRawQuery() != null) path += "?" + uri.getRawQuery();
            } else {
                String hostHeader = headerValue(headers, "Host");
                if (hostHeader == null || hostHeader.isEmpty()) return;
                try {
                    java.net.URI hostUri = java.net.URI.create("http://" + hostHeader.trim());
                    host = hostUri.getHost();
                    port = hostUri.getPort() > 0 ? hostUri.getPort() : 80;
                } catch (Exception ignored) {
                    return;
                }
                if (host == null || host.isEmpty()) return;
                path = requestParts[1];
                if (path == null || path.isEmpty()) path = "/";
                if (!path.startsWith("/")) path = "/" + path;
            }
            try (Socket upstream = connect(host, port)) {
                upstream.setSoTimeout(CONNECT_TIMEOUT_MS);
                OutputStream upstreamOut = upstream.getOutputStream();
                String rewritten = requestParts[0] + " " + path + " " + requestParts[2] + "\r\n";
                String[] lines = headers.split("\\r?\\n");
                for (int index = 1; index < lines.length; index++) {
                    String line = lines[index];
                    if (line.isEmpty() || line.regionMatches(true, 0, "Proxy-", 0, 6)) continue;
                    if (line.regionMatches(true, 0, "Host:", 0, 5)) {
                        rewritten += "Host: " + host + (port != 80 ? ":" + port : "") + "\r\n";
                    } else {
                        rewritten += line + "\r\n";
                    }
                }
                rewritten += "Connection: close\r\n\r\n";
                upstreamOut.write(rewritten.getBytes(StandardCharsets.ISO_8859_1));
                int contentLength = contentLength(headers);
                if (contentLength > 0) {
                    byte[] body = readExactly(local.getInputStream(), contentLength);
                    upstreamOut.write(body);
                }
                upstreamOut.flush();
                pipe(upstream.getInputStream(), local.getOutputStream());
            }
        } catch (Exception error) {
            Log.w(TAG, "proxy request failed: " + error.getClass().getSimpleName());
            // WebView will surface the normal network error; no credentials or
            // response content is logged by this proxy.
        }
    }

    private static String headerValue(String headers, String wantedName) {
        for (String line : String.valueOf(headers).split("\\r?\\n")) {
            int separator = line.indexOf(':');
            if (separator <= 0) continue;
            if (line.substring(0, separator).trim().equalsIgnoreCase(wantedName)) {
                return line.substring(separator + 1).trim();
            }
        }
        return null;
    }
    private Socket connect(String host, int port) throws IOException {
        String normalized = String.valueOf(host).toLowerCase(Locale.ROOT);
        String fallback = FALLBACK_IPS.get(normalized);
        IOException last = null;
        // For the known campus aliases use the verified IP first. This avoids
        // accidentally resolving through Android's broken Private DNS before
        // the fallback branch gets a chance to run.
        if (fallback != null) {
            try {
                Socket socket = new Socket();
                socket.connect(new InetSocketAddress(InetAddress.getByName(fallback), port), CONNECT_TIMEOUT_MS);
                socket.setSoTimeout(0);
                Log.i(TAG, "connected " + normalized + " via fallback");
                return socket;
            } catch (IOException error) {
                last = error;
                Log.w(TAG, "fallback connect failed " + normalized + ": " + error.getClass().getSimpleName());
            }
        }
        InetAddress[] addresses;
        try {
            addresses = InetAddress.getAllByName(host);
        } catch (Exception error) {
            throw last == null ? new IOException("DNS unavailable") : last;
        }
        for (InetAddress address : addresses) {
            try {
                Socket socket = new Socket();
                socket.connect(new InetSocketAddress(address, port), CONNECT_TIMEOUT_MS);
                socket.setSoTimeout(0);
                return socket;
            } catch (IOException error) {
                last = error;
            }
        }
        throw last == null ? new IOException("connect failed") : last;
    }

    private static int contentLength(String headers) {
        for (String line : String.valueOf(headers).split("\\r?\\n")) {
            if (!line.regionMatches(true, 0, "Content-Length:", 0, "Content-Length:".length())) continue;
            try { return Math.max(0, Integer.parseInt(line.substring("Content-Length:".length()).trim())); }
            catch (NumberFormatException ignored) { return 0; }
        }
        return 0;
    }

    private static byte[] readExactly(InputStream input, int length) throws IOException {
        byte[] result = new byte[length];
        int offset = 0;
        while (offset < length) {
            int count = input.read(result, offset, length - offset);
            if (count < 0) throw new IOException("request body ended early");
            offset += count;
        }
        return result;
    }

    private static byte[] readHeaders(InputStream input) throws IOException {
        ByteArrayOutputStream output = new ByteArrayOutputStream();
        int previous = -1;
        int current;
        while (output.size() < HEADER_LIMIT && (current = input.read()) >= 0) {
            output.write(current);
            if (previous == '\r' && current == '\n') {
                byte[] value = output.toByteArray();
                int length = value.length;
                if (length >= 4 && value[length - 4] == '\r' && value[length - 3] == '\n'
                        && value[length - 2] == '\r' && value[length - 1] == '\n') break;
            }
            previous = current;
        }
        return output.toByteArray();
    }

    private static void pipeBothWays(Socket left, Socket right) throws InterruptedException {
        ExecutorService pipes = Executors.newFixedThreadPool(2);
        try {
            pipes.submit(() -> pipeSocket(left, right));
            pipes.submit(() -> pipeSocket(right, left));
            pipes.shutdown();
            pipes.awaitTermination(5, java.util.concurrent.TimeUnit.MINUTES);
        } finally {
            pipes.shutdownNow();
        }
    }

    private static void pipeSocket(Socket from, Socket to) {
        try {
            pipe(from.getInputStream(), to.getOutputStream());
        } catch (IOException ignored) { }
    }

    private static void pipe(InputStream input, OutputStream output) {
        try {
            byte[] buffer = new byte[16 * 1024];
            int count;
            while ((count = input.read(buffer)) >= 0) {
                if (count == 0) continue;
                output.write(buffer, 0, count);
                output.flush();
            }
        } catch (IOException ignored) { }
    }

    public void stop() {
        stopped = true;
        try { server.close(); } catch (IOException ignored) { }
        workers.shutdownNow();
    }
}
