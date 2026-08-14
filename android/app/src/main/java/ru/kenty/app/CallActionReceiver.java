package ru.kenty.app;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import androidx.core.app.NotificationManagerCompat;

// Handles the Decline tap from the incoming-call notification — just stop the ringing
// and cancel the notification, nothing else.
//
// Accept does NOT go through here anymore. It used to: this receiver would run,
// then call context.startActivity() to open MainActivity. On Android 10+ that's
// exactly the "start an Activity from a background BroadcastReceiver" pattern the
// platform's background-activity-launch restrictions are built to block — it doesn't
// throw, it just silently no-ops on stricter OEMs/OS versions, which looked like the
// notification itself vanishing without ever opening the call. Accept's PendingIntent
// is now a direct getActivity() launch (see IncomingCallService) — a notification
// action tap opening an Activity directly is the one path Android always allows, no
// broadcast middleman involved.
public class CallActionReceiver extends BroadcastReceiver {

    @Override
    public void onReceive(Context context, Intent intent) {
        IncomingCallService.stop(context);
        NotificationManagerCompat.from(context).cancel(IncomingCallService.NOTIF_ID);
    }
}
