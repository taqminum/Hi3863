package icu.rxcccccc.ws63patrol;

import android.Manifest;
import android.content.Context;
import android.content.Intent;
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.NetworkCapabilities;
import android.net.NetworkRequest;
import android.net.wifi.WifiNetworkSpecifier;
import android.os.Build;
import android.os.PatternMatcher;
import android.provider.Settings;

import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

@CapacitorPlugin(
    name = "Ws63System",
    permissions = {
        @Permission(strings = { Manifest.permission.ACCESS_FINE_LOCATION }, alias = "location")
    }
)
public class Ws63SystemPlugin extends Plugin {
    private ConnectivityManager.NetworkCallback localWifiCallback;

    @PluginMethod
    public void openWifiSettings(PluginCall call) {
        Intent intent = new Intent(Settings.ACTION_WIFI_SETTINGS);
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        getContext().startActivity(intent);
        JSObject result = new JSObject();
        result.put("opened", true);
        call.resolve(result);
    }

    @PluginMethod
    public void connectLocalWifi(PluginCall call) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q && getPermissionState("location") != PermissionState.GRANTED) {
            requestPermissionForAlias("location", call, "wifiPermissionCallback");
            return;
        }
        requestLocalWifi(call);
    }

    @PermissionCallback
    private void wifiPermissionCallback(PluginCall call) {
        if (getPermissionState("location") == PermissionState.GRANTED) {
            requestLocalWifi(call);
        } else {
            openWifiSettingsFallback(call);
        }
    }

    private void requestLocalWifi(PluginCall call) {
        String ssidPrefix = call.getString("ssidPrefix", "");
        String passphrase = call.getString("passphrase");
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q || ssidPrefix == null || ssidPrefix.trim().isEmpty()) {
            openWifiSettingsFallback(call);
            return;
        }

        ConnectivityManager connectivityManager =
            (ConnectivityManager) getContext().getSystemService(Context.CONNECTIVITY_SERVICE);
        if (connectivityManager == null) {
            openWifiSettingsFallback(call);
            return;
        }

        try {
            if (localWifiCallback != null) {
                connectivityManager.unregisterNetworkCallback(localWifiCallback);
                localWifiCallback = null;
            }
        } catch (Exception ignored) {
            localWifiCallback = null;
        }

        try {
            WifiNetworkSpecifier.Builder specifierBuilder = new WifiNetworkSpecifier.Builder()
                .setSsidPattern(new PatternMatcher(ssidPrefix, PatternMatcher.PATTERN_PREFIX));
            if (passphrase != null && passphrase.length() >= 8) {
                specifierBuilder.setWpa2Passphrase(passphrase);
            }

            NetworkRequest request = new NetworkRequest.Builder()
                .addTransportType(NetworkCapabilities.TRANSPORT_WIFI)
                .setNetworkSpecifier(specifierBuilder.build())
                .build();

            localWifiCallback = new ConnectivityManager.NetworkCallback() {
                @Override
                public void onAvailable(Network network) {
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                        connectivityManager.bindProcessToNetwork(network);
                    }
                }
            };
            connectivityManager.requestNetwork(request, localWifiCallback);
            JSObject result = new JSObject();
            result.put("requested", true);
            result.put("openedSettings", false);
            call.resolve(result);
        } catch (Exception error) {
            openWifiSettingsFallback(call);
        }
    }

    private void openWifiSettingsFallback(PluginCall call) {
        Intent intent = new Intent(Settings.ACTION_WIFI_SETTINGS);
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        getContext().startActivity(intent);
        JSObject result = new JSObject();
        result.put("requested", false);
        result.put("openedSettings", true);
        call.resolve(result);
    }
}
