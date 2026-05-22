// public/firebase-messaging-sw.js
// Service Worker Firebase Cloud Messaging
// Reçoit les push notifications quand l'app est fermée ou en arrière-plan

importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js');

// Initialisation synchrone — pas de fetch async, évite les problèmes de timing iOS
if (!firebase.apps.length) {
  firebase.initializeApp({
    apiKey: "AIzaSyD8hZrqoL4kYelLQ8OpJbp-xgJ0TefsfEk",
    authDomain: "test-app-ted-4krhhv.firebaseapp.com",
    projectId: "test-app-ted-4krhhv",
    storageBucket: "test-app-ted-4krhhv.firebasestorage.app",
    messagingSenderId: "906424403366",
    appId: "1:906424403366:web:992c4fa52e3a51910d7b67",
  });
}

const messaging = firebase.messaging();

// Message reçu quand l'app est fermée ou en arrière-plan
messaging.onBackgroundMessage((payload) => {
  const title = payload.notification?.title || 'Notification CCM';
  const body = payload.notification?.body || '';
  const link = payload.data?.link || '/notifications';

  return self.registration.showNotification(title, {
    body,
    icon: '/logo-ccm.jpg',
    badge: '/logo-ccm.jpg',
    tag: payload.data?.notifId || 'ccm-notif',
    renotify: true,
    data: { link },
    vibrate: [200, 100, 200],
    actions: [
      { action: 'open', title: 'Ouvrir' },
      { action: 'dismiss', title: 'Ignorer' },
    ],
  });
});

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(clients.claim());
});

// Clic sur la notification → ouvrir ou focus l'onglet de l'app
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  if (event.action === 'dismiss') return;

  const link = event.notification.data?.link || '/notifications';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) {
          client.focus();
          if ('navigate' in client) client.navigate(link);
          return;
        }
      }
      if (clients.openWindow) return clients.openWindow(link);
    })
  );
});
