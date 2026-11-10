// Firebase web app config (project "sidebooster-2a402").
// These values are PUBLIC by design — they are sent to every visitor's browser.
// Protect the project by restricting the API key to sidebooster.com in Google Cloud Console
// (APIs & Services → Credentials → Browser key → Website restrictions).
export const firebaseConfig = {
  apiKey: "AIzaSyBfKBP0vTbzDjoLhZKJPlVgXFmM3CWvsoQ",
  authDomain: "sidebooster-2a402.firebaseapp.com",
  projectId: "sidebooster-2a402",
  storageBucket: "sidebooster-2a402.firebasestorage.app",
  messagingSenderId: "395618946963",
  appId: "1:395618946963:web:f6820208d0fe1e59bfe266",
  measurementId: "G-Y3C68LLP5S",
} as const;

// Cloud Messaging → Web Push certificates → key pair (public VAPID key; safe to publish)
export const firebaseVapidKey = "BDKiOsZ0IItXwV5iAbmZXn4LjXcF2JSTapTF7qM591SWjOzc5Yj8PlOx0DlGq7y_JNaX1ez6tAMz97us4foReEY";
