import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyCjE2Mrt92wpJR8q2g0sl54gNcWNJe4us0",
  authDomain: "phdgesfin.firebaseapp.com",
  projectId: "phdgesfin",
  storageBucket: "phdgesfin.firebasestorage.app",
  messagingSenderId: "506094815396",
  appId: "1:506094815396:web:ace0b80e7ff54f92f53e31"
};

export const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
