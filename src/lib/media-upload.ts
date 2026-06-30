import { supabase } from "@/integrations/supabase/client";

/**
 * Upload a media File/Blob to the `media` bucket under {userId}/{folder}/{uuid.ext}.
 * Returns the storage path (relative inside the bucket) and a 24h signed URL.
 */
export async function uploadMedia(
  userId: string,
  folder: "posts" | "comments" | "avatars" | "banners" | "voice",
  file: File | Blob,
  ext?: string,
): Promise<{ path: string; signedUrl: string }> {
  const extension =
    ext ??
    (file instanceof File && file.name.includes(".")
      ? file.name.split(".").pop()
      : (file.type.split("/")[1] || "bin").split(";")[0]);
  const name = `${userId}/${folder}/${crypto.randomUUID()}.${extension}`;
  const { error } = await supabase.storage.from("media").upload(name, file, {
    contentType: file.type || undefined,
    upsert: false,
  });
  if (error) throw error;
  return { path: name, signedUrl: await signed(name) };
}

export async function signed(path: string, expiresIn = 60 * 60 * 24): Promise<string> {
  const { data, error } = await supabase.storage.from("media").createSignedUrl(path, expiresIn);
  if (error || !data) throw error ?? new Error("could not sign url");
  return data.signedUrl;
}
