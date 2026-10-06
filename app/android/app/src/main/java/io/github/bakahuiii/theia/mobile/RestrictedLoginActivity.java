package io.github.bakahuiii.theia.mobile;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.Intent;
import android.graphics.Bitmap;
import android.net.Uri;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.webkit.CookieManager;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebResourceError;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import androidx.webkit.ProxyConfig;
import androidx.webkit.ProxyController;

import org.json.JSONObject;
import android.widget.ProgressBar;
import android.widget.RelativeLayout;


import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.InetSocketAddress;
import java.net.Proxy;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * Restricted WebView for campus (CAS) login.
 *
 * Security contract (mobile-native-port-plan §6.2):
 *  - only HTTPS, only whitelisted campus domains (buct.edu.cn and subdomains)
 *  - no address bar, no downloads, no arbitrary external navigation
 *  - cookies captured on close and returned to the JS bridge
 *  - saved credentials are used only for the current login page and are never
 *    written to logs, WebView storage, or the returned activity result
 */
public class RestrictedLoginActivity extends Activity {

    // THEOL must enter through its own SSO endpoint. Loading personal.do
    // directly only proves the JWGLXT session and leaves THEOL as guest.
    private static final String THEOL_HOME = "https://course.buct.edu.cn/meol/homepage/common/sso_login.jsp";
    private static final String THEOL_MOBILE_TASKS = "http://course.buct.edu.cn/mobile/stuUnDoTaskList.do";
    private static final int THEOL_PROBE_MAX_ATTEMPTS = 20;

    public static final String EXTRA_URL = "theia_login_url";
    public static final String EXTRA_WHITELIST = "theia_login_whitelist";
    public static final String EXTRA_AUTO_FILL = "theia_login_auto_fill";

    private WebView webView;
    private ProgressBar progressBar;
    private final Set<String> whitelist = new HashSet<>();
    private final Handler handler = new Handler(Looper.getMainLooper());
    private String username = "";
    private String password = "";
    private boolean credentialsSubmitted = false;
    private boolean autoFillCredentials = true;
    private boolean academicAuthenticated = false;
    private boolean theolProbeStarted = false;
    private boolean theolAuthenticated = false;
    private boolean finished = false;
    private boolean dnsRepairAttempted = false;
    private CampusDnsProxy dnsProxy;
    private boolean proxyOverrideSet = false;
    private boolean proxyClearRequested = false;
    private Runnable loginTimeout = null;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        String initialUrl = getIntent().getStringExtra(EXTRA_URL);
        autoFillCredentials = getIntent().getBooleanExtra(EXTRA_AUTO_FILL, true);
        if (autoFillCredentials) loadSavedCredentials();
        List<String> extraWhitelist = getIntent().getStringArrayListExtra(EXTRA_WHITELIST);
        if (extraWhitelist != null) whitelist.addAll(extraWhitelist);
        // Default campus whitelist — subdomains match by suffix.
        whitelist.addAll(Arrays.asList(
            "buct.edu.cn", "jwglxt.buct.edu.cn", "course.buct.edu.cn",
            "authserver.buct.edu.cn", "experimental-auth-endpoint.buct.edu.cn",
            "portal.buct.edu.cn", "mail.buct.edu.cn", "motion.buct.edu.cn",
            "xsfw.buct.edu.cn", "ehall.buct.edu.cn", "lib.buct.edu.cn"
        ));

