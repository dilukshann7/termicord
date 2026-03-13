import fs from "fs";
import path from "path";
import https from "https";
import http from "http";
import crypto from "crypto";
import { URL } from "url";

export interface DownloadConfig {
  token: string;
  channelId: string;
  outputDir: string;
  skipExtensions: string[]; // e.g. [".jpg", ".png"]
  foldersPerMessage: boolean;
  saveTxt: boolean;
  filterAuthor: string; // "" = no filter
  filterDateFrom: string; // "YYYY-MM-DD" or ""
  filterDateTo: string; // "YYYY-MM-DD" or ""
  messageLimit: number; // 0 = no limit
  maxFileSizeKb: number; // 0 = no limit
  downloadEmbeds: boolean;
  organiseByType: boolean;
  deduplicateByHash: boolean;
  filenameTemplate: string; // "{msgid}_{filename}" etc.
  resumeAfterMessageId: string; // "" = full fetch
}

export interface DownloadProgress {
  type:
    | "log"
    | "progress"
    | "done"
    | "error"
    | "fetching"
    | "rate_limit"
    | "file_skip"
    | "file_start"
    | "file_done"
    | "file_fail";
  message: string;
  totalMessages?: number;
  messagesWithAttachments?: number;
  filesDownloaded?: number;
  filesTotal?: number;
  currentFile?: string;
  outputDir?: string;
  progress?: number;
  skippedFiles?: number;
  failedFiles?: number;
  totalBytes?: number;
  elapsedMs?: number;
}

export type ProgressCallback = (progress: DownloadProgress) => void;

function sanitize(name: string, maxLen = 60): string {
  const cleaned = name
    .replace(/[\\/*?:"<>|]/g, "")
    .trim()
    .replace(/\n/g, " ");
  return cleaned.slice(0, maxLen) || "untitled";
}

export function parseSkipExtensions(raw: string): string[] {
  return raw
    .split(/[\s,]+/)
    .map((e) => e.trim().toLowerCase())
    .map((e) => e.replace(/^\*\.?/, ""))
    .filter((e) => e.length > 0)
    .map((e) => (e.startsWith(".") ? e : `.${e}`));
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const typeMap: Record<string, string> = {
  // images
  ".jpg": "images",
  ".jpeg": "images",
  ".png": "images",
  ".gif": "images",
  ".webp": "images",
  ".bmp": "images",
  ".tiff": "images",
  ".tif": "images",
  ".svg": "images",
  ".ico": "images",
  ".avif": "images",
  ".heic": "images",
  ".heif": "images",
  // videos
  ".mp4": "videos",
  ".mkv": "videos",
  ".mov": "videos",
  ".avi": "videos",
  ".webm": "videos",
  ".flv": "videos",
  ".wmv": "videos",
  ".m4v": "videos",
  ".mpeg": "videos",
  ".mpg": "videos",
  ".3gp": "videos",
  // audio (lump in videos dir)
  ".mp3": "videos",
  ".wav": "videos",
  ".ogg": "videos",
  ".flac": "videos",
  ".aac": "videos",
  ".m4a": "videos",
  ".opus": "videos",
  // archives
  ".zip": "archives",
  ".rar": "archives",
  ".7z": "archives",
  ".tar": "archives",
  ".gz": "archives",
  ".bz2": "archives",
  ".xz": "archives",
  ".zst": "archives",
  ".lz4": "archives",
  // documents
  ".pdf": "documents",
  ".doc": "documents",
  ".docx": "documents",
  ".xls": "documents",
  ".xlsx": "documents",
  ".ppt": "documents",
  ".pptx": "documents",
  ".odt": "documents",
  ".ods": "documents",
  ".odp": "documents",
  ".txt": "documents",
  ".md": "documents",
  ".csv": "documents",
  ".json": "documents",
  ".xml": "documents",
  ".html": "documents",
  ".htm": "documents",
};

function typeSubdir(filename: string): string {
  const ext = path.extname(filename).toLowerCase();
  return typeMap[ext] ?? "other";
}

function renderFilenameTemplate(
  template: string,
  vars: {
    msgid: string;
    date: string;
    author: string;
    index: string;
    filename: string;
    ext: string;
  },
): string {
  let result = template;
  for (const [key, val] of Object.entries(vars)) {
    result = result.replaceAll(`{${key}}`, sanitize(val, 60));
  }
  const ext = vars.ext.startsWith(".") ? vars.ext : `.${vars.ext}`;
  if (!result.endsWith(ext)) result += ext;
  return result;
}

function hashFirst64KB(filePath: string): string {
  const fd = fs.openSync(filePath, "r");
  const buf = Buffer.alloc(65536);
  const bytesRead = fs.readSync(fd, buf, 0, 65536, 0);
  fs.closeSync(fd);
  return crypto
    .createHash("sha1")
    .update(buf.slice(0, bytesRead))
    .digest("hex");
}

interface HttpResponse {
  statusCode: number;
  body: string;
  headers: Record<string, string | string[] | undefined>;
}

function httpGet(
  urlStr: string,
  headers: Record<string, string>,
): Promise<HttpResponse> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(urlStr);
    const mod = parsed.protocol === "https:" ? https : http;

    const req = mod.get(
      {
        hostname: parsed.hostname,
        path: parsed.pathname + parsed.search,
        headers,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => chunks.push(chunk));
        res.on("end", () =>
          resolve({
            statusCode: res.statusCode ?? 0,
            body: Buffer.concat(chunks).toString("utf8"),
            headers: res.headers as Record<
              string,
              string | string[] | undefined
            >,
          }),
        );
        res.on("error", reject);
      },
    );
    req.on("error", reject);
    req.setTimeout(30_000, () => {
      req.destroy(new Error("Request timed out"));
    });
  });
}

function downloadBinaryFile(
  urlStr: string,
  destPath: string,
  headers: Record<string, string>,
  redirectsLeft = 5,
): Promise<number> {
  // Returns bytes written
  return new Promise((resolve, reject) => {
    const parsed = new URL(urlStr);
    const mod = parsed.protocol === "https:" ? https : http;

    const req = mod.get(
      {
        hostname: parsed.hostname,
        path: parsed.pathname + parsed.search,
        headers,
      },
      (res) => {
        const status = res.statusCode ?? 0;

        if (
          [301, 302, 303, 307, 308].includes(status) &&
          res.headers.location
        ) {
          if (redirectsLeft <= 0) {
            reject(new Error("Too many redirects"));
            return;
          }
          const next = new URL(res.headers.location, urlStr).href;
          res.resume();
          resolve(
            downloadBinaryFile(next, destPath, headers, redirectsLeft - 1),
          );
          return;
        }

        if (status !== 200) {
          reject(new Error(`HTTP ${status}`));
          return;
        }
        let bytes = 0;
        const stream = fs.createWriteStream(destPath);
        res.on("data", (chunk: Buffer) => {
          bytes += chunk.length;
        });
        res.pipe(stream);
        stream.on("finish", () => resolve(bytes));
        stream.on("error", reject);
      },
    );
    req.on("error", reject);
    req.setTimeout(60_000, () => {
      req.destroy(new Error("Download timed out"));
    });
  });
}

interface DiscordEmbedImage {
  url?: string;
  proxy_url?: string;
  height?: number;
  width?: number;
}

interface DiscordEmbed {
  type?: string;
  url?: string;
  image?: DiscordEmbedImage;
  thumbnail?: DiscordEmbedImage;
  video?: { url?: string };
}

interface DiscordAttachment {
  id: string;
  filename: string;
  size: number;
  url: string;
}

interface DiscordMessage {
  id: string;
  timestamp: string;
  content: string;
  author: { username: string; id: string };
  attachments: DiscordAttachment[];
  embeds?: DiscordEmbed[];
}

interface FileRecord {
  url: string;
  filename: string;
  sizeBytes: number; // 0 if unknown (embed)
  msgId: string;
  msgDate: string; // YYYY-MM-DD
  author: string;
  index: number; // per-message index
}

async function fetchAllMessages(
  channelId: string,
  headers: Record<string, string>,
  onProgress: ProgressCallback,
  signal: AbortSignal | undefined,
  resumeAfterMessageId: string,
  messageLimit: number,
): Promise<DiscordMessage[]> {
  const messages: DiscordMessage[] = [];
  let lastId: string | null = null;

  onProgress({
    type: "fetching",
    message: "Fetching messages from Discord...",
  });

  while (true) {
    if (signal?.aborted) break;
    if (messageLimit > 0 && messages.length >= messageLimit) break;

    const batchSize =
      messageLimit > 0 ? Math.min(100, messageLimit - messages.length) : 100;

    let url = `https://discord.com/api/v10/channels/${channelId}/messages?limit=${batchSize}`;
    if (lastId) url += `&before=${lastId}`;
    if (resumeAfterMessageId && !lastId)
      url += `&after=${resumeAfterMessageId}`;

    let resp: HttpResponse;
    try {
      resp = await httpGet(url, headers);
    } catch (err) {
      onProgress({
        type: "error",
        message: `Network error: ${(err as Error).message}`,
      });
      break;
    }

    if (resp.statusCode === 429) {
      let retryAfter = 5;
      try {
        const json = JSON.parse(resp.body) as { retry_after?: number };
        retryAfter = json.retry_after ?? 5;
      } catch {}
      onProgress({
        type: "rate_limit",
        message: `Rate limited — waiting ${retryAfter}s...`,
      });
      await sleep(retryAfter * 1000);
      continue;
    }

    if (resp.statusCode === 401) {
      onProgress({
        type: "error",
        message: "Invalid token (401 Unauthorized).",
      });
      break;
    }
    if (resp.statusCode === 403) {
      onProgress({
        type: "error",
        message: "Missing access to channel (403 Forbidden).",
      });
      break;
    }
    if (resp.statusCode !== 200) {
      onProgress({
        type: "error",
        message: `Discord API error ${resp.statusCode}: ${resp.body.slice(0, 120)}`,
      });
      break;
    }

    let batch: DiscordMessage[];
    try {
      batch = JSON.parse(resp.body) as DiscordMessage[];
    } catch {
      onProgress({
        type: "error",
        message: "Failed to parse Discord API response.",
      });
      break;
    }

    if (!batch.length) break;

    messages.push(...batch);
    lastId = batch[batch.length - 1]!.id;

    onProgress({
      type: "log",
      message: `  Fetched ${messages.length} messages so far...`,
      totalMessages: messages.length,
    });

    await sleep(500);
  }

  return messages;
}

async function downloadWithRetry(
  url: string,
  destPath: string,
  headers: Record<string, string>,
  maxRetries = 3,
  onRetry?: (attempt: number, err: Error) => void,
): Promise<number> {
  let lastErr: Error = new Error("Unknown error");
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await downloadBinaryFile(url, destPath, headers);
    } catch (err) {
      lastErr = err as Error;
      if (attempt < maxRetries) {
        onRetry?.(attempt, lastErr);
        await sleep(attempt * 1000);
      }
    }
  }
  throw lastErr;
}

async function resolveChannelId(
  rawId: string,
  headers: Record<string, string>,
  onProgress: ProgressCallback,
): Promise<string> {
  // Channel types: 0=text, 1=DM, 3=group DM, 10/11/12=thread, 15/16=forum
  try {
    const resp = await httpGet(
      `https://discord.com/api/v10/channels/${rawId}`,
      headers,
    );
    if (resp.statusCode === 200) {
      const ch = JSON.parse(resp.body) as { type?: number; id?: string };
      const chType = ch.type ?? 0;
      // Threads and forums use the same messages endpoint so ID is fine as-is
      const typeName =
        chType === 0
          ? "text channel"
          : chType === 1
            ? "DM"
            : chType === 3
              ? "group DM"
              : chType === 10 || chType === 11 || chType === 12
                ? "thread"
                : chType === 15 || chType === 16
                  ? "forum"
                  : `type ${chType}`;
      onProgress({ type: "log", message: `  Channel type : ${typeName}` });
    }
  } catch {}
  return rawId.trim();
}

function sendCompletionNotification(
  filesDownloaded: number,
  outputDir: string,
): void {
  process.stdout.write("\x07");

  const title = "Termicord";
  const body = `Download complete — ${filesDownloaded} file(s) saved to ${outputDir}`;

  const { platform } = process;
  try {
    if (platform === "linux") {
      Bun.spawnSync(["notify-send", title, body]);
    } else if (platform === "darwin") {
      Bun.spawnSync([
        "osascript",
        "-e",
        `display notification "${body}" with title "${title}"`,
      ]);
    } else if (platform === "win32") {
      Bun.spawnSync(["msg", "*", `${title}: ${body}`]);
    }
  } catch {}
}

export async function runDownload(
  config: DownloadConfig,
  onProgress: ProgressCallback,
  signal?: AbortSignal,
): Promise<void> {
  const startTime = Date.now();

  const {
    token,
    outputDir,
    skipExtensions,
    foldersPerMessage,
    saveTxt,
    filterAuthor,
    filterDateFrom,
    filterDateTo,
    messageLimit,
    maxFileSizeKb,
    downloadEmbeds,
    organiseByType,
    deduplicateByHash,
    filenameTemplate,
    resumeAfterMessageId,
  } = config;

  const channelIds = config.channelId
    .split(",")
    .map((id) => id.trim())
    .filter((id) => id.length > 0);

  if (!token.trim()) {
    onProgress({ type: "error", message: "✗ Discord token is required." });
    return;
  }
  if (channelIds.length === 0) {
    onProgress({ type: "error", message: "✗ Channel ID is required." });
    return;
  }

  const headers: Record<string, string> = { Authorization: token.trim() };

  let grandDownloaded = 0;
  let grandSkipped = 0;
  let grandFailed = 0;
  let grandBytes = 0;
  let grandFilesTotal = 0;

  for (const rawChannelId of channelIds) {
    if (signal?.aborted) break;

    const isBatch = channelIds.length > 1;

    const channelId = await resolveChannelId(rawChannelId, headers, onProgress);

    const channelOutputDir = isBatch
      ? path.join(outputDir, channelId)
      : outputDir;

    try {
      fs.mkdirSync(channelOutputDir, { recursive: true });
    } catch (err) {
      onProgress({
        type: "error",
        message: `✗ Cannot create output directory: ${(err as Error).message}`,
      });
      continue;
    }

    if (isBatch) {
      onProgress({ type: "log", message: `\n  ━━━ Channel ${channelId} ━━━` });
    }

    const allMessages = await fetchAllMessages(
      channelId,
      headers,
      onProgress,
      signal,
      resumeAfterMessageId,
      messageLimit,
    );

    if (signal?.aborted) {
      onProgress({ type: "log", message: "⊘ Download aborted." });
      break;
    }

    const messages = allMessages.filter((msg) => {
      if (filterAuthor) {
        const af = filterAuthor.toLowerCase();
        const matchName = msg.author.username.toLowerCase().includes(af);
        const matchId = msg.author.id === af;
        if (!matchName && !matchId) return false;
      }
      if (filterDateFrom) {
        const msgDate = msg.timestamp.slice(0, 10);
        if (msgDate < filterDateFrom) return false;
      }
      if (filterDateTo) {
        const msgDate = msg.timestamp.slice(0, 10);
        if (msgDate > filterDateTo) return false;
      }
      return true;
    });

    const fileRecords: FileRecord[] = [];
    let msgFileIndex = 0;

    for (const msg of messages) {
      const msgDate = msg.timestamp.slice(0, 10);
      const author = msg.author.username;
      msgFileIndex = 0;

      for (const att of msg.attachments ?? []) {
        fileRecords.push({
          url: att.url,
          filename: att.filename,
          sizeBytes: att.size,
          msgId: msg.id,
          msgDate,
          author,
          index: msgFileIndex++,
        });
      }

      if (downloadEmbeds) {
        for (const embed of msg.embeds ?? []) {
          const imgUrl =
            embed.image?.url ??
            embed.thumbnail?.url ??
            (embed.type === "image" ? embed.url : undefined);
          if (imgUrl) {
            const embedFilename =
              path.basename(new URL(imgUrl).pathname) || "embed.jpg";
            fileRecords.push({
              url: imgUrl,
              filename: embedFilename,
              sizeBytes: 0,
              msgId: msg.id,
              msgDate,
              author,
              index: msgFileIndex++,
            });
          }
        }
      }
    }

    const toDownload = fileRecords.filter((f) => {
      const ext = path.extname(f.filename).toLowerCase();
      if (skipExtensions.includes(ext)) return false;
      if (
        maxFileSizeKb > 0 &&
        f.sizeBytes > 0 &&
        f.sizeBytes / 1024 > maxFileSizeKb
      )
        return false;
      return true;
    });

    const filesTotal = toDownload.length;
    grandFilesTotal += filesTotal;

    onProgress({
      type: "log",
      message: `\n  Found ${allMessages.length} messages total (${messages.length} after filters).`,
      totalMessages: messages.length,
    });
    onProgress({
      type: "log",
      message: `  ${filesTotal} file(s) to download (after skip/size filter).`,
      filesTotal,
    });
    onProgress({
      type: "log",
      message: "  ──────────────────────────────────────────",
    });

    if (filesTotal === 0 && !saveTxt) {
      onProgress({ type: "log", message: "  No files to download." });
      continue;
    }

    let downloaded = 0;
    let skippedExt = 0;
    let failed = 0;
    let bytesThisChannel = 0;

    const seenHashes = new Set<string>();

    let newestMessageId = resumeAfterMessageId;

    for (const msg of messages) {
      if (signal?.aborted) {
        onProgress({ type: "log", message: "⊘ Download aborted by user." });
        break;
      }

      if (!newestMessageId || msg.id > newestMessageId) {
        newestMessageId = msg.id;
      }

      const msgDate = msg.timestamp.slice(0, 10);
      const author = sanitize(msg.author.username);
      const snippet = sanitize(msg.content.slice(0, 40)) || "no-text";

      let baseFolderPath: string;
      if (foldersPerMessage) {
        const folderName = `${msgDate}_${author}_${snippet}`;
        baseFolderPath = path.join(channelOutputDir, folderName);
        onProgress({ type: "log", message: `\n  📁  ${folderName}` });
      } else {
        baseFolderPath = channelOutputDir;
      }

      try {
        fs.mkdirSync(baseFolderPath, { recursive: true });
      } catch (err) {
        onProgress({
          type: "error",
          message: `  ✗ Cannot create folder: ${(err as Error).message}`,
        });
        continue;
      }

      if (saveTxt) {
        const txtFileName = `${msgDate}_${author}_${snippet}.txt`;
        const txtPath = path.join(baseFolderPath, txtFileName);
        if (fs.existsSync(txtPath)) {
          onProgress({
            type: "log",
            message: `    📄 Already exists (txt): ${txtFileName}`,
          });
        } else {
          try {
            const txtContent = [
              `Message ID : ${msg.id}`,
              `Timestamp  : ${msg.timestamp}`,
              `Author     : ${msg.author.username}`,
              ``,
              msg.content || "(no text content)",
            ].join("\n");
            fs.writeFileSync(txtPath, txtContent, "utf8");
            onProgress({
              type: "log",
              message: `    📄 Saved message text: ${txtFileName}`,
            });
          } catch (err) {
            onProgress({
              type: "error",
              message: `    ✗ Failed to save .txt: ${(err as Error).message}`,
            });
          }
        }
      }

      const msgFiles: FileRecord[] = [];
      let fi = 0;
      for (const att of msg.attachments ?? []) {
        msgFiles.push({
          url: att.url,
          filename: att.filename,
          sizeBytes: att.size,
          msgId: msg.id,
          msgDate,
          author: msg.author.username,
          index: fi++,
        });
      }
      if (downloadEmbeds) {
        for (const embed of msg.embeds ?? []) {
          const imgUrl =
            embed.image?.url ??
            embed.thumbnail?.url ??
            (embed.type === "image" ? embed.url : undefined);
          if (imgUrl) {
            const embedFilename = (() => {
              try {
                return path.basename(new URL(imgUrl).pathname) || "embed.jpg";
              } catch {
                return "embed.jpg";
              }
            })();
            msgFiles.push({
              url: imgUrl,
              filename: embedFilename,
              sizeBytes: 0,
              msgId: msg.id,
              msgDate,
              author: msg.author.username,
              index: fi++,
            });
          }
        }
      }

      for (const fileRec of msgFiles) {
        if (signal?.aborted) break;

        const ext = path.extname(fileRec.filename).toLowerCase();

        if (skipExtensions.includes(ext)) {
          skippedExt++;
          onProgress({
            type: "file_skip",
            message: `    ↷ Skipped (${ext}): ${fileRec.filename}`,
            currentFile: fileRec.filename,
          });
          continue;
        }

        if (
          maxFileSizeKb > 0 &&
          fileRec.sizeBytes > 0 &&
          fileRec.sizeBytes / 1024 > maxFileSizeKb
        ) {
          skippedExt++;
          const sizeKb = Math.round(fileRec.sizeBytes / 1024);
          onProgress({
            type: "file_skip",
            message: `    ↷ Skipped (too large: ${sizeKb} KB > ${maxFileSizeKb} KB): ${fileRec.filename}`,
            currentFile: fileRec.filename,
          });
          continue;
        }

        const safeFilename = (() => {
          const tmpl = filenameTemplate || "{msgid}_{filename}";
          return renderFilenameTemplate(tmpl, {
            msgid: fileRec.msgId,
            date: fileRec.msgDate,
            author: sanitize(fileRec.author, 30),
            index: String(fileRec.index).padStart(3, "0"),
            filename: path.basename(fileRec.filename, ext),
            ext: ext.replace(/^\./, ""),
          });
        })();

        let destFolder = baseFolderPath;
        if (organiseByType) {
          const subdir = typeSubdir(fileRec.filename);
          destFolder = path.join(baseFolderPath, subdir);
          try {
            fs.mkdirSync(destFolder, { recursive: true });
          } catch {}
        }

        const destPath = path.join(destFolder, safeFilename);

        if (fs.existsSync(destPath)) {
          onProgress({
            type: "file_skip",
            message: `    ↩ Already exists: ${safeFilename}`,
            currentFile: fileRec.filename,
          });
          skippedExt++;
          continue;
        }

        const sizeKb =
          fileRec.sizeBytes > 0 ? Math.round(fileRec.sizeBytes / 1024) : 0;
        const sizeLabel = sizeKb > 0 ? ` (${sizeKb} KB)` : "";
        onProgress({
          type: "file_start",
          message: `    ↓ ${safeFilename}${sizeLabel}`,
          currentFile: fileRec.filename,
        });

        let bytesWritten = 0;
        try {
          bytesWritten = await downloadWithRetry(
            fileRec.url,
            destPath,
            headers,
            3,
            (attempt, err) => {
              onProgress({
                type: "log",
                message: `    ↻ Retry ${attempt}/2: ${fileRec.filename} — ${err.message}`,
              });
            },
          );

          if (deduplicateByHash && fs.existsSync(destPath)) {
            try {
              const hash = hashFirst64KB(destPath);
              if (seenHashes.has(hash)) {
                fs.unlinkSync(destPath);
                skippedExt++;
                onProgress({
                  type: "file_skip",
                  message: `    ↷ Duplicate (hash): ${safeFilename}`,
                  currentFile: fileRec.filename,
                });
                continue;
              }
              seenHashes.add(hash);
            } catch {}
          }

          downloaded++;
          bytesThisChannel += bytesWritten;
          onProgress({
            type: "file_done",
            message: `    ✓ Saved: ${safeFilename}`,
            currentFile: safeFilename,
            filesDownloaded: grandDownloaded + downloaded,
            filesTotal: grandFilesTotal,
            progress: Math.round(
              ((grandDownloaded + downloaded) / Math.max(1, grandFilesTotal)) *
                100,
            ),
          });
        } catch (err) {
          try {
            if (fs.existsSync(destPath)) fs.unlinkSync(destPath);
          } catch {}
          failed++;
          onProgress({
            type: "file_fail",
            message: `    ✗ Failed: ${fileRec.filename} — ${(err as Error).message}`,
            currentFile: fileRec.filename,
          });
        }

        await sleep(200);
      }
    }

    grandDownloaded += downloaded;
    grandSkipped += skippedExt;
    grandFailed += failed;
    grandBytes += bytesThisChannel;

    if (isBatch) {
      const absPath = path.resolve(channelOutputDir);
      onProgress({
        type: "log",
        message: `  ✓ Channel ${channelId}: ${downloaded} file(s) → ${absPath}`,
      });
    }

    if (newestMessageId && newestMessageId !== resumeAfterMessageId) {
      onProgress({
        type: "log",
        message: `  ↻ Resume point saved (msg ${newestMessageId})`,
      });
    }
  }

  if (signal?.aborted) {
    onProgress({ type: "log", message: "⊘ Download aborted." });
    return;
  }

  const elapsedMs = Date.now() - startTime;
  const absPath = path.resolve(outputDir);

  onProgress({
    type: "log",
    message: "  ──────────────────────────────────────────",
  });
  onProgress({
    type: "done",
    message: `  ✓ Done! Downloaded ${grandDownloaded} file(s) → ${absPath}`,
    filesDownloaded: grandDownloaded,
    filesTotal: grandFilesTotal,
    skippedFiles: grandSkipped,
    failedFiles: grandFailed,
    totalBytes: grandBytes,
    elapsedMs,
    outputDir: absPath,
  });

  sendCompletionNotification(grandDownloaded, absPath);
}
