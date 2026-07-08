package icu.rxcccccc.ws63patrol;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.net.DatagramPacket;
import java.net.DatagramSocket;
import java.net.InetAddress;
import java.nio.charset.StandardCharsets;

@CapacitorPlugin(name = "UdpBridge")
public class UdpBridgePlugin extends Plugin {
    @PluginMethod
    public void request(PluginCall call) {
        String host = call.getString("host", "192.168.6.1");
        int port = call.getInt("port", 8888);
        String message = call.getString("message", "GET");
        int timeoutMs = call.getInt("timeoutMs", 1200);

        getBridge().execute(() -> {
            try (DatagramSocket socket = new DatagramSocket()) {
                socket.setSoTimeout(timeoutMs);
                byte[] out = message.getBytes(StandardCharsets.UTF_8);
                DatagramPacket packet = new DatagramPacket(out, out.length, InetAddress.getByName(host), port);
                socket.send(packet);

                byte[] buffer = new byte[2048];
                DatagramPacket response = new DatagramPacket(buffer, buffer.length);
                socket.receive(response);

                String responseText = new String(response.getData(), response.getOffset(), response.getLength(), StandardCharsets.UTF_8);
                JSObject result = new JSObject();
                result.put("message", responseText);
                call.resolve(result);
            } catch (Exception error) {
                call.reject("udp_request_failed", error);
            }
        });
    }
}
