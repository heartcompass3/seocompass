import { initializeApp, FirebaseApp } from 'firebase/app';
import { 
  getAuth, 
  signInWithPopup, 
  GoogleAuthProvider, 
  onAuthStateChanged, 
  User,
  Auth
} from 'firebase/auth';
import { 
  getFirestore, 
  doc, 
  setDoc, 
  getDocs, 
  getDocFromServer,
  collection, 
  query, 
  where, 
  serverTimestamp, 
  deleteDoc,
  Firestore
} from 'firebase/firestore';
import { GeneratedArticle } from '../types';

// Firebase configuration is read from Vite environment variables (set in
// .env.local for development and in the Vercel project settings for
// production/preview deployments). This avoids committing project
// credentials to the repository and lets each environment point at its own
// Firebase project. See .env.example for the required variable names.
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

const firestoreDatabaseId = import.meta.env.VITE_FIREBASE_FIRESTORE_DATABASE_ID || '(default)';

// IMPORTANT: Firebase initialization MUST NOT be allowed to throw at module
// load time. `App.tsx` imports from this module, and `main.tsx` renders
// `<App />` synchronously on page load -- if this module throws while it is
// being evaluated (e.g. getAuth() throwing "auth/invalid-api-key" because the
// VITE_FIREBASE_* env vars are missing or wrong), the ENTIRE app fails to
// render and the user sees a blank white page with no on-screen indication of
// what went wrong. Instead, we catch any initialization error, log it clearly,
// and export `auth`/`db` as `null`. Every function below that needs `auth` or
// `db` checks for `null` first and fails gracefully (e.g. by throwing a
// catchable error only when the user actually tries to sign in / sync), so
// the rest of the app keeps working even if Firebase is misconfigured.
let appInstance: FirebaseApp | null = null;
let dbInstance: Firestore | null = null;
let authInstance: Auth | null = null;

if (!firebaseConfig.apiKey || !firebaseConfig.projectId) {
  console.error(
    'Firebase configuration is missing. Set VITE_FIREBASE_* environment variables ' +
    '(see .env.example) in your .env.local file and in your Vercel project settings. ' +
    'Sign-in and Google Drive / Firestore sync will be unavailable until this is fixed.'
  );
} else {
  try {
    appInstance = initializeApp(firebaseConfig);
    dbInstance = getFirestore(appInstance, firestoreDatabaseId);
    authInstance = getAuth(appInstance);
  } catch (error) {
    console.error(
      'Failed to initialize Firebase. Sign-in and Google Drive / Firestore sync will be ' +
      'unavailable. Double-check the VITE_FIREBASE_* environment variables.',
      error
    );
    appInstance = null;
    dbInstance = null;
    authInstance = null;
  }
}

export const db = dbInstance;
export const auth = authInstance;

// Google Sign-In Provider and Drive scope configuration
export const provider = new GoogleAuthProvider();
provider.addScope('https://www.googleapis.com/auth/drive.file');

// --- Manual connection slot: Google Search Console (read-only) ---
// Dormant by design. To activate the connection:
//   1. In Google Cloud Console (same project as Firebase), enable
//      "Google Search Console API".
//   2. Add the scope below to your OAuth consent screen.
//   3. Uncomment the next line and set VITE_GSC_SITE_URL in .env.local.
// provider.addScope('https://www.googleapis.com/auth/webmasters.readonly');

// Flag to indicate if we are in the middle of a sign-in flow.
let isSigningIn = false;
// Cache the access token in memory.
let cachedAccessToken: string | null = null;

// Firestore error utility mapping as defined by strict skill requirements
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
    email?: string | null;
    emailVerified?: boolean | null;
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth?.currentUser?.uid,
      email: auth?.currentUser?.email,
      emailVerified: auth?.currentUser?.emailVerified,
    },
    operationType,
    path
  };
  console.error('Firestore Security Rule / Quota Error Details: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// Connection test on boot as required by the validation constraints
export async function testFirestoreConnection() {
  if (!db) {
    console.error("Skipping Firestore connection test: Firebase is not configured.");
    return;
  }
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error("Please check your Firebase configuration or network status.");
    }
  }
}

// Listen to auth state with in-memory token cache integration
export const initAuth = (
  onAuthSuccess?: (user: User, token: string) => void,
  onAuthFailure?: () => void
) => {
  if (!auth) {
    // Firebase isn't configured -- treat as "signed out" so the app still
    // renders and the UI can prompt the user to sign in (which will then
    // surface a clear error) instead of staying stuck or blank.
    if (onAuthFailure) onAuthFailure();
    return () => {};
  }

  return onAuthStateChanged(auth, async (user: User | null) => {
    if (user) {
      if (cachedAccessToken) {
        if (onAuthSuccess) onAuthSuccess(user, cachedAccessToken);
      } else if (!isSigningIn) {
        cachedAccessToken = null;
        if (onAuthFailure) onAuthFailure();
      }
    } else {
      cachedAccessToken = null;
      if (onAuthFailure) onAuthFailure();
    }
  });
};

