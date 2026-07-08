package icu.rxcccccc.ws63patrol;

import android.os.Bundle;
import android.os.Build;
import android.view.WindowManager;
import android.webkit.WebSettings;
import android.webkit.WebView;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        getWindow().setFlags(WindowManager.LayoutParams.FLAG_FULLSCREEN, WindowManager.LayoutParams.FLAG_FULLSCREEN);
        registerPlugin(Ws63UdpPlugin.class);
        registerPlugin(Ws63SystemPlugin.class);
        super.onCreate(savedInstanceState);
        allowLocalDeviceHttp();
    }

    private void allowLocalDeviceHttp() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.LOLLIPOP || getBridge() == null) {
            return;
        }

        WebView webView = getBridge().getWebView();
        if (webView == null) {
            return;
        }

        WebSettings settings = webView.getSettings();
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
    }
}
