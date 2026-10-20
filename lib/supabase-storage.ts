const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

function requireSupabaseStorageConfig() {
  if (!supabaseUrl || !supabaseServiceRoleKey) {
    throw new Error("Supabase Storage is not configured. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
  }

  return {
    serviceRoleKey: supabaseServiceRoleKey,
    url: supabaseUrl.replace(/\/$/, ""),
  };
}

export async function uploadToSupabaseStorage(params: {
  bucket: string;
  path: string;
  body: BodyInit;
  contentType: string;
  upsert?: boolean;
}) {
  const config = requireSupabaseStorageConfig();
  const storageUrl = `${config.url}/storage/v1/object/${params.bucket}/${params.path}`;

  const response = await fetch(storageUrl, {
    method: "POST",
    headers: {
      apikey: config.serviceRoleKey,
      Authorization: `Bearer ${config.serviceRoleKey}`,
      "Content-Type": params.contentType,
      "x-upsert": params.upsert ? "true" : "false",
    },
    body: params.body,
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(`Supabase Storage upload failed: ${message}`);
  }

  return {
    publicUrl: getSupabasePublicUrl(params.bucket, params.path),
    storagePath: `${params.bucket}/${params.path}`,
  };
}

/** Deletes a known server-generated object after its database replacement commits. */
export async function deleteFromSupabaseStorage(params: { bucket: string; path: string; allowNotFound?: boolean }) {
  const config = requireSupabaseStorageConfig();
  const response = await fetch(`${config.url}/storage/v1/object/${encodeURIComponent(params.bucket)}`, {
    method: "DELETE",
    headers: {
      apikey: config.serviceRoleKey,
      Authorization: `Bearer ${config.serviceRoleKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ prefixes: [params.path] }),
    signal: AbortSignal.timeout(30000),
    redirect: "error",
  });
  if (!response.ok && !(params.allowNotFound && response.status === 404)) {
    throw new Error(`Supabase Storage delete failed (${response.status}).`);
  }
}

export function getSupabasePublicUrl(bucket: string, path: string) {
  const config = requireSupabaseStorageConfig();
  return `${config.url}/storage/v1/object/public/${bucket}/${path}`;
}
