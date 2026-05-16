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

export function getSupabasePublicUrl(bucket: string, path: string) {
  const config = requireSupabaseStorageConfig();
  return `${config.url}/storage/v1/object/public/${bucket}/${path}`;
}
