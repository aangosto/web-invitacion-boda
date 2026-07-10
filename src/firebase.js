/* =================================================================
   Inicialización de Firebase.
   La configuración se lee de variables de entorno (import.meta.env).
   Crea un archivo .env (ver .env.example) con los valores reales; NO se
   sube al repo. Si faltan, la web sigue funcionando en "modo local de
   respaldo" (localStorage) para poder desarrollar sin credenciales.

   Importante: las claves VITE_FIREBASE_* son identificadores públicos del
   proyecto, no secretos. La seguridad de los datos la imponen las reglas
   de Firestore (firestore.rules).
   ================================================================= */

import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';

const config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

// Consideramos Firebase "configurado" si están las claves esenciales.
export const isConfigured = Boolean(config.apiKey && config.projectId && config.appId);

let app = null;
let db = null;
if (isConfigured) {
  app = initializeApp(config);
  db = getFirestore(app);
} else {
  console.warn(
    '[Firebase] Sin configurar (.env). RSVP y ranking usan modo local de respaldo.'
  );
}

// `app` lo necesita la página privada /resultados para Firebase Auth
export { app, db };
