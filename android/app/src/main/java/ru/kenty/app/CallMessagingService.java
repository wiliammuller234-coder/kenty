package ru.kenty.app;

import android.content.Intent;
import androidx.annotation.NonNull;
import androidx.core.content.ContextCompat;
import com.capacitorjs.plugins.pushnotifications.PushNotificationsPlugin;
import com.google.firebase.messaging.FirebaseMessagingService;
import com.google.firebase.messaging.RemoteMessage;
import java.util.Map;

// Replaces the push-notifications plugin's own MessagingService (removed in
// AndroidManifest.xml via tools:node="remove") so that data.type == "call" messages
// can get a real ringing UI instead of the plugin's default handling, while every
// other message keeps working exactly as before by forwarding to the plugin.
public class CallMessagingService extends FirebaseMessagingService {

    @Override
    public void onMessageReceived(@NonNull RemoteMessage remoteMessage) {
        super.onMessageReceived(remoteMessage);
        Map<String, String> data = remoteMessage.getData();
        if ("call".equals(data.get("type"))) {
            Intent intent = new Intent(this, IncomingCallService.class);
            intent.putExtra("messageId", remoteMessage.getMessageId());
            intent.putExtra("chatId", data.get("chatId"));
            intent.putExtra("callerName", data.get("callerName"));
            intent.putExtra("chatName", data.get("chatName"));
            intent.putExtra("chatEmoji", data.get("chatEmoji"));
            ContextCompat.startForegroundService(this, intent);
        } else {
            PushNotificationsPlugin.sendRemoteMessage(remoteMessage);
        }
    }

    @Override
    public void onNewToken(@NonNull String s) {
        super.onNewToken(s);
        PushNotificationsPlugin.onNewToken(s);
    }
}
