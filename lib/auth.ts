import { signInWithPopup, signOut, User } from "firebase/auth";
import { auth, googleProvider } from "./firebase";

export async function signInWithGoogle(): Promise<User> {
  const result = await signInWithPopup(auth, googleProvider);
  return result.user;
}

export async function signOutUser(): Promise<void> {
  await signOut(auth);
}
