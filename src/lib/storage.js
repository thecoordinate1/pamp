import { supabase } from './supabaseClient';

const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED = ['image/jpeg', 'image/png', 'image/webp'];

function check(file) {
  if (!ALLOWED.includes(file.type)) {
    throw new Error('Use a JPEG, PNG or WebP image.');
  }
  if (file.size > MAX_BYTES) {
    throw new Error('That image is over 5MB. Try a smaller one.');
  }
}

const extensionFor = (file) => ({
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
}[file.type] ?? 'jpg');

// Selfies live at <user-id>/<file>, which is what the storage policies key on:
// private to the uploader, plus public read once a host features them.
export async function uploadSelfie(file, userId) {
  check(file);
  const path = `${userId}/${crypto.randomUUID()}.${extensionFor(file)}`;
  const { error } = await supabase.storage
    .from('selfies')
    .upload(path, file, { cacheControl: '3600', upsert: false });
  if (error) throw error;
  return path;
}

// The selfies bucket is private, so display needs a signed URL rather than a
// public one. Returns null when the viewer is not allowed to see it.
export async function signedSelfieUrl(path, expiresInSeconds = 3600) {
  if (!path) return null;
  const { data, error } = await supabase.storage
    .from('selfies')
    .createSignedUrl(path, expiresInSeconds);
  if (error) return null;
  return data?.signedUrl ?? null;
}

// Event artwork is world-readable, so a plain public URL is correct here.
export async function uploadEventImage(file, userId) {
  check(file);
  const path = `${userId}/${crypto.randomUUID()}.${extensionFor(file)}`;
  const { error } = await supabase.storage
    .from('event-images')
    .upload(path, file, { cacheControl: '3600', upsert: false });
  if (error) throw error;
  return supabase.storage.from('event-images').getPublicUrl(path).data.publicUrl;
}
