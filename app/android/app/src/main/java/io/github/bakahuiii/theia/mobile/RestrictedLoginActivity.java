package io.github.bakahuiii.theia.mobile;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.Intent;
import android.graphics.Bitmap;
import android.net.Uri;
import android.os.Bundle;
import android.webkit.CookieManager;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.ProgressBar;
import android.widget.RelativeLayout;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

/**
 * Restricted WebView for campus (CAS) login.
 *
 * Security contract (mobile-native-port-plan §6.2):
 *  - only HTTPS, only whitelisted campus domains (buct.edu.cn and subdomains)
 *  - no address bar, no downloads, no arbitrary external navigation
 *  - cookies captured on close and returned to the JS bridge
 */
public class RestrictedLoginActivity extends Activity {

    public static final String EXTRA_URL = "theia_login_url";
    public static final String EXTRA_WHITELIST = "theia_login_whitelist";

    private WebView webView;
    private ProgressBar progressBar;
    private final Set<String> whitelist = new HashSet<>();

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        String initialUrl = getIntent().getStringExtra(EXTRA_URL);
        List<String> extraWhitelist = getIntent().getStringArrayListExtra(EXTRA_WHITELIST);
        if (extraWhitelist != null) whitelist.addAll(extraWhitelist);
        // Default campus whitelist — subdomains match by suffix.
        whitelist.addAll(Arrays.asList(
            "buct.edu.cn", "jwglxt.buct.edu.cn", "course.buct.edu.cn",
            "authserver.buct.edu.cn", "mail.buct.edu.cn", "motion.buct.edu.cn",
            "xsfw.buct.edu.cn", "ehall.buct.edu.cn", "lib.buct.edu.cn"
        ));

        RelativeLayout root = new RelativeLayout(this);
        webView = new WebView(this);
        progressBar = new ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal);
        RelativeLayout.LayoutParams webParams = new RelativeLayout.LayoutParams(
            RelativeLayout.LayoutParams.MATCH_PARENT, RelativeLayout.LayoutParams.MATCH_PARENT);
        RelativeLayout.LayoutParams progressParams = new RelativeLayout.LayoutParams(
            RelativeLayout.LayoutParams.MATCH_PARENT, dp(3));
        progressParams.addRule(RelativeLayout.ALIGN_PARENT_TOP);
        webParams.addRule(RelativeLayout.BELOW, progressBar.getId() == 0 ? -1 : progressBar.getId());
        root.addView(progressBar, progressParams);
        webParams.addRule(RelativeLayout.BELOW, progressBar.getId());
        root.addView(webView, webParams);

        setContentView(root);
        configureWebView();

        if (initialUrl != null) {
            webView.loadUrl(initialUrl);
        }
    }

    @SuppressLint("SetJavaScriptEnabled")
    private void configureWebView() {
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setAllowFileAccessFromFileURLs(false);
        settings.setAllowUniversalAccessFromFileURLs(false);
        settings.setCacheMode(WebSettings.LOAD_DEFAULT);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                if (!isAllowed(uri)) return true; // block navigation to disallowed hosts
                return false;
            }

            @Override
            public void onPageStarted(WebView view, String url, Bitmap favicon) {
                progressBar.setVisibility(ProgressBar.VISIBLE);
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                progressBar.setVisibility(ProgressBar.GONE);
            }

            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                // Block any sub-resource from a disallowed host (ad/mixed-content hardening)
                if (!isAllowed(request.getUrl())) {
                    return new WebResourceResponse("text/plain", "utf-8", null);
                }
                return super.shouldInterceptRequest(view, request);
            }
        });

        webView.setDownloadListener((url, userAgent, contentDisposition, mimetype, contentLength) -> {
            // Downloads are not permitted inside the restricted login.
        });
    }

    private boolean isAllowed(Uri uri) {
        String scheme = uri.getScheme();
        if (scheme == null || !scheme.equals("https")) return false;
        String host = uri.getHost();
        if (host == null) return false;
        for (String allowed : whitelist) {
            if (host.equals(allowed) || host.endsWith("." + allowed)) return true;
        }
        return false;
    }

    @Override
    public void onBackPressed() {
        if (webView.canGoBack()) {
            webView.goBack();
        } else {
            finishWithCookies();
        }
    }

    private void finishWithCookies() {
        Intent result = new Intent();
        result.putExtra("theia_cookies", captureCookies());
        setResult(Activity.RESULT_OK, result);
        finish();
    }

    private String captureCookies() {
        // Capture cookies for all whitelisted hosts known to this WebView.
        StringBuilder sb = new StringBuilder();
        for (String host : whitelist) {
            if (host.equals("buct.edu.cn") || host.startsWith("www.")) continue;
            String cookies = CookieManager.getInstance().getCookie("https://" + host + "/");
            if (cookies != null && !cookies.isEmpty()) {
                if (sb.length() > 0) sb.append("\n");
                sb.append(host).append("|").append(cookies);
            }
        }
        return sb.toString();
    }

    private int dp(int value) {
        return Math.round(getResources().getDisplayMetrics().density * value);
    }

    @Override
    protected void onDestroy() {
        if (webView != null) webView.destroy();
        super.onDestroy();
    }
}