// Sign in with premium google auth popup and retrieve Google Access Token for Drive API calls
export const googleSignIn = async (): Promise<{ user: User; accessToken: string } | null> => {
  if (!auth) {
    throw new Error(
      'Firebase is not configured for this deployment (missing VITE_FIREBASE_* environment variables), ' +
      'so Google Sign-In is unavailable.'
    );
  }
  try {
    isSigningIn = true;
    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (!credential?.accessToken) {
      throw new Error('Failed to get access token from Firebase Auth');
    }

    cachedAccessToken = credential.accessToken;
    return { user: result.user, accessToken: cachedAccessToken };
  } catch (error: any) {
    console.error('Google Sign-In failed:', error);
    throw error;
  } finally {
    isSigningIn = false;
  }
};

// Retrieve currently cached in-memory access token
export const getAccessToken = async (): Promise<string | null> => {
  return cachedAccessToken;
};

// Logout and clear token cache
export const logout = async () => {
  if (auth) {
    await auth.signOut();
  }
  cachedAccessToken = null;
};

/**
 * Saves or updates a generated article in Google Drive
 */
export async function saveArticleToDrive(
  article: GeneratedArticle,
  accessToken: string
): Promise<GeneratedArticle> {
  try {
    let fileId = article.savedDriveFileId;
    
    // Check if the file already exists on Drive. If so, update it.
    if (fileId) {
      try {
        const updateUrl = `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`;
        const payload = {
          ...article,
          savedDriveFileId: fileId,
          savedDriveFileUrl: `https://drive.google.com/file/d/${fileId}/view`
        };
        
        const updateRes = await fetch(updateUrl, {
          method: 'PATCH',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(payload)
        });
        
        if (updateRes.ok) {
          return payload;
        } else {
          console.warn("Failed to update existing file content, falling back to creating a new file.", await updateRes.text());
          fileId = undefined; // fallback to creation
        }
      } catch (err) {
        console.warn("Error updating file, falling back to creation:", err);
        fileId = undefined; // fallback to creation
      }
    }
    
    // If not exists or fallback, create new file
    if (!fileId) {
      const uuid = article.id || 'art_' + Date.now();
      const metadataUrl = 'https://www.googleapis.com/drive/v3/files';
      const metadataBody = {
        name: `seo_suite_article_${uuid}.json`,
        mimeType: 'application/json'
      };
      
      const metadataRes = await fetch(metadataUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(metadataBody)
      });
      
      if (!metadataRes.ok) {
        const errText = await metadataRes.text();
        throw new Error(`Google Drive file creation failed: ${errText}`);
      }
      
      const metadataData = await metadataRes.json();
      fileId = metadataData.id;
      
      if (!fileId) {
        throw new Error("No file ID returned from Google Drive.");
      }
      
      // Upload actual article content
      const contentUrl = `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`;
      const payload = {
        ...article,
        id: uuid,
        savedDriveFileId: fileId,
        savedDriveFileUrl: `https://drive.google.com/file/d/${fileId}/view`
      };
      
      const contentRes = await fetch(contentUrl, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });
      
      if (!contentRes.ok) {
        const errText = await contentRes.text();
        throw new Error(`Google Drive content upload failed: ${errText}`);
      }
      
      return payload;
    }
    
    throw new Error("Invalid drive save state.");
  } catch (err: any) {
    console.error("saveArticleToDrive error:", err);
    throw err;
  }
}

/**
 * Loads all articles from Google Drive
 */
export async function loadArticlesFromDrive(accessToken: string): Promise<GeneratedArticle[]> {
  try {
    const q = "name contains 'seo_suite_article_' and mimeType = 'application/json' and trashed = false";
    const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id,name,createdTime)`;
    
    const res = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${accessToken}`
      }
    });
    
    if (!res.ok) {
      const errorMsg = await res.text();
      throw new Error(`Google Drive list failed: ${errorMsg}`);
    }
    
    const data = await res.json();
    const files = data.files || [];
    
    // Fetch individual file contents in parallel
    const fetchPromises = files.map(async (file: any) => {
      try {
        const contentRes = await fetch(`https://www.googleapis.com/drive/v3/files/${file.id}?alt=media`, {
          headers: {
            'Authorization': `Bearer ${accessToken}`
          }
        });
        
        if (contentRes.ok) {
          const contentData = await contentRes.json();
          return {
            ...contentData,
            id: contentData.id || file.id,
            savedDriveFileId: file.id,
            savedDriveFileUrl: `https://drive.google.com/file/d/${file.id}/view`
          } as GeneratedArticle;
        }
      } catch (err) {
        console.error(`Error loading file content for file ID ${file.id}:`, err);
      }
      return null;
    });
    
    const fetchedArticles = await Promise.all(fetchPromises);
    return fetchedArticles.filter((a): a is GeneratedArticle => a !== null);
  } catch (err: any) {
    console.error("loadArticlesFromDrive error:", err);
    throw err;
  }
}

