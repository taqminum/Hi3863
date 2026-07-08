package icu.rxcccccc.ws63patrol;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(Ws63UdpPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
