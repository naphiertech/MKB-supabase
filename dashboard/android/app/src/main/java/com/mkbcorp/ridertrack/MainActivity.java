package com.mkbcorp.ridertrack;

import android.os.Bundle;
import android.webkit.WebView;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.WebViewListener;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(ForegroundTrackingPlugin.class);
        super.onCreate(savedInstanceState);

        getBridge().addWebViewListener(new WebViewListener() {
            @Override
            public void onReceivedError(WebView webView) {
                // If live Vercel domain is unreachable (e.g. offline cold boot), fall back to bundled local assets
                String localUrl = "https://localhost/index.html";
                String currentUrl = webView.getUrl();
                if (currentUrl == null || !currentUrl.startsWith("https://localhost")) {
                    webView.post(() -> webView.loadUrl(localUrl));
                }
            }
        });
    }
}
