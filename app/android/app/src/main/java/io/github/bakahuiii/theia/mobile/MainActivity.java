package io.github.bakahuiii.theia.mobile;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(android.os.Bundle savedInstanceState) {
        registerPlugin(TheiaSessionPlugin.class);
        registerPlugin(TheiaVaultPlugin.class);
        registerPlugin(TheiaHttpPlugin.class);
        registerPlugin(TheiaBackgroundPlugin.class);
        registerPlugin(TheiaBatteryPlugin.class);
        super.onCreate(savedInstanceState);
        if (getBridge() != null && getBridge().getWebView() != null) {
            android.webkit.WebSettings settings = getBridge().getWebView().getSettings();
            settings.setTextZoom(100);
            settings.setSupportZoom(false);
            settings.setBuiltInZoomControls(false);
            settings.setDisplayZoomControls(false);
        }
    }
}
