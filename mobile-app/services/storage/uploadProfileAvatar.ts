import { Platform } from 'react-native';
import { v4 as uuidv4 } from 'uuid';
import { deleteObject, getDownloadURL, listAll, ref, uploadBytes, uploadString } from 'firebase/storage';
import { auth, storage } from '@/config/firebaseConfig';
// Use legacy FileSystem API to avoid deprecation warning in Expo SDK 54
import * as FileSystem from 'expo-file-system/legacy';

/** Upload a local image URI to Firebase Storage for a profile avatar and return the download URL. */
export async function uploadProfileAvatar(uid: string, profileId: string, localUri: string): Promise<string> {
  const ext = chooseExt(localUri);
  const path = buildAvatarPath(uid, profileId, ext);
  const contentType = guessContentType(localUri) ?? 'image/jpeg';

  // React Native + Firebase JS Storage SDK has known Blob/ArrayBuffer limitations.
  // On native, upload via Firebase Storage REST using FileSystem.uploadAsync.
  if (Platform.OS !== 'web') {
    return uploadProfileAvatarViaRest(path, localUri, contentType);
  }

  const r = ref(storage, path);

  // Try robust native file upload first (base64 via FileSystem)
  try {
    const base64 = await FileSystem.readAsStringAsync(localUri, { encoding: 'base64' as any });
    await uploadString(r, base64, 'base64', { contentType });
  } catch (e) {
    console.warn('[avatar-upload] base64 upload failed, falling back to blob:', e);
    try {
      // Fallback for web or when FileSystem read fails: fetch -> blob
      const resp = await fetch(localUri);
      const blob = await resp.blob();
      const blobContentType = blob.type || contentType || 'application/octet-stream';
      await uploadBytes(r, blob, { contentType: blobContentType });
    } catch (err) {
      console.warn('[avatar-upload] blob upload failed:', err);
      throw err;
    }
  }

  const url = await getDownloadURL(r);
  return url;
}

export async function deleteProfileAvatarByUrl(url?: string | null): Promise<void> {
  if (!url || !isRemoteUri(url)) return;
  const r = ref(storage, url);
  await deleteObject(r);
}

/** Delete profile avatar in Storage by path (tries common extensions). */
export async function deleteProfileAvatar(uid: string, profileId: string): Promise<void> {
  const exts = ['.jpg', '.png', '.webp'];
  for (const ext of exts) {
    const path = buildAvatarPath(uid, profileId, ext);
    try {
      await deleteObject(ref(storage, path));
      return;
    } catch (err: any) {
      if (isStorageObjectNotFound(err)) continue;
      throw err;
    }
  }
}

/** Delete all profile-related storage objects for a user. */
export async function deleteUserProfilesStorage(uid: string): Promise<void> {
  const root = ref(storage, `USERS/${uid}/PROFILES`);
  await deleteStorageFolder(root);
}

/** Resolve the profile avatar URL from Storage by trying known extensions. */
export async function getProfileAvatarDownloadUrl(uid: string, profileId: string): Promise<string | null> {
  const exts = ['.jpg', '.png', '.webp'];
  for (const ext of exts) {
    const path = buildAvatarPath(uid, profileId, ext);
    try {
      const url = await getDownloadURL(ref(storage, path));
      return url;
    } catch (err: any) {
      if (isStorageObjectNotFound(err)) continue;
      throw err;
    }
  }
  return null;
}

