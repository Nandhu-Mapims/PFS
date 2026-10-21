import path from "path";
import fs from "fs/promises";
import { spawn } from "child_process";

/**
 * iOS Safari can't play the WebM/Opus files Chrome's MediaRecorder produces, so
 * `/uploads/<file>.webm?format=m4a` serves an AAC copy instead. Copies live under
 * uploads/playback-cache/ and are made with ffmpeg as soon as a recording is saved
 * (plus a startup backfill), so playback never waits on a conversion. The request
 * path still converts on demand if a copy is missing.
 */
const CACHE_DIR_NAME = "playback-cache";
const inFlight = new Map();

const isWebm = (rel) => /\.webm$/i.test(rel);

function cachePathFor(root, rel) {
  return path.join(root, CACHE_DIR_NAME, rel.replace(/\.webm$/i, ".m4a"));
}

function transcodeToM4a(input, output) {
  return new Promise((resolve, reject) => {
    const tmp = `${output}.${process.pid}.tmp.m4a`;
    const ff = spawn(process.env.FFMPEG_PATH || "ffmpeg", [
      "-y",
      "-loglevel",
      "error",
      "-i",
      input,
      "-vn",
      "-c:a",
      "aac",
      "-b:a",
      "64k",
      "-movflags",
      "+faststart",
      tmp,
    ]);
    let stderr = "";
    ff.stderr.on("data", (d) => {
      stderr += d;
    });
    ff.on("error", reject);
    ff.on("close", async (code) => {
      if (code !== 0) {
        await fs.rm(tmp, { force: true });
        reject(new Error(`ffmpeg exited with ${code}: ${stderr.trim()}`));
        return;
      }
      try {
        await fs.rename(tmp, output);
        resolve();
      } catch (err) {
        reject(err);
      }
    });
  });
}

async function ensureM4aCopy(source, target) {
  const [src, cached] = await Promise.all([
    fs.stat(source),
    fs.stat(target).catch(() => null),
  ]);
  if (cached && cached.mtimeMs >= src.mtimeMs) return;

  let job = inFlight.get(target);
  if (!job) {
    job = fs
      .mkdir(path.dirname(target), { recursive: true })
      .then(() => transcodeToM4a(source, target))
      .finally(() => inFlight.delete(target));
    inFlight.set(target, job);
  }
  await job;
}

/** Start converting a just-saved recording in the background; never throws. */
export function prepareM4aPlayback(uploadsRoot, rel) {
  if (!isWebm(rel)) return;
  const root = path.resolve(uploadsRoot);
  ensureM4aCopy(path.join(root, rel), cachePathFor(root, rel)).catch((err) => {
    console.error(`[audio] m4a pre-conversion failed for ${rel}:`, err?.message || err);
  });
}

async function listWebmFiles(dir, root) {
  const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
  const files = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (full !== path.join(root, CACHE_DIR_NAME)) files.push(...(await listWebmFiles(full, root)));
    } else if (isWebm(entry.name)) {
      files.push(full);
    }
  }
  return files;
}

/** Convert existing recordings that have no m4a copy yet, one at a time to spare the CPU. */
export async function backfillM4aPlayback(uploadsRoot) {
  const root = path.resolve(uploadsRoot);
  const files = await listWebmFiles(root, root);
  let converted = 0;
  let failed = 0;
  for (const source of files) {
    const target = cachePathFor(root, path.relative(root, source));
    const cached = await fs.stat(target).catch(() => null);
    if (cached) continue;
    try {
      await ensureM4aCopy(source, target);
      converted += 1;
    } catch (err) {
      failed += 1;
      console.error(`[audio] m4a backfill failed for ${source}:`, err?.message || err);
    }
  }
  if (converted || failed) {
    console.log(`[audio] m4a backfill done: ${converted} converted, ${failed} failed`);
  }
}

export function createM4aPlaybackMiddleware(uploadsRoot) {
  const root = path.resolve(uploadsRoot);
  return async function serveM4aPlayback(req, res, next) {
    if (req.query?.format !== "m4a" || !isWebm(req.path)) return next();

    let rel;
    try {
      rel = decodeURIComponent(req.path).replace(/^[\\/]+/, "");
    } catch {
      return res.sendStatus(400);
    }
    const source = path.resolve(root, rel);
    if (!source.startsWith(root + path.sep)) return res.sendStatus(400);

    const target = cachePathFor(root, rel);
    try {
      await ensureM4aCopy(source, target);
    } catch (err) {
      if (err?.code === "ENOENT" && err?.path === source) return res.sendStatus(404);
      console.error("[audio] m4a playback conversion failed:", err?.message || err);
      return res.sendStatus(503);
    }
    res.type("audio/mp4");
    res.sendFile(target);
  };
}
