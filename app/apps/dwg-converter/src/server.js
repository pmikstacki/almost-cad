/**
 * @modulecad/dwg-converter
 *
 * Standalone HTTP microservice wrapping the LibreDWG CLI tools (dwg2dxf,
 * dxf2dwg). Runs as a separate process/container so the GPL-3 LibreDWG code
 * stays isolated from the MIT/GPL-3 app bundle — the "mere aggregation"
 * doctrine. The web app talks to this over the internal Docker network.
 *
 * License: GPL-3.0-or-later (must be, since it shells out to LibreDWG).
 *
 * Endpoints:
 *   GET  /health                  -> { status: 'ok', tools: { dwg2dxf, dxf2dwg } }
 *   POST /convert                 -> { ok, outputKey, stderr? }
 *        body: {
 *          inputKey, outputKey, direction: 'dwg2dxf'|'dxf2dwg',
 *          bucket, callbackUrl?
 *        }
 *
 * Flow:
 *   1. Pull the input object from RustFS (S3) to a temp file.
 *   2. Run the LibreDWG CLI (dwg2dxf or dxf2dwg) on it.
 *   3. Upload the output object to RustFS.
 *   4. Optionally POST a callback to the web app's /api/jobs/:id/update.
 *
 * The service itself is framework-free (plain node:http) so its dependency
 * surface is tiny and its GPL boundary obvious: only @aws-sdk/client-s3 plus
 * the LibreDWG binary on the container's PATH.
 */
import http from 'node:http'
import { execFile } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client
} from '@aws-sdk/client-s3'

const PORT = Number(process.env.PORT ?? 8080)
const SHARED_SECRET = process.env.DWG_CONVERTER_SECRET ?? 'dev-converter-secret'

// RustFS / S3 config (same env vars the web app uses, but this service has
// its own copy because it's a separate deploy unit).
const s3 = new S3Client({
  endpoint: process.env.RUSTFS_ENDPOINT ?? 'http://localhost:9000',
  region: 'us-east-1',
  forcePathStyle: true,
  credentials: {
    accessKeyId: process.env.RUSTFS_ACCESS_KEY ?? 'modulecad',
    secretAccessKey: process.env.RUSTFS_SECRET_KEY ?? 'modulecad-dev-key'
  }
})

/** Locate the LibreDWG CLI binary; fall back to PATH lookup. */
function which(tool) {
  return new Promise((resolve) => {
    execFile('which', [tool], (err, stdout) => {
      if (err) return resolve(null)
      resolve(stdout.trim() || null)
    })
  })
}

async function checkTools() {
  return {
    dwg2dxf: await which('dwg2dxf'),
    dxf2dwg: await which('dxf2dwg')
  }
}

/** Run a LibreDWG CLI command on infile, producing outfile. */
function runConverter(tool, infile, outfile) {
  return new Promise((resolve, reject) => {
    execFile(tool, ['-o', outfile, infile], { maxBuffer: 10 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) return reject(Object.assign(err, { stderr }))
      resolve({ stdout, stderr })
    })
  })
}

async function getObject(bucket, key, destPath) {
  const res = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }))
  const chunks = []
  for await (const c of res.Body) chunks.push(c)
  await writeFile(destPath, Buffer.concat(chunks))
}

async function putObject(bucket, key, srcPath) {
  const body = await readFile(srcPath)
  await s3.send(
    new PutObjectCommand({ Bucket: bucket, Key: key, Body: body })
  )
}

async function headObject(bucket, key) {
  try {
    await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key }))
    return true
  } catch {
    return false
  }
}

/** Notify the web app of progress / completion. */
async function callback(url, payload) {
  if (!url) return
  try {
    await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-dwg-converter-secret': SHARED_SECRET
      },
      body: JSON.stringify(payload)
    })
  } catch {
    /* web app may be temporarily unreachable; not fatal for the convert step */
  }
}

/** Handle POST /convert. */
async function handleConvert(req, body) {
  const { inputKey, outputKey, direction, bucket, callbackUrl } = body
  if (!inputKey || !outputKey || !direction || !bucket) {
    return { status: 400, json: { error: 'inputKey, outputKey, direction, bucket required' } }
  }
  if (direction !== 'dwg2dxf' && direction !== 'dxf2dwg') {
    return { status: 400, json: { error: "direction must be 'dwg2dxf' or 'dxf2dwg'" } }
  }

  const tool = direction === 'dwg2dxf' ? 'dwg2dxf' : 'dxf2dwg'
  const toolPath = await which(tool)
  if (!toolPath) {
    await callback(callbackUrl, {
      status: 'error',
      message: `${tool} binary not found on PATH — install LibreDWG in the container`
    })
    return {
      status: 500,
      json: { error: `${tool} not installed` }
    }
  }

  // Idempotency: if the output already exists, skip conversion entirely.
  if (await headObject(bucket, outputKey)) {
    await callback(callbackUrl, {
      status: 'ready',
      dxfKey: outputKey,
      message: 'Output already present (cached)'
    })
    return { status: 200, json: { ok: true, outputKey, cached: true } }
  }

  const dir = await mkdtemp(join(tmpdir(), 'dwg-conv-'))
  const inExt = direction === 'dwg2dxf' ? '.dwg' : '.dxf'
  const outExt = direction === 'dwg2dxf' ? '.dxf' : '.dwg'
  const infile = join(dir, 'input' + inExt)
  const outfile = join(dir, 'output' + outExt)

  try {
    await getObject(bucket, inputKey, infile)
    await callback(callbackUrl, {
      status: 'converting',
      message: `${tool} running`,
      progress: 0.5
    })
    const result = await runConverter(tool, infile, outfile)
    await putObject(bucket, outputKey, outfile)
    await callback(callbackUrl, {
      status: 'ready',
      dxfKey: outputKey,
      message: 'Conversion complete'
    })
    return {
      status: 200,
      json: {
        ok: true,
        outputKey,
        stderr: result.stderr ? result.stderr.slice(0, 4096) : undefined
      }
    }
  } catch (err) {
    const message = err?.message ?? String(err)
    await callback(callbackUrl, {
      status: 'error',
      message: `Conversion failed: ${message}`
    })
    return { status: 500, json: { error: message, stderr: err?.stderr } }
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`)

  if (req.method === 'GET' && url.pathname === '/health') {
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ status: 'ok', tools: await checkTools() }))
    return
  }

  if (req.method === 'POST' && url.pathname === '/convert') {
    const chunks = []
    for await (const c of req) chunks.push(c)
    let body
    try {
      body = JSON.parse(Buffer.concat(chunks).toString())
    } catch {
      res.writeHead(400, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ error: 'invalid JSON' }))
      return
    }
    const result = await handleConvert(req, body)
    res.writeHead(result.status, { 'content-type': 'application/json' })
    res.end(JSON.stringify(result.json))
    return
  }

  res.writeHead(404, { 'content-type': 'application/json' })
  res.end(JSON.stringify({ error: 'not found' }))
})

server.listen(PORT, () => {
  console.log(`[dwg-converter] listening on :${PORT} (GPL-3.0-or-later, LibreDWG wrapper)`)
})
