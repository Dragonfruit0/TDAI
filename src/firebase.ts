import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut } from 'firebase/auth';
import { getFirestore, doc, setDoc, getDoc, collection, addDoc, query, where, getDocs, orderBy } from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';

// Initialize Firebase SDK
let customAuthDomain = (import.meta as any).env?.VITE_FIREBASE_AUTH_DOMAIN || "";
if (customAuthDomain) {
  // Strip protocol (http:// or https://)
  customAuthDomain = customAuthDomain.replace(/^https?:\/\//i, '');
  // Strip trailing slash or path elements
  customAuthDomain = customAuthDomain.split('/')[0];
  // Trim whitespaces
  customAuthDomain = customAuthDomain.trim();
}

const config = {
  ...firebaseConfig,
  ...(customAuthDomain ? { authDomain: customAuthDomain } : {})
};

export let app: any = null;
export let db: any = null;
export let auth: any = null;
export let googleProvider: any = null;

try {
  const isConfigValid = firebaseConfig && firebaseConfig.apiKey && firebaseConfig.apiKey !== '';
  if (isConfigValid) {
    app = getApps().length === 0 ? initializeApp(config) : getApp();
    db = getFirestore(app, (firebaseConfig as any).firestoreDatabaseId || '(default)');
    auth = getAuth(app);
    googleProvider = new GoogleAuthProvider();
  } else {
    console.warn("Firebase configuration is missing or empty. Please run Firebase Setup to connect to your real cloud database.");
  }
} catch (err) {
  console.error("Failed to initialize Firebase:", err);
}

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
    }[];
  }
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
      })) || []
    },
    operationType,
    path
  }
  console.error('Firestore Error (Safe Log): ', JSON.stringify(errInfo));
  throw new Error('Database operation failed. Details logged securely.');
}

export { signInWithPopup, signOut, doc, setDoc, getDoc, collection, addDoc, query, where, getDocs, orderBy };
