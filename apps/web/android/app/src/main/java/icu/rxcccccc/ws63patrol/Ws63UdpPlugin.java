package icu.rxcccccc.ws63patrol;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.net.DatagramPacket;
import java.net.DatagramSocket;
import java.net.InetAddress;
import java.net.SocketTimeoutException;
import java.nio.charset.StandardCharsets;

@CapacitorPlugin(name = "Ws63Udp")
public class Ws63UdpPlugin extends Plugin {
    @PluginMethod
    public void send(PluginCall call) {
        String host = call.getString("host");
        String message = call.getString("message");
        Integer port = call.getInt("port");
        Integer timeoutMs = call.getInt("timeoutMs", 1000);

        if (host == null || host.isEmpty() || message == null || port == null) {
            call.reject("host, port and message are required");
            return;
        }

        getBridge().execute(() -> {
            try (DatagramSocket socket = new DatagramSocket()) {
                socket.setSoTimeout(timeoutMs);
                byte[] payload = message.getBytes(StandardCharsets.UTF_8);
                DatagramPacket packet = new DatagramPacket(payload, payload.length, InetAddress.getByName(host), port);
                socket.send(packet);

                JSObject result = new JSObject();
                if (timeoutMs <= 0) {
                    result.put("response", "");
                    call.resolve(result);
                    return;
                }

                byte[] buffer = new byte[1024];
                DatagramPacket responsePacket = new DatagramPacket(buffer, buffer.length);
                try {
                    socket.receive(responsePacket);
                    String response = new String(
                        responsePacket.getData(),
                        responsePacket.getOffset(),
                        responsePacket.getLength(),
                        StandardCharsets.UTF_8
                    ).trim();
                    result.put("response", response);
                } catch (SocketTimeoutException ignored) {
                    result.put("response", "");
                }
                call.resolve(result);
            } catch (Exception error) {
                call.reject(error.getMessage(), error);
            }
        });
    }
}
