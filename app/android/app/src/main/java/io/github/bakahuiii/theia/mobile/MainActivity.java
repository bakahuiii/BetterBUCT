package io.github.bakahuiii.theia.mobile;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(android.os.Bundle savedInstanceState) {
        registerPlugin(TheiaSessionPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
