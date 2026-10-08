package io.github.bakahuiii.theia.mobile;

import android.view.View;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(android.os.Bundle savedInstanceState) {
        registerPlugin(TheiaSessionPlugin.class);
        registerPlugin(TheiaVaultPlugin.class);
        registerPlugin(TheiaHttpPlugin.class);
        registerPlugin(TheiaBackgroundPlugin.class);
        registerPlugin(TheiaBatteryPlugin.class);
        registerPlugin(TheiaUpdatePlugin.class);
        super.onCreate(savedInstanceState);
        if (getBridge() != null && getBridge().getWebView() != null) {
            android.webkit.WebView webView = getBridge().getWebView();
            android.webkit.WebSettings settings = webView.getSettings();
            settings.setTextZoom(100);
            settings.setSupportZoom(false);
            settings.setBuiltInZoomControls(false);
            settings.setDisplayZoomControls(false);
            // The mobile client exposes explicit refresh actions. Disable the
            // native edge effect so dragging past the top cannot trigger a
            // refresh gesture or leave the WebView in an overscrolled state.
            webView.setOverScrollMode(View.OVER_SCROLL_NEVER);
            webView.setNestedScrollingEnabled(false);
        }
    }
}