async function uploadProfileAvatarViaRest(objectPath: string, localUri: string, contentType: string): Promise<string> {
  const bucket = normalizeBucketName(process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET ?? storage.app.options.storageBucket);
  if (!bucket) {
    throw new Error('[avatar-upload] Missing Firebase storageBucket (check EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET)');
  }

  const user = auth.currentUser;
  if (!user) {
    throw new Error('[avatar-upload] Not authenticated');
  }

  const projectId = storage.app.options.projectId;
  const uid = user.uid;

  const authToken = await user.getIdToken();
  const encodedName = encodeURIComponent(objectPath);
  const uploadUrl = `https://firebasestorage.googleapis.com/v0/b/${bucket}/o?uploadType=media&name=${encodedName}`;

  const result = await FileSystem.uploadAsync(uploadUrl, localUri, {
    httpMethod: 'POST',
    uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
    headers: {
      // Firebase Storage REST expects Firebase ID token
      Authorization: `Firebase ${authToken}`,
      'Content-Type': contentType,
    },
  });

  if (result.status < 200 || result.status >= 300) {
    if (result.status === 402) {
      throw new Error(
        `[avatar-upload] Firebase Storage billing blocked (402). ` +
          `Verify the SAME Firebase project is on Blaze and billing is active. ` +
          `projectId=${projectId} bucket=${bucket} uid=${uid} url=${uploadUrl} body=${result.body}`
      );
    }
    throw new Error(`[avatar-upload] REST upload failed (status ${result.status}) url=${uploadUrl}: ${result.body}`);
  }

  // Firebase Storage returns metadata including downloadTokens; use it to construct a public download URL.
  let parsed: any;
  try {
    parsed = JSON.parse(result.body || '{}');
  } catch {
    parsed = {};
  }

  const tokens: string | undefined = parsed.downloadTokens;
  const firstToken = tokens?.split(',')?.[0]?.trim();
  if (firstToken) {
    return `https://firebasestorage.googleapis.com/v0/b/${bucket}/o/${encodedName}?alt=media&token=${encodeURIComponent(firstToken)}`;
  }

  // Ensure a download token exists so Image can fetch without auth headers.
  const downloadToken = uuidv4();
  const metadataUrl = `https://firebasestorage.googleapis.com/v0/b/${bucket}/o/${encodedName}`;
  try {
    const metaRes = await fetch(metadataUrl, {
      method: 'PATCH',
      headers: {
        Authorization: `Firebase ${authToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        metadata: { firebaseStorageDownloadTokens: downloadToken },
      }),
    });
    if (metaRes.ok) {
      return `https://firebasestorage.googleapis.com/v0/b/${bucket}/o/${encodedName}?alt=media&token=${encodeURIComponent(downloadToken)}`;
    }
  } catch {
    // ignore and fall back to non-token URL
  }

  // Fallback: media URL without token (may require auth depending on rules).
  return `https://firebasestorage.googleapis.com/v0/b/${bucket}/o/${encodedName}?alt=media`;
}

function normalizeBucketName(bucket?: string | null): string | undefined {
  if (!bucket) return undefined;
  let b = bucket.trim();
  // Handle values like "gs://<bucket>" or full URLs.
  if (b.startsWith('gs://')) b = b.slice('gs://'.length);
  b = b.replace(/^https?:\/\//, '');
  // If someone pasted a host like "firebasestorage.googleapis.com/v0/b/<bucket>..."
  const parts = b.split('/').filter(Boolean);
  if (parts.length > 0) b = parts[0];
  return b;
}

function guessContentType(uri?: string | null): string | undefined {
  if (!uri) return undefined;
  const lower = uri.toLowerCase();
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  if (lower.endsWith('.webp')) return 'image/webp';
  return undefined;
}

function chooseExt(uri?: string | null): string {
  const ct = guessContentType(uri);
  if (ct === 'image/png') return '.png';
  if (ct === 'image/webp') return '.webp';
  return '.jpg';
}

function buildAvatarPath(uid: string, profileId: string, ext: string): string {
  return `USERS/${uid}/PROFILES/${profileId}/avatar${ext}`;
}

function isStorageObjectNotFound(err: any): boolean {
  const code = err?.code || err?.message || '';
  return typeof code === 'string' && code.includes('storage/object-not-found');
}

async function deleteStorageFolder(folderRef: ReturnType<typeof ref>): Promise<void> {
  const listing = await listAll(folderRef);
  await Promise.all(listing.items.map((item) => deleteObject(item)));
  await Promise.all(listing.prefixes.map((prefix) => deleteStorageFolder(prefix)));
}

/** Helper to check if a URI is remote (http/https) vs local */
export function isRemoteUri(uri?: string | null): boolean {
  if (!uri) return false;
  return uri.startsWith('http://') || uri.startsWith('https://');
}
