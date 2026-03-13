import fs from "fs";
import path from "path";
import https from "https";
import http from "http";
import { URL } from "url";

export interface DownloadConfig {
  token: string;
  channelId: string;
  outputDir: string;
  skipExtensions: string[]; // e.g. [".jpg", ".png"]
  foldersPerMessage: boolean;
  saveTxt: boolean;
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
}

export type ProgressCallback = (progress: DownloadProgress) => void;

function sanitize(name: string, maxLen = 60): string {
  const cleaned = name
    .replace(/[\\/*?:"<>|]/g, "")
    .trim()
    .replace(/\n/g, " ");
  return cleaned.slice(0, maxLen) || "untitled";
}

function parseSkipExtensions(raw: string): string[] {
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
): Promise<void> {
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
        const stream = fs.createWriteStream(destPath);
        res.pipe(stream);
        stream.on("finish", () => resolve());
        stream.on("error", reject);
      },
    );
    req.on("error", reject);
    req.setTimeout(60_000, () => {
      req.destroy(new Error("Download timed out"));
    });
  });
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
  author: { username: string };
  attachments: DiscordAttachment[];
}

async function fetchAllMessages(
  channelId: string,
  headers: Record<string, string>,
  onProgress: ProgressCallback,
  signal?: AbortSignal,
): Promise<DiscordMessage[]> {
  const messages: DiscordMessage[] = [];
  let lastId: string | null = null;

  onProgress({
    type: "fetching",
    message: "Fetching messages from Discord...",
  });

  while (true) {
    if (signal?.aborted) break;

    let url = `https://discord.com/api/v10/channels/${channelId}/messages?limit=100`;
    if (lastId) url += `&before=${lastId}`;

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
        const json = JSON.parse(resp.body);
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
      batch = JSON.parse(resp.body);
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
): Promise<void> {
  let lastErr: Error = new Error("Unknown error");
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      await downloadBinaryFile(url, destPath, headers);
      return;
    } catch (err) {
      lastErr = err as Error;
      if (attempt < maxRetries) {
        onRetry?.(attempt, lastErr);
        await sleep(attempt * 1000); // 1s, 2s back-off
      }
    }
  }
  throw lastErr;
}

export async function runDownload(
  config: DownloadConfig,
  onProgress: ProgressCallback,
  signal?: AbortSignal,
): Promise<void> {
  const {
    token,
    channelId,
    outputDir,
    skipExtensions,
    foldersPerMessage,
    saveTxt,
  } = config;

  // Validate
  if (!token.trim()) {
    onProgress({ type: "error", message: "✗ Discord token is required." });
    return;
  }
  if (!channelId.trim()) {
    onProgress({ type: "error", message: "✗ Channel ID is required." });
    return;
  }

  const headers: Record<string, string> = { Authorization: token.trim() };

  try {
    fs.mkdirSync(outputDir, { recursive: true });
  } catch (err) {
    onProgress({
      type: "error",
      message: `✗ Cannot create output directory: ${(err as Error).message}`,
    });
    return;
  }

  const messages = await fetchAllMessages(
    channelId,
    headers,
    onProgress,
    signal,
  );

  if (signal?.aborted) {
    onProgress({ type: "log", message: "⊘ Download aborted." });
    return;
  }

  const withAttachments = messages.filter((m) => m.attachments?.length > 0);

  onProgress({
    type: "log",
    message: `\n  Found ${messages.length} messages total.`,
    totalMessages: messages.length,
  });
  onProgress({
    type: "log",
    message: `  ${withAttachments.length} messages have attachments.`,
    messagesWithAttachments: withAttachments.length,
  });
  onProgress({
    type: "log",
    message: "  ──────────────────────────────────────────",
  });

  if (withAttachments.length === 0) {
    onProgress({
      type: "done",
      message: "✓ No attachments found.",
      filesDownloaded: 0,
      outputDir,
    });
    return;
  }

  let filesTotal = 0;
  for (const msg of withAttachments) {
    for (const att of msg.attachments) {
      const ext = path.extname(att.filename).toLowerCase();
      if (!skipExtensions.includes(ext)) filesTotal++;
    }
  }

  onProgress({
    type: "log",
    message: `  ${filesTotal} file(s) to download (after skip filter).`,
    filesTotal,
  });
  onProgress({
    type: "log",
    message: "  ──────────────────────────────────────────",
  });

  let downloaded = 0;
  let skippedExt = 0;

  for (const msg of withAttachments) {
    if (signal?.aborted) {
      onProgress({ type: "log", message: "⊘ Download aborted by user." });
      break;
    }

    const ts = msg.timestamp.slice(0, 10); // "2025-10-31"
    const author = sanitize(msg.author.username);
    const snippet = sanitize(msg.content.slice(0, 40)) || "no-text";

    let folderPath: string;

    if (foldersPerMessage) {
      const folderName = `${ts}_${author}_${snippet}`;
      folderPath = path.join(outputDir, folderName);
      onProgress({ type: "log", message: `\n  📁  ${folderName}` });
    } else {
      folderPath = outputDir;
    }

    try {
      fs.mkdirSync(folderPath, { recursive: true });
    } catch (err) {
      onProgress({
        type: "error",
        message: `  ✗ Cannot create folder: ${(err as Error).message}`,
      });
      continue;
    }

    if (saveTxt) {
      const txtFileName = `${ts}_${author}_${snippet}.txt`;
      const txtPath = path.join(folderPath, txtFileName);
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

    for (const att of msg.attachments) {
      if (signal?.aborted) break;

      const ext = path.extname(att.filename).toLowerCase();

      if (skipExtensions.includes(ext)) {
        skippedExt++;
        onProgress({
          type: "file_skip",
          message: `    ↷ Skipped (${ext}): ${att.filename}`,
          currentFile: att.filename,
        });
        continue;
      }

      const safeFilename = foldersPerMessage
        ? att.filename
        : `${msg.id}_${att.filename}`;
      const destPath = path.join(folderPath, safeFilename);

      if (fs.existsSync(destPath)) {
        onProgress({
          type: "file_skip",
          message: `    ↩ Already exists: ${safeFilename}`,
          currentFile: att.filename,
        });
        continue;
      }

      const sizeKb = Math.round(att.size / 1024);
      onProgress({
        type: "file_start",
        message: `    ↓ ${safeFilename} (${sizeKb} KB)`,
        currentFile: att.filename,
      });

      try {
        await downloadWithRetry(
          att.url,
          destPath,
          headers,
          3,
          (attempt, err) => {
            onProgress({
              type: "log",
              message: `    ↻ Retry ${attempt}/2: ${att.filename} — ${err.message}`,
            });
          },
        );
        downloaded++;
        onProgress({
          type: "file_done",
          message: `    ✓ Saved: ${safeFilename}`,
          currentFile: safeFilename,
          filesDownloaded: downloaded,
          filesTotal,
          progress: Math.round((downloaded / filesTotal) * 100),
        } as DownloadProgress & { progress: number });
      } catch (err) {
        onProgress({
          type: "file_fail",
          message: `    ✗ Failed: ${att.filename} — ${(err as Error).message}`,
          currentFile: att.filename,
        });
      }

      await sleep(200);
    }
  }

  const absPath = path.resolve(outputDir);
  onProgress({
    type: "log",
    message: "  ──────────────────────────────────────────",
  });
  onProgress({
    type: "done",
    message: `  ✓ Done! Downloaded ${downloaded} file(s) → ${absPath}`,
    filesDownloaded: downloaded,
    filesTotal,
    outputDir: absPath,
  });
}

export { parseSkipExtensions };