        RelativeLayout root = new RelativeLayout(this);
        webView = new WebView(this);
        progressBar = new ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal);
        progressBar.setId(android.view.View.generateViewId());
        RelativeLayout.LayoutParams webParams = new RelativeLayout.LayoutParams(
            RelativeLayout.LayoutParams.MATCH_PARENT, RelativeLayout.LayoutParams.MATCH_PARENT);
        RelativeLayout.LayoutParams progressParams = new RelativeLayout.LayoutParams(
            RelativeLayout.LayoutParams.MATCH_PARENT, dp(3));
        progressParams.addRule(RelativeLayout.ALIGN_PARENT_TOP);
        webParams.addRule(RelativeLayout.BELOW, progressBar.getId());
        root.addView(progressBar, progressParams);
        root.addView(webView, webParams);

        setContentView(root);
        configureWebView();

        // Match the mature THEIA authentication actor: automatic recovery is
        // bounded and must not leave a hidden/native login activity alive
        // forever when the provider changes its form or the network is down.
        loginTimeout = () -> {
            if (!finished) finishCanceled();
        };
        handler.postDelayed(loginTimeout, autoFillCredentials ? 30_000L : 120_000L);

        if (initialUrl != null) {
            loadInitialUrlWithDnsFallback(initialUrl);
        }
    }

    private void loadInitialUrlWithDnsFallback(String initialUrl) {
        try {
            dnsProxy = CampusDnsProxy.start();
            ProxyConfig config = new ProxyConfig.Builder()
                    .addProxyRule("http://127.0.0.1:" + dnsProxy.port(), ProxyConfig.MATCH_ALL_SCHEMES)
                    .addBypassRule("localhost")
                    .addBypassRule("127.0.0.1")
                    .addBypassRule("[::1]")
                    .build();
            ProxyController.getInstance().setProxyOverride(
                    config,
                    command -> handler.post(command),
                    () -> {
                        proxyOverrideSet = true;
                        if (!finished && webView != null) webView.loadUrl(initialUrl);
                    });
        } catch (Throwable ignored) {
            if (webView != null) webView.loadUrl(initialUrl);
        }
    }

    private void loadSavedCredentials() {
        try {
            String serialized = TheiaVaultPlugin.readStoredSecret(this, "unified-credentials");
            if (serialized == null) return;
            JSONObject record = new JSONObject(serialized);
            JSONObject value = record.optJSONObject("value");
            if (value == null) value = record;
            username = value.optString("username", "");
            password = value.optString("password", "");
        } catch (Exception ignored) {
            username = "";
            password = "";
        }
    }

    @SuppressLint("SetJavaScriptEnabled")
    private void configureWebView() {
        CookieManager.getInstance().setAcceptCookie(true);
        CookieManager.getInstance().setAcceptThirdPartyCookies(webView, true);
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setTextZoom(100);
        settings.setSupportZoom(false);
        settings.setBuiltInZoomControls(false);
        settings.setDisplayZoomControls(false);
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
                if (isAuthenticatedCampusUrl(url)) {
                    verifyAuthenticatedPage(view);
                    return;
                }
                if (isTheolPageUrl(url)) {
                    verifyTheolPage(view);
                    return;
                }
                scheduleCredentialFill(view);
            }

            @Override
            public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                if (!request.isForMainFrame() || dnsRepairAttempted || !isCampusUrl(request.getUrl().toString())) {
                    return;
                }
                dnsRepairAttempted = true;
                if (!finished && webView == view) view.reload();
            }

            @Override
            public void onReceivedHttpError(WebView view, WebResourceRequest request, WebResourceResponse errorResponse) {
                if (request.isForMainFrame() && !dnsRepairAttempted && isCampusUrl(request.getUrl().toString())) {
                    dnsRepairAttempted = true;
                    if (!finished && webView == view) view.reload();
                }
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

    /**
     * Do not treat a campus URL alone as proof of authentication. The desktop
     * THEIA parser uses the rendered page and navigation/profile markers; keep
     * the Android login gate equally conservative so an error/redirect page
     * cannot be mistaken for a successful CAS session.
     */
    private void verifyAuthenticatedPage(WebView view) {
        verifyAuthenticatedPage(view, 0);
    }

    private void verifyAuthenticatedPage(WebView view, int attempt) {
        if (finished) return;
        // The desktop contract requires an authenticated page, not merely a
        // redirect URL or a stale cookie. Wait for the rendered profile/menu
        // markers first, then require the session cookie for hand-off.
        String script = "(function(){"
            + "const pageUrl=new URL(location.href);"
            + "const loginForm=pageUrl.pathname.toLowerCase().endsWith('/xtgl/login_slogin.html')"
            + "||(document.querySelectorAll('#dl,#yhm,#mm').length>=2&&!!document.querySelector('form[action*=\"login_slogin\"]'));"
            + "const profileNode=document.querySelector('#yhm,#userName,.user-name,.media-heading,.glyphicon-user');"
            + "const profileText=profileNode?String((profileNode.parentElement||profileNode).innerText||'').replace(/\\s+/g,' ').trim():'';"
            + "const profile=!!profileText&&!/^(用户名|用户登录|登录)$/.test(profileText);"
            + "const studentNode=document.querySelector('#xh,#studentId,#sessionUserKey,[name=\"xh\"],[name=\"sessionUserKey\"]');"
            + "const studentId=!!String(studentNode&&(studentNode.value||studentNode.getAttribute('value'))||'').trim();"
            + "const academicMenu=[...document.querySelectorAll('a,button')].some(e=>{const label=String(e.innerText||'').trim();if(!label)return false;"
            + "const path=String(e.getAttribute('href')||'').toLowerCase();const action=String(e.getAttribute('onclick')||'').toLowerCase();"
            + "return action.includes('clickmenu(')||['jwglxt','cjcx','kbcx','kwgl'].some(part=>path.includes(part));});"
            + "const year=document.querySelector('#xnm,select[name=\"xnm\"],select[name=\"xnmValue\"],input[name=\"xnm\"]');"
            + "const semester=document.querySelector('#xqm,select[name=\"xqm\"],select[name=\"xqmValue\"],input[name=\"xqm\"]');"
            + "const academicTerm=!!String(year&&(year.value||year.getAttribute('value'))||'').trim()&&!!String(semester&&(semester.value||semester.getAttribute('value'))||'').trim();"
            + "const authenticated=!pageUrl.hostname.toLowerCase().endsWith('experimental-auth-endpoint.buct.edu.cn')&&(profile||studentId||academicTerm||academicMenu);"
            + "return (loginForm?'LOGIN':'')+'|'+(authenticated?'AUTH':'');"
            + "})()";
        view.evaluateJavascript(script, value -> {
            String result = String.valueOf(value);
            boolean hasLoginForm = result.contains("LOGIN");
            boolean looksAuthenticated = result.contains("AUTH");
            // Match the desktop parseJwHomepage evidence: profile/student id,
            // selected academic term, or an actual academic navigation link.
            // Never accept an error/blank page merely because a cookie exists.
            if (looksAuthenticated && !hasLoginForm && hasAcademicSessionCookie()) {
                academicAuthenticated = true;
                // Unified authentication and THEOL are separate channels. Do
                // not keep the user inside the THEOL WebView here: that page
                // can show the guest shell or hang on its password-save flow.
                // The renderer performs the dedicated Courser-compatible
                // THEOL mobile login after this activity returns.
                finishWithCookies();
            } else if (attempt < 20) {
                handler.postDelayed(() -> verifyAuthenticatedPage(view, attempt + 1), 500);
            } else if (hasLoginForm) {
                scheduleCredentialFill(view);
            }
        });
    }

    private boolean isTheolPageUrl(String rawUrl) {
        try {
            Uri uri = Uri.parse(rawUrl);
            String host = String.valueOf(uri.getHost()).toLowerCase();
            String path = String.valueOf(uri.getPath()).toLowerCase();
            return "course.buct.edu.cn".equals(host) && path.startsWith("/meol/");
        } catch (Exception ignored) {
            return false;
        }
    }

    private void probeTheolSession(WebView view) {
        if (finished || theolProbeStarted || !academicAuthenticated || view == null) return;
        theolProbeStarted = true;
        // CAS establishes the JWGLXT session first. Opening THEOL in the same
        // WebView completes the second campus-side SSO hand-off and stores the
        // course.buct.edu.cn session cookie before JS starts the data sync.
        handler.postDelayed(() -> {
            if (!finished && webView == view) view.loadUrl(THEOL_HOME);
        }, 250);
    }

    private void verifyTheolPage(WebView view) {
        // DOM text is not authoritative here: the guest THEOL shell also
        // contains labels such as “课程/作业”. The mobile task endpoint is the
        // same authenticated channel that the renderer will use after login,
        // so require its status=1 response before returning cookies.
        verifyTheolMobileSession(view, 0);
    }

    private void verifyTheolMobileSession(WebView view, int attempt) {
        if (finished || view == null) return;
        final String cookieHeader = getCookiesForHost("course.buct.edu.cn");
        if (cookieHeader.isEmpty()) {
            retryTheolMobileSession(view, attempt);
            return;
        }
        final CampusDnsProxy currentProxy = dnsProxy;
        Thread probe = new Thread(() -> {
            boolean authenticatedResult = false;
            HttpURLConnection connection = null;
            try {
                Proxy httpProxy = currentProxy == null
                    ? Proxy.NO_PROXY
                    : new Proxy(Proxy.Type.HTTP, new InetSocketAddress("127.0.0.1", currentProxy.port()));
                connection = (HttpURLConnection) new URL(THEOL_MOBILE_TASKS).openConnection(httpProxy);
                connection.setConnectTimeout(8_000);
                connection.setReadTimeout(8_000);
                connection.setInstanceFollowRedirects(false);
                connection.setUseCaches(false);
                connection.setRequestMethod("GET");
                connection.setRequestProperty("Cookie", cookieHeader);
                connection.setRequestProperty("Accept", "application/json");
                connection.setRequestProperty("X-Requested-With", "XMLHttpRequest");
                int status = connection.getResponseCode();
                InputStream stream = status >= 400 ? connection.getErrorStream() : connection.getInputStream();
                String body = readProbeBody(stream);
                authenticatedResult = status >= 200 && status < 300
                    && body.matches("(?s).*status\\s*:\\s*\\[?\\s*1\\s*\\]?.*")
                    && !body.contains("请登录");
            } catch (Exception ignored) {
                // Keep the bounded retry below; never expose cookies or the
                // response body in logs.
            } finally {
                if (connection != null) connection.disconnect();
            }
            final boolean authenticated = authenticatedResult;
            handler.post(() -> {
                if (finished || webView != view) return;
                if (authenticated) {
                    theolAuthenticated = true;
                    finishWithCookies();
                } else {
                    retryTheolMobileSession(view, attempt);
                }
            });
        }, "theia-theol-session-probe");
        probe.setDaemon(true);
        probe.start();
    }

    private void retryTheolMobileSession(WebView view, int attempt) {
        if (finished || webView != view) return;
        if (attempt < THEOL_PROBE_MAX_ATTEMPTS) {
            handler.postDelayed(() -> verifyTheolMobileSession(view, attempt + 1), 500);
        } else if (academicAuthenticated) {
            // Preserve the verified JWGLXT session, but leave theolAuthenticated
            // false so the bridge performs an explicit THEOL auth check instead
            // of treating a guest shell as a successful login.
            finishWithCookies();
        }
    }

    private static String readProbeBody(InputStream input) throws IOException {
        if (input == null) return "";
        try (InputStream stream = input; ByteArrayOutputStream output = new ByteArrayOutputStream()) {
            byte[] buffer = new byte[4096];
            int total = 0;
            int count;
            while ((count = stream.read(buffer)) >= 0) {
                if (count == 0) continue;
                total += count;
                if (total > 128 * 1024) break;
                output.write(buffer, 0, count);
            }
            return output.toString(StandardCharsets.UTF_8.name());
        }
    }

    private boolean hasAcademicSessionCookie() {
        CookieManager manager = CookieManager.getInstance();
        String[] urls = new String[] {
            "https://jwglxt.buct.edu.cn/",
            "https://jwglxt.buct.edu.cn/jwglxt/",
            "https://jwglxt.buct.edu.cn/sso/"
        };
        for (String url : urls) {
            String raw = manager.getCookie(url);
            // Zhengfang deployments do not all use the same session-cookie
            // name. The rendered authenticated landing page is already
            // validated separately, so accept the known session-cookie family
            // rather than a route/proxy cookie.
            // Match the mature desktop verifier: a rendered authenticated
            // page must carry a real session cookie, not just a route cookie
            // or a stale proxy marker left by the previous login attempt.
            if (raw != null && raw.matches("(?i).*\\b(?:JSESSIONID|SESSION|CASTGC|iPlanetDirectoryPro)=[^;\\s]+.*")) return true;
        }
        return false;
    }

    private void scheduleCredentialFill(WebView view) {
        if (!autoFillCredentials || view == null || !isCasEntryUrl(view.getUrl())) return;
        if (credentialsSubmitted || username.trim().isEmpty() || password.isEmpty()) return;
        long[] delays = new long[] { 100L, 500L, 1200L, 2500L, 5000L };
        for (long delay : delays) {
            handler.postDelayed(() -> fillCredentials(view), delay);
        }
    }

    private void fillCredentials(WebView view) {
        if (finished || credentialsSubmitted || username.trim().isEmpty() || password.isEmpty()) return;
        final String user = JSONObject.quote(username);
        final String pass = JSONObject.quote(password);
        String script = "(function(){"
            + "const u=" + user + ",p=" + pass + ";"
            + "const docs=[document];"
            + "for(const f of document.querySelectorAll('iframe')){try{if(f.contentDocument)docs.push(f.contentDocument)}catch(e){}}"
            + "const frame=document.getElementById('iframeObj');try{if(frame&&frame.contentDocument)docs.push(frame.contentDocument)}catch(e){}"            + "const visible=e=>!!e&&e.nodeType===1&&(e.offsetParent!==null||e.getClientRects().length>0);"
            + "const set=(e,v)=>{const w=e.ownerDocument.defaultView||window;const d=Object.getOwnPropertyDescriptor(w.HTMLInputElement.prototype,'value');if(d&&d.set)d.set.call(e,v);else e.value=v;e.dispatchEvent(new w.Event('input',{bubbles:true}));e.dispatchEvent(new w.Event('change',{bubbles:true}));};"
            + "for(const d of docs){"
            + "const inputs=[...d.querySelectorAll('input')].filter(visible);"
            + "const passInput=inputs.find(e=>e.id!=='hidMm'&&(String(e.type||'').toLowerCase()==='password'||/^(?:password|passwd|pwd|mm)$/i.test(String(e.name||'').trim())||e.id==='mm'));"
            + "const userInput=d.querySelector('input[name=username],input[name=userName],input[name=account],input[name=loginName],input[name=j_username],input[name=yhm],input[id=username],input[id=userName],input[id=account],input#yhm');"
            + "const fallback=inputs.find(e=>e!==passInput&&!['hidden','submit','button'].includes(String(e.type||'').toLowerCase()));"
            + "const uin=(userInput&&visible(userInput))?userInput:fallback;"
            + "if(!uin||!passInput)continue;set(uin,u);set(passInput,p);"
            + "const submit=[...d.querySelectorAll('button[type=submit],input[type=submit],button.btn-submit,button.login-btn,button.vanbtn,.vanbtn,#dl,a.btn-login,button[name=login]')].find(visible);"
            + "if(submit){submit.click()}else if(passInput.form&&passInput.form.requestSubmit){passInput.form.requestSubmit()}else if(passInput.form){passInput.form.submit()}"
            + "return 'submitted';}return 'not-ready';})()";
        view.evaluateJavascript(script, value -> {
            if (String.valueOf(value).contains("submitted")) credentialsSubmitted = true;
        });
    }

    private boolean isAllowed(Uri uri) {
        String scheme = uri.getScheme();
        if (scheme == null || !scheme.equalsIgnoreCase("https")) return false;
        String host = uri.getHost();
        if (host == null) return false;
        String normalizedHost = host.toLowerCase();
        for (String allowed : whitelist) {
            String normalizedAllowed = String.valueOf(allowed).toLowerCase();
            if (normalizedHost.equals(normalizedAllowed) || normalizedHost.endsWith("." + normalizedAllowed)) return true;
        }
        return false;
    }

    private boolean isCampusUrl(String rawUrl) {
        try {
            String host = String.valueOf(Uri.parse(rawUrl).getHost()).toLowerCase();
            return host.endsWith(".buct.edu.cn") || "buct.edu.cn".equals(host);
        } catch (Exception ignored) {
            return false;
        }
    }

    private boolean isCasEntryUrl(String rawUrl) {
        try {
            // CAS may move the form between these official entry hosts before
            // the iframe is ready. Keep autofill narrower than the navigation
            // allowlist so a campus application page can never receive the
            // saved unified password accidentally.
            String host = String.valueOf(Uri.parse(rawUrl).getHost()).toLowerCase();
            return "experimental-auth-endpoint.buct.edu.cn".equals(host)
                || "portal.buct.edu.cn".equals(host)
                || "authserver.buct.edu.cn".equals(host);
        } catch (Exception ignored) {
            return false;
        }
    }

    private boolean isAuthenticatedCampusUrl(String rawUrl) {
        try {
            Uri uri = Uri.parse(rawUrl);
            String host = String.valueOf(uri.getHost()).toLowerCase();
            String path = String.valueOf(uri.getPath()).toLowerCase();
            if (!host.equals("jwglxt.buct.edu.cn")) return false;
            return !path.contains("login_slogin")
                && (path.contains("/sso/") || path.contains("index_initmenu") || path.contains("/jwglxt/"));
        } catch (Exception ignored) {
            return false;
        }
    }

    @Override
    public void onBackPressed() {
        if (webView != null && webView.canGoBack()) {
            webView.goBack();
        } else {
            finishCanceled();
        }
    }

    private void finishCanceled() {
        if (finished) return;
        clearProxyOverride();
        finished = true;
        if (loginTimeout != null) handler.removeCallbacks(loginTimeout);
        setResult(Activity.RESULT_CANCELED);
        finish();
    }

    private void clearProxyOverride() {
        if (proxyClearRequested) return;
        proxyClearRequested = true;
        CampusDnsProxy proxy = dnsProxy;
        dnsProxy = null;
        Runnable stop = () -> { if (proxy != null) proxy.stop(); };
        try {
            if (proxyOverrideSet) {
                ProxyController.getInstance().clearProxyOverride(command -> handler.post(command), stop);
            } else {
                stop.run();
            }
        } catch (Throwable ignored) {
            stop.run();
        }
    }

    private void finishWithCookies() {
        if (finished) return;
        clearProxyOverride();
        finished = true;
        if (loginTimeout != null) handler.removeCallbacks(loginTimeout);
        try { CookieManager.getInstance().flush(); } catch (Exception ignored) { }
        Intent result = new Intent();
        result.putExtra("theia_cookies", captureCookies());
        result.putExtra("theia_theol_authenticated", theolAuthenticated);
        setResult(Activity.RESULT_OK, result);
        finish();
    }

    private String[] cookieProbeUrls(String host) {
        if ("jwglxt.buct.edu.cn".equalsIgnoreCase(host)) {
            // Zhengfang commonly scopes JSESSIONID to /jwglxt/ instead of /
            // and may put the SSO cookie under /sso/. Query each relevant
            // path; CookieManager.getCookie(url) is path-aware.
            return new String[] {
                "https://" + host + "/",
                "https://" + host + "/sso/",
                "https://" + host + "/jwglxt/",
                "https://" + host + "/jwglxt/xtgl/",
            };
        }
        if ("course.buct.edu.cn".equalsIgnoreCase(host)) {
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
        if ("authserver.buct.edu.cn".equalsIgnoreCase(host)) {
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

    private String getCookiesForHost(String host) {
        Map<String, String> merged = new LinkedHashMap<>();
        CookieManager manager = CookieManager.getInstance();
        for (String url : cookieProbeUrls(host)) {
            mergeCookieHeader(merged, manager.getCookie(url));
        }
        StringBuilder result = new StringBuilder();
        for (Map.Entry<String, String> entry : merged.entrySet()) {
            if (result.length() > 0) result.append(';');
            result.append(entry.getKey()).append('=').append(entry.getValue());
        }
        return result.toString();
    }

    private String captureCookies() {
        // Capture path-scoped cookies as well as root cookies. A root-only
        // getCookie("https://jwglxt.buct.edu.cn/") call silently omits the
        // usual /jwglxt/ JSESSIONID, which makes the JS bridge report a false
        // "session expired" immediately after a successful CAS login.
        StringBuilder sb = new StringBuilder();
        CookieManager cookieManager = CookieManager.getInstance();
        for (String host : whitelist) {
            if (host.equals("buct.edu.cn") || host.startsWith("www.")) continue;
            Map<String, String> merged = new LinkedHashMap<>();
            for (String url : cookieProbeUrls(host)) {
                mergeCookieHeader(merged, cookieManager.getCookie(url));
            }
            if (!merged.isEmpty()) {
                if (sb.length() > 0) sb.append("\n");
                sb.append(host).append("|");
                boolean first = true;
                for (Map.Entry<String, String> entry : merged.entrySet()) {
                    if (!first) sb.append("; ");
                    first = false;
                    sb.append(entry.getKey()).append('=').append(entry.getValue());
                }
            }
        }
        return sb.toString();
    }

    private int dp(int value) {
        return Math.round(getResources().getDisplayMetrics().density * value);
    }

    @Override
    protected void onDestroy() {
        clearProxyOverride();
        if (loginTimeout != null) handler.removeCallbacks(loginTimeout);
        handler.removeCallbacksAndMessages(null);
        // Release transient credential references as soon as the restricted
        // activity leaves the foreground.
        username = "";
        password = "";
        if (webView != null) webView.destroy();
        super.onDestroy();
    }
}
