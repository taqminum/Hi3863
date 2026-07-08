package icu.rxcccccc.ws63patrol;

import com.getcapacitor.BridgeActivity;
import android.os.Bundle;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(Ws63UdpPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
