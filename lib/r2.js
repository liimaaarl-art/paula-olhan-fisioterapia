import { S3Client, HeadBucketCommand } from '@aws-sdk/client-s3';

// Read only on the server. Legacy aliases preserve the secrets already entered
// in Vercel; Sensitive variable keys cannot be renamed without re-entering them.
export function r2Config(env = process.env) {
  const endpoint = String(env.R2_ENDPOINT || '').trim();
  const bucket = String(env.R2_BUCKET_NAME || '').trim();
  const accessKeyId = String(env.R2_ACCESS_KEY_ID || env.R2_ACESS_KEY_ID || '').trim();
  const secretAccessKey = String(env.R2_SECRET_ACCESS_KEY || env.R2_SECRET_ACESS_KEY || '').trim();
  if (![endpoint, bucket, accessKeyId, secretAccessKey].every(Boolean)) return null;
  try {
    const u = new URL(endpoint);
    if (u.protocol !== 'https:' || u.port || u.username || u.password ||
        u.search || u.hash || !['', '/'].includes(u.pathname) ||
        !/^[a-f0-9]{32}(?:\.(?:eu|us|fedramp))?\.r2\.cloudflarestorage\.com$/.test(u.hostname) ||
        !/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(bucket)) return null;
    return { endpoint: u.origin, bucket, credentials: { accessKeyId, secretAccessKey } };
  } catch { return null; }
}

export function r2Client(config) {
  return new S3Client({
    region: 'auto', endpoint: config.endpoint, credentials: config.credentials,
    maxAttempts: 1,
  });
}

// This is a connection probe only. Never list/read/upload a patient object.
// No signed-URL API exists until individual authorization is implemented.
export async function probeR2(config, client = r2Client(config)) {
  try {
    await client.send(new HeadBucketCommand({ Bucket: config.bucket }), {
      abortSignal: AbortSignal.timeout(8000),
    });
    return true;
  } finally { client.destroy?.(); }
}