/**
 * Deletes an article file from Google Drive
 */
export async function deleteArticleFromDrive(fileId: string, accessToken: string): Promise<void> {
  try {
    const url = `https://www.googleapis.com/drive/v3/files/${fileId}`;
    const res = await fetch(url, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${accessToken}`
      }
    });
    
    if (!res.ok) {
      const errText = await res.text();
      if (res.status !== 404) {
        throw new Error(`Google Drive file deletion failed: ${errText}`);
      }
    }
  } catch (err: any) {
    console.error("deleteArticleFromDrive error:", err);
    throw err;
  }
}

/**
 * Saves or updates a generated article in Firestore
 */
export async function saveArticleToFirestore(
  article: GeneratedArticle,
  userId: string
): Promise<void> {
  const articlePath = `articles/${article.id}`;
  if (!db) {
    handleFirestoreError(new Error('Firebase is not configured for this deployment.'), OperationType.WRITE, articlePath);
    return;
  }
  try {
    const docRef = doc(db, 'articles', article.id);
    
    // Structure metadata based on rule assertions
    const payload: any = {
      id: article.id,
      keyword: article.keyword,
      title: article.title,
      metaTitle: article.metaTitle,
      metaDescription: article.metaDescription,
      urlSlug: article.urlSlug,
      wordCount: article.wordCount || 0,
      content: article.content,
      outline: article.outline || [],
      faqs: article.faqs || [],
      seoTips: article.seoTips || [],
      userId: userId,
      createdAt: serverTimestamp(), // Strict server-side verification in rules
    };

    await setDoc(docRef, payload);
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, articlePath);
  }
}

/**
 * Loads all articles from Firestore generated by the logged in user
 */
export async function loadArticlesFromFirestore(userId: string): Promise<GeneratedArticle[]> {
  const collectionPath = 'articles';
  if (!db) {
    handleFirestoreError(new Error('Firebase is not configured for this deployment.'), OperationType.LIST, collectionPath);
    return [];
  }
  try {
    const articlesCol = collection(db, collectionPath);
    // Security enforcer query - must match auth.uid in where clause
    const q = query(articlesCol, where('userId', '==', userId));
    const querySnapshot = await getDocs(q);
    
    const results: GeneratedArticle[] = [];
    querySnapshot.forEach((doc) => {
      const data = doc.data();
      results.push({
        id: data.id,
        keyword: data.keyword,
        title: data.title,
        metaTitle: data.metaTitle,
        metaDescription: data.metaDescription,
        urlSlug: data.urlSlug,
        wordCount: data.wordCount,
        outline: data.outline || [],
        content: data.content,
        faqs: data.faqs || [],
        seoTips: data.seoTips || [],
        // Convert firestore timestamp helper to general string or simple date
        savedDriveFileId: doc.id, // Re-use drive fields or keep general
        savedDriveFileUrl: 'firestore' // mark as firestore
      });
    });

    return results;
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, collectionPath);
    return [];
  }
}

/**
 * Deletes an article from Firestore
 */
export async function deleteArticleFromFirestore(articleId: string): Promise<void> {
  const docPath = `articles/${articleId}`;
  if (!db) {
    handleFirestoreError(new Error('Firebase is not configured for this deployment.'), OperationType.DELETE, docPath);
    return;
  }
  try {
    const docRef = doc(db, 'articles', articleId);
    await deleteDoc(docRef);
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, docPath);
  }
}

/**
 * Manual connection slot: fetches Google Search Console performance data
 * (real impressions/clicks/position for your verified site).
 *
 * Dormant until you activate the connection (see the commented scope near the
 * top of this file) and set VITE_GSC_SITE_URL (e.g. "sc-domain:heartcompass.vercel.app").
 * Reuses the same Google access token obtained during sign-in.
 */
export async function fetchSearchConsoleData(
  accessToken: string,
  opts?: { startDate?: string; endDate?: string; rowLimit?: number }
): Promise<any[]> {
  const siteUrl = import.meta.env.VITE_GSC_SITE_URL;
  if (!siteUrl) {
    throw new Error('חיבור Search Console לא הופעל: הגדר את VITE_GSC_SITE_URL ב-.env.local.');
  }

  const endDate = opts?.endDate || new Date().toISOString().slice(0, 10);
  const startDate = opts?.startDate || new Date(Date.now() - 28 * 86400000).toISOString().slice(0, 10);

  const url = `https://searchconsole.googleapis.com/webmasters/v3/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      startDate,
      endDate,
      dimensions: ['query', 'page'],
      rowLimit: opts?.rowLimit || 25,
    }),
  });

  if (!res.ok) {
    throw new Error(`Search Console request failed: ${await res.text()}`);
  }
  const data = await res.json();
  return data.rows || [];
}
