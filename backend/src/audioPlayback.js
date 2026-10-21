import path from "path";
import fs from "fs/promises";
import { spawn } from "child_process";

/**
 * iOS Safari can't play the WebM/Opus files Chrome's MediaRecorder produces, so
 * `/uploads/<file>.webm?format=m4a` serves an AAC copy instead. Copies are made
 * with ffmpeg on first request and cached under uploads/playback-cache/.
 */
const CACHE_DIR_NAME = "playback-cache";
const inFlight = new Map();

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

export function createM4aPlaybackMiddleware(uploadsRoot) {
  const root = path.resolve(uploadsRoot);
  return async function serveM4aPlayback(req, res, next) {
    if (req.query?.format !== "m4a" || !/\.webm$/i.test(req.path)) return next();

    let rel;
    try {
      rel = decodeURIComponent(req.path).replace(/^[\\/]+/, "");
    } catch {
      return res.sendStatus(400);
    }
    const source = path.resolve(root, rel);
    if (!source.startsWith(root + path.sep)) return res.sendStatus(400);

    const target = path.join(root, CACHE_DIR_NAME, rel.replace(/\.webm$/i, ".m4a"));
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
