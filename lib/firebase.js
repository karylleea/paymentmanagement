import { getApp, getApps, initializeApp } from "firebase/app"
import { getAuth, GoogleAuthProvider } from "firebase/auth"
import { getFirestore } from "firebase/firestore"

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "AIzaSyCqpUQ_8O7dyVRrruJl0D6kTJ80KvzDiX4",
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || "hotel-63c74.firebaseapp.com",
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "hotel-63c74",
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || "hotel-63c74.firebasestorage.app",
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "1064106553832",
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || "1:1064106553832:web:32433bf4d1bdc76988b45d",
}

const app = getApps().length ? getApp() : initializeApp(firebaseConfig)
const auth = getAuth(app)
const googleProvider = new GoogleAuthProvider()
const db = getFirestore(app)

export { app, auth, db, googleProvider }