package ru.kenty.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.media.AudioAttributes;
import android.media.MediaPlayer;
import android.media.RingtoneManager;
import android.net.Uri;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.VibrationEffect;
import android.os.Vibrator;
import androidx.annotation.Nullable;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;

// A real ringing call: ongoing heads-up notification (Accept/Decline actions) plus a
// looping ringtone and vibration, kept alive by this foreground service until the user
// answers/declines or ~30s pass with no response (missed call). Runs regardless of
// whether the app's own UI/JS is alive, since it's started straight from
// CallMessagingService.onMessageReceived.
public class IncomingCallService extends Service {

    static final int NOTIF_ID = 4242;
    private static final String CHANNEL_ID = "incoming_calls";
    private static final long TIMEOUT_MS = 30_000;

    private MediaPlayer ringPlayer;
    private Vibrator vibrator;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private final Runnable timeoutRunnable = this::stopSelf;

    @Nullable
    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent == null) {
            stopSelf();
            return START_NOT_STICKY;
        }
        String messageId = intent.getStringExtra("messageId");
        String chatId = intent.getStringExtra("chatId");
        String callerName = intent.getStringExtra("callerName");
        String chatName = intent.getStringExtra("chatName");
        String chatEmoji = intent.getStringExtra("chatEmoji");

        ensureChannel();
        Notification notification = buildNotification(messageId, chatId, callerName, chatName, chatEmoji);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            startForeground(NOTIF_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_PHONE_CALL);
        } else {
            startForeground(NOTIF_ID, notification);
        }

        startRinging();
        handler.removeCallbacks(timeoutRunnable);
        handler.postDelayed(timeoutRunnable, TIMEOUT_MS);
        return START_NOT_STICKY;
    }

    @Override
    public void onDestroy() {
        super.onDestroy();
        handler.removeCallbacks(timeoutRunnable);
        stopRinging();
        NotificationManagerCompat.from(this).cancel(NOTIF_ID);
    }

    private void ensureChannel() {
        NotificationManager nm = getSystemService(NotificationManager.class);
        if (nm.getNotificationChannel(CHANNEL_ID) != null) return;
        NotificationChannel channel = new NotificationChannel(CHANNEL_ID, "Входящие звонки", NotificationManager.IMPORTANCE_HIGH);
        channel.setDescription("Звонки в чатах — рингтон и кнопки прямо в уведомлении");
        // Sound and vibration are driven manually below (looping ring, not a one-shot
        // channel sound), so the channel itself stays silent to avoid a double trigger.
        channel.setSound(null, null);
        channel.enableVibration(false);
        channel.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
        nm.createNotificationChannel(channel);
    }

    private Notification buildNotification(String messageId, String chatId, String callerName, String chatName, String chatEmoji) {
        PendingIntent declineIntent = declinePendingIntent();
        PendingIntent acceptIntent = acceptPendingIntent(messageId, chatId, callerName, chatName, chatEmoji);

        return new NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentTitle((callerName != null ? callerName : "Кто-то") + " звонит")
            .setContentText((chatEmoji != null ? chatEmoji + " " : "") + (chatName != null ? chatName : "Кенты"))
            .setCategory(NotificationCompat.CATEGORY_CALL)
            .setPriority(NotificationCompat.PRIORITY_MAX)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setOngoing(true)
            .setAutoCancel(false)
            .addAction(0, "✕ Отклонить", declineIntent)
            .addAction(0, "📞 Принять", acceptIntent)
            .build();
    }

    private PendingIntent declinePendingIntent() {
        Intent intent = new Intent(this, CallActionReceiver.class);
        int flags = PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE;
        return PendingIntent.getBroadcast(this, 0, intent, flags);
    }

    // A direct Activity launch, not a broadcast that then tries to start one — see the
    // comment on CallActionReceiver for why that distinction is what actually makes
    // Accept work reliably (Android 10+ background-activity-start restrictions).
    // MainActivity.onCreate/onNewIntent is responsible for stopping the ringing
    // service once it sees these extras, since this PendingIntent can't run any code
    // of its own first.
    private PendingIntent acceptPendingIntent(String messageId, String chatId, String callerName, String chatName, String chatEmoji) {
        Intent intent = new Intent(this, MainActivity.class);
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        intent.putExtra("google.message_id", messageId);
        intent.putExtra("type", "call");
        intent.putExtra("chatId", chatId);
        intent.putExtra("callerName", callerName);
        intent.putExtra("chatName", chatName);
        intent.putExtra("chatEmoji", chatEmoji);
        intent.putExtra("stopRinging", true);
        int flags = PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE;
        return PendingIntent.getActivity(this, 1, intent, flags);
    }

    private void startRinging() {
        try {
            Uri ringUri = RingtoneManager.getActualDefaultRingtoneUri(this, RingtoneManager.TYPE_RINGTONE);
            if (ringUri == null) ringUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION);
            ringPlayer = new MediaPlayer();
            ringPlayer.setAudioAttributes(
                new AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                    .build()
            );
            ringPlayer.setDataSource(this, ringUri);
            ringPlayer.setLooping(true);
            ringPlayer.prepare();
            ringPlayer.start();
        } catch (Exception e) {
            ringPlayer = null;
        }

        vibrator = getSystemService(Vibrator.class);
        if (vibrator != null && vibrator.hasVibrator()) {
            long[] pattern = { 0, 800, 500 };
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                vibrator.vibrate(VibrationEffect.createWaveform(pattern, 0));
            } else {
                vibrator.vibrate(pattern, 0);
            }
        }
    }

    private void stopRinging() {
        if (ringPlayer != null) {
            try {
                ringPlayer.stop();
            } catch (Exception ignored) {}
            ringPlayer.release();
            ringPlayer = null;
        }
        if (vibrator != null) {
            vibrator.cancel();
            vibrator = null;
        }
    }

    static void stop(Context context) {
        context.stopService(new Intent(context, IncomingCallService.class));
    }
}
