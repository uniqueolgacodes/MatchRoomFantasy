// Required by OneSignal's Web SDK — must be served at the site root.
// Nothing custom goes in here; this is the standard one-line loader
// OneSignal's own docs specify. Without this file existing, push
// subscriptions can never actually register, regardless of anything
// else being correctly wired up client-side.
importScripts('https://cdn.onesignal.com/sdks/web/v16/OneSignalSDKWorker.js');
