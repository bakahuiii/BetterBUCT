package io.github.bakahuiii.theia.mobile;

import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;

import androidx.core.content.FileProvider;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.BufferedInputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.RandomAccessFile;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.Locale;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Streams a signed APK into the app cache and hands it to Android's package
 * installer. The APK never passes through the JavaScript heap.
 */
@CapacitorPlugin(name = "TheiaUpdate")
public class TheiaUpdatePlugin extends Plugin {
    private static final String UPDATE_DIRECTORY = "updates";
    private static final int BUFFER_SIZE = 64 * 1024;
    private static final int MAX_REDIRECTS = 5;
    private static final ExecutorService WORKERS = Executors.newCachedThreadPool(r -> {
        Thread thread = new Thread(r, "betterbuct-update");
        thread.setDaemon(true);
        return thread;
    });

    @PluginMethod
    public void downloadApk(PluginCall call) {
        String rawUrl = call.getString("url");
        if (!isAllowedDownloadUrl(rawUrl)) {
            call.reject("更新地址不受支持");
            return;
        }

        String requestedName = call.getString("fileName", "BetterBUCT-update.apk");
        String fileName = safeApkFileName(requestedName);
        WORKERS.execute(() -> download(call, rawUrl, fileName));
    }

    private void download(PluginCall call, String rawUrl, String fileName) {
        HttpURLConnection connection = null;
        File part = null;
        try {
            File directory = updateDirectory();
            if (!directory.exists() && !directory.mkdirs()) throw new IOException("cannot create update directory");
            File destination = new File(directory, fileName);
            part = new File(directory, fileName + ".part");
            if (part.exists() && !part.delete()) throw new IOException("cannot replace partial download");

            URL url = new URL(rawUrl);
            int redirects = 0;
            int responseCode;
            while (true) {
                connection = (HttpURLConnection) url.openConnection();
                connection.setConnectTimeout(20_000);
                connection.setReadTimeout(60_000);
                connection.setInstanceFollowRedirects(false);
                connection.setUseCaches(false);
                connection.setRequestProperty("Accept", "application/vnd.android.package-archive, application/octet-stream");
                connection.setRequestProperty("User-Agent", "BetterBUCT-Android-Updater");

                responseCode = connection.getResponseCode();
                if (responseCode < 300 || responseCode >= 400) break;
                if (redirects++ >= MAX_REDIRECTS) throw new IOException("too many redirects");
                String location = connection.getHeaderField("Location");
                if (location == null || location.trim().isEmpty()) throw new IOException("redirect missing location");
                URL redirected = new URL(url, location);
                if (!isAllowedRedirectUrl(redirected.toString())) throw new IOException("redirect target is not allowed");
                connection.disconnect();
                connection = null;
                url = redirected;
            }
            if (responseCode < 200 || responseCode >= 300) throw new IOException("unexpected response");
            long totalBytes = connection.getContentLengthLong();
            long transferredBytes = 0;
            long startedAt = System.nanoTime();
            long lastEventAt = 0;

            try (InputStream input = new BufferedInputStream(connection.getInputStream());
                 FileOutputStream output = new FileOutputStream(part)) {
                byte[] buffer = new byte[BUFFER_SIZE];
                int count;
                while ((count = input.read(buffer)) != -1) {
                    if (count == 0) continue;
                    output.write(buffer, 0, count);
                    transferredBytes += count;
                    long now = System.nanoTime();
                    if (lastEventAt == 0 || now - lastEventAt >= 150_000_000L || (totalBytes > 0 && transferredBytes >= totalBytes)) {
                        notifyProgress(transferredBytes, totalBytes, startedAt);
                        lastEventAt = now;
                    }
                }
                output.flush();
            }

            if (transferredBytes <= 0 || !part.isFile()) throw new IOException("empty update package");
            if (!looksLikeApk(part)) throw new IOException("downloaded file is not an APK");
            if (destination.exists() && !destination.delete()) throw new IOException("cannot replace old package");
            if (!part.renameTo(destination)) throw new IOException("cannot finalize update package");
            notifyProgress(transferredBytes, totalBytes > 0 ? totalBytes : transferredBytes, startedAt);

            JSObject result = new JSObject();
            result.put("path", destination.getAbsolutePath());
            result.put("bytes", transferredBytes);
            result.put("fileName", fileName);
            call.resolve(result);
        } catch (Exception error) {
            if (part != null && part.exists()) part.delete();
            call.reject("更新下载失败");
        } finally {
            if (connection != null) connection.disconnect();
        }
    }

