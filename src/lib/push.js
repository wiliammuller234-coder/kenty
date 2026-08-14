import { Capacitor } from '@capacitor/core';
import { savePushToken } from './db';

// handlers.onCall(chatId) / handlers.onMessage(chatId) fire when the user taps a
// "someone's calling" / "new message" notification — including from a fully closed
// app, which is the whole point: presence/realtime alone only reach people who
// already have the app open. Message pushes used to carry no `type` at all, so a tap
// just launched the app to whatever screen it last had open instead of the chat that
// actually had something new.
export async function setupPush(user, handlers = {}) {
  if (!Capacitor.isNativePlatform()) return; // web/PWA has no FCM wiring, only the APK does

  const { PushNotifications } = await import('@capacitor/push-notifications');

  const perm = await PushNotifications.requestPermissions();
  if (perm.receive !== 'granted') return;

  await PushNotifications.addListener('registration', (token) => {
    savePushToken(user.phone, token.value);
  });
  await PushNotifications.addListener('registrationError', (err) => {
    console.error('Push registration failed', err);
  });
  await PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
    const data = action.notification?.data;
    if (!data?.chatId) return;
    if (data.type === 'call') handlers.onCall?.(data.chatId);
    else if (data.type === 'message') handlers.onMessage?.(data.chatId);
  });

  await PushNotifications.register();
}
