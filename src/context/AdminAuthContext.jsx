import {
  browserSessionPersistence,
  onAuthStateChanged,
  setPersistence,
  signInWithEmailAndPassword,
  signOut,
} from "firebase/auth";
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { auth } from "../lib/firebase";

const AdminAuthContext = createContext(null);

function isFirebaseAdminUser(user) {
  return Boolean(user && !user.isAnonymous);
}

export function AdminAuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (nextUser) => {
      setUser(nextUser);
      setIsAdmin(isFirebaseAdminUser(nextUser));
      setLoading(false);
    });

    return unsubscribe;
  }, []);

  async function login(email, password) {
    if (auth.currentUser?.isAnonymous) {
      await signOut(auth);
    }

    await setPersistence(auth, browserSessionPersistence);

    const credential = await signInWithEmailAndPassword(
      auth,
      email.trim(),
      password,
    );

    if (credential.user.isAnonymous) {
      await signOut(auth);
      throw new Error("Anonymous accounts cannot access the admin panel.");
    }

    setUser(credential.user);
    setIsAdmin(true);
    return credential.user;
  }

  async function logout() {
    await signOut(auth);
  }

  const value = useMemo(
    () => ({ user, isAdmin, loading, login, logout }),
    [user, isAdmin, loading],
  );

  return (
    <AdminAuthContext.Provider value={value}>
      {children}
    </AdminAuthContext.Provider>
  );
}

export function useAdminAuth() {
  const context = useContext(AdminAuthContext);
  if (!context) {
    throw new Error("useAdminAuth must be used inside AdminAuthProvider.");
  }
  return context;
}