    @PluginMethod
    public void installApk(PluginCall call) {
        try {
            String suppliedPath = call.getString("path");
            File apk = suppliedPath == null || suppliedPath.trim().isEmpty()
                    ? newestDownloadedApk()
                    : validatedApk(new File(suppliedPath));
            if (apk == null || !apk.isFile() || apk.length() <= 0) {
                call.reject("没有找到已下载的更新包");
                return;
            }

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
                    && !getContext().getPackageManager().canRequestPackageInstalls()) {
                openUnknownSourcesSettings();
                JSObject result = new JSObject();
                result.put("opened", false);
                result.put("requiresUnknownSourcesPermission", true);
                call.resolve(result);
                return;
            }

            Uri uri = FileProvider.getUriForFile(
                    getContext(), getContext().getPackageName() + ".fileprovider", apk);
            Intent intent = new Intent(Intent.ACTION_VIEW);
            intent.setDataAndType(uri, "application/vnd.android.package-archive");
            intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);

            JSObject result = new JSObject();
            result.put("opened", true);
            result.put("requiresUnknownSourcesPermission", false);
            call.resolve(result);
        } catch (Exception error) {
            call.reject("无法打开系统安装器");
        }
    }

    @PluginMethod
    public void openInstallSettings(PluginCall call) {
        try {
            openUnknownSourcesSettings();
            JSObject result = new JSObject();
            result.put("opened", true);
            call.resolve(result);
        } catch (Exception error) {
            call.reject("无法打开安装权限设置");
        }
    }

    private void notifyProgress(long transferredBytes, long totalBytes, long startedAt) {
        long elapsedNanos = Math.max(1L, System.nanoTime() - startedAt);
        double bytesPerSecond = transferredBytes * 1_000_000_000d / elapsedNanos;
        JSObject progress = new JSObject();
        progress.put("transferredBytes", transferredBytes);
        progress.put("totalBytes", totalBytes);
        progress.put("percent", totalBytes > 0 ? Math.min(100d, transferredBytes * 100d / totalBytes) : 0d);
        progress.put("bytesPerSecond", bytesPerSecond);
        notifyListeners("downloadProgress", progress);
    }

    private File updateDirectory() {
        File root = getContext().getCacheDir();
        return new File(root, UPDATE_DIRECTORY);
    }

    private File validatedApk(File candidate) throws IOException {
        File directory = updateDirectory().getCanonicalFile();
        File file = candidate.getCanonicalFile();
        String directoryPath = directory.getPath() + File.separator;
        if (!file.getPath().startsWith(directoryPath)
                || !file.getName().toLowerCase(Locale.ROOT).endsWith(".apk")) {
            throw new IOException("invalid update path");
        }
        return file;
    }

    private File newestDownloadedApk() throws IOException {
        File directory = updateDirectory();
        File[] files = directory.listFiles((dir, name) -> name.toLowerCase(Locale.ROOT).endsWith(".apk"));
        File newest = null;
        if (files != null) {
            for (File file : files) {
                if (file.isFile() && (newest == null || file.lastModified() > newest.lastModified())) newest = file;
            }
        }
        return newest == null ? null : validatedApk(newest);
    }

    private static boolean looksLikeApk(File file) throws IOException {
        if (file.length() < 4) return false;
        try (RandomAccessFile input = new RandomAccessFile(file, "r")) {
            return input.read() == 'P'
                    && input.read() == 'K'
                    && input.read() == 3
                    && input.read() == 4;
        }
    }

    private void openUnknownSourcesSettings() {
        Intent intent = new Intent(android.provider.Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES);
        intent.setData(Uri.parse("package:" + getContext().getPackageName()));
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        getContext().startActivity(intent);
    }

    private static String safeApkFileName(String value) {
        String candidate = String.valueOf(value == null ? "" : value)
                .replaceAll("[^A-Za-z0-9._-]", "_");
        if (candidate.isEmpty()) candidate = "BetterBUCT-update";
        if (!candidate.toLowerCase(Locale.ROOT).endsWith(".apk")) candidate += ".apk";
        if (candidate.length() > 160) candidate = candidate.substring(0, 156) + ".apk";
        return candidate;
    }

    private static boolean isAllowedDownloadUrl(String rawUrl) {
        try {
            URL url = new URL(String.valueOf(rawUrl));
            String scheme = url.getProtocol();
            String host = url.getHost().toLowerCase(Locale.ROOT);
            String path = url.getPath().toLowerCase(Locale.ROOT);
            return "https".equalsIgnoreCase(scheme)
                    && ("github.com".equals(host) || "www.github.com".equals(host)
                    || host.endsWith(".githubusercontent.com"))
                    && path.endsWith(".apk");
        } catch (Exception ignored) {
            return false;
        }
    }

    private static boolean isAllowedRedirectUrl(String rawUrl) {
        try {
            URL url = new URL(String.valueOf(rawUrl));
            return "https".equalsIgnoreCase(url.getProtocol())
                    && "release-assets.githubusercontent.com".equalsIgnoreCase(url.getHost());
        } catch (Exception ignored) {
            return false;
        }
    }
}
