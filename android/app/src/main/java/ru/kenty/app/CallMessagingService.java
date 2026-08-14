package ru.kenty.app;

import android.app.ActivityManager;
import android.content.Context;
import android.content.Intent;
import androidx.annotation.NonNull;
import androidx.core.content.ContextCompat;
import com.capacitorjs.plugins.pushnotifications.PushNotificationsPlugin;
import com.google.firebase.messaging.FirebaseMessagingService;
import com.google.firebase.messaging.RemoteMessage;
import java.util.List;
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
            if (isAppInForeground()) {
                // The app's own JS is already watching for this over Realtime and will
                // show its own in-app banner + ringtone — starting the native ringing
                // notification too would double both the visual banner and the sound.
                PushNotificationsPlugin.sendRemoteMessage(remoteMessage);
                return;
            }
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

    private boolean isAppInForeground() {
        ActivityManager am = (ActivityManager) getSystemService(Context.ACTIVITY_SERVICE);
        if (am == null) return false;
        List<ActivityManager.RunningAppProcessInfo> processes = am.getRunningAppProcesses();
        if (processes == null) return false;
        String packageName = getPackageName();
        for (ActivityManager.RunningAppProcessInfo process : processes) {
            if (process.processName.equals(packageName)
                && process.importance == ActivityManager.RunningAppProcessInfo.IMPORTANCE_FOREGROUND) {
                return true;
            }
        }
        return false;
    }

    @Override
    public void onNewToken(@NonNull String s) {
        super.onNewToken(s);
        PushNotificationsPlugin.onNewToken(s);
    }
}
