package ru.kenty.app;

import android.content.Intent;
import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

// Camera/microphone permissions are requested by Capacitor's own WebView permission
// handling (triggered from JS via getUserMedia()) using the modern Activity Result API.
// A previous version of this class also called the legacy ActivityCompat.requestPermissions()
// proactively on launch — mixing that legacy API with Capacitor's registerForActivityResult
// flow in the same Activity causes the second (Capacitor's) permission callback to silently
// never fire, so the mic recording promise just hangs after the user taps "Allow". Removed.
public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        stopRingingIfRequested(getIntent());
    }

    @Override
    public void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        stopRingingIfRequested(intent);
    }

    // Set by IncomingCallService's "Accept" notification action — it launches this
    // Activity directly (see the comment on CallActionReceiver for why), so it can't
    // run any code of its own first to stop the ringing service. This is that code,
    // running the moment the call screen the user just accepted actually opens.
    private void stopRingingIfRequested(Intent intent) {
        if (intent != null && intent.getBooleanExtra("stopRinging", false)) {
            IncomingCallService.stop(this);
        }
    }
}
