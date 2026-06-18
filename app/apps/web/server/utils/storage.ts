import {
  CreateBucketCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client
} from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

/**
 * RustFS / S3-compatible storage helper.
 *
 * RustFS is S3-API-compatible, so we use the official AWS SDK v3 with
 * `forcePathStyle: true` (RustFS, like MinIO, uses path-style addressing).
 * The server talks to the internal endpoint (http://rustfs:9000 in Coolify);
 * browsers get presigned URLs against the public endpoint so the upload bytes
 * never traverse the Nuxt server.
 *
 * Content-addressed keys: callers pass a hash-derived key like
 * `dwg/<sha256>.dwg`. We never overwrite in place — sidesteps CDN cache
 * invalidation entirely.
 */

let _client: S3Client | null = null

export function storage(): S3Client {
  if (!_client) {
    const config = useRuntimeConfig()
    _client = new S3Client({
      endpoint: config.rustfsEndpoint,
      region: 'us-east-1', // required by the SDK but ignored by RustFS
      forcePathStyle: true,
      credentials: {
        accessKeyId: config.rustfsAccessKey,
        secretAccessKey: config.rustfsSecretKey
      }
    })
  }
  return _client
}

function bucket(): string {
  return useRuntimeConfig().rustfsBucket
}

/** Ensure the bucket exists; idempotent. Called once at boot. */
export async function ensureBucket(): Promise<void> {
  const s3 = storage()
  try {
    await s3.send(new HeadBucketCommand({ Bucket: bucket() }))
  } catch {
    await s3.send(new CreateBucketCommand({ Bucket: bucket() }))
  }
}

/** The public RustFS origin the browser should upload to. */
export function publicEndpoint(): string {
  return useRuntimeConfig().public.rustfsPublicEndpoint
}

/**
 * Mint a short-lived presigned PUT URL for the given object key.
 * `expiresIn` defaults to 5 minutes. Cache-Control is set per-object at upload
 * time by the browser (we forward it) — mitigates RustFS public-bucket
 * Cache-Control issue #1411.
 */
export async function presignPut(
  key: string,
  opts: { contentType?: string; expiresIn?: number } = {}
): Promise<string> {
  const cmd = new PutObjectCommand({
    Bucket: bucket(),
    Key: key,
    ContentType: opts.contentType
  })
  return getSignedUrl(storage(), cmd, {
    expiresIn: opts.expiresIn ?? 300
  })
}

/**
 * Build the full public URL for an object key, using the browser-facing
 * RustFS origin. Use for GET (downloads) after conversion.
 */
export function publicObjectUrl(key: string): string {
  const origin = publicEndpoint().replace(/\/$/, '')
  return `${origin}/${bucket()}/${key}`
}

/**
 * Mint a short-lived presigned GET URL (for private objects, e.g. the
 * dwg-converter fetching inputs server-side is internal so this is mainly
 * for browser downloads of generated PDF/DXF/DWG).
 */
export async function presignGet(
  key: string,
  expiresIn = 3600
): Promise<string> {
  const { GetObjectCommand } = await import('@aws-sdk/client-s3')
  const cmd = new GetObjectCommand({ Bucket: bucket(), Key: key })
  return getSignedUrl(storage(), cmd, { expiresIn })
}
