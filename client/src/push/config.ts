/**
 * Firebase web config and the Web Push key, from the build's environment (VITE_FIREBASE_*).
 * Public by design (they identify the project, they do not grant access). Without them the
 * build has no notifications and no bell; everything else works.
 */
export interface FirebaseWebConfig {
  apiKey: string;
  projectId: string;
  messagingSenderId: string;
  appId: string;
  vapidKey: string;
}

function read(): FirebaseWebConfig | null {
  const env = import.meta.env;
  const config = {
    apiKey: env.VITE_FIREBASE_API_KEY,
    projectId: env.VITE_FIREBASE_PROJECT_ID,
    messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: env.VITE_FIREBASE_APP_ID,
    vapidKey: env.VITE_FIREBASE_VAPID_KEY,
  };
  return Object.values(config).every((value) => typeof value === 'string' && value.trim())
    ? (config as FirebaseWebConfig)
    : null;
}

export const firebaseConfig = read();
