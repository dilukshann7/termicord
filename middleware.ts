import {
  runDownload,
  parseSkipExtensions,
  type DownloadConfig,
  type DownloadProgress,
  type ProgressCallback,
} from "./backend";

export type { DownloadProgress };

export interface DownloadConfigRaw {
  token: string;
  channelId: string; // may be comma-separated list
  outputDir: string;
  skipExtensions: string;
  foldersPerMessage: boolean;
  saveTxt: boolean;
  // Filters
  filterAuthor: string;
  filterDateFrom: string;
  filterDateTo: string;
  messageLimit: string; // "" or numeric string
  // File options
  maxFileSizeKb: string; // "" or numeric string
  downloadEmbeds: boolean;
  organiseByType: boolean;
  deduplicateByHash: boolean;
  filenameTemplate: string;
  // Resume
  resumeAfterMessageId: string; // "" = full fetch
}

export interface DownloadHandle {
  done: Promise<void>;
  abort: () => void;
  readonly aborted: boolean;
}

export function startDownloadTask(
  config: DownloadConfigRaw,
  onProgress: (line: string, evt: DownloadProgress) => void,
): DownloadHandle {
  const ac = new AbortController();

  const resolved: DownloadConfig = {
    token: config.token,
    channelId: config.channelId,
    outputDir: config.outputDir || "./downloads",
    skipExtensions: parseSkipExtensions(config.skipExtensions),
    foldersPerMessage: config.foldersPerMessage,
    saveTxt: config.saveTxt,
    filterAuthor: config.filterAuthor.trim(),
    filterDateFrom: config.filterDateFrom.trim(),
    filterDateTo: config.filterDateTo.trim(),
    messageLimit: parseInt(config.messageLimit) || 0,
    maxFileSizeKb: parseInt(config.maxFileSizeKb) || 0,
    downloadEmbeds: config.downloadEmbeds,
    organiseByType: config.organiseByType,
    deduplicateByHash: config.deduplicateByHash,
    filenameTemplate: config.filenameTemplate || "{msgid}_{filename}",
    resumeAfterMessageId: config.resumeAfterMessageId,
  };

  const progressCb: ProgressCallback = (evt) => {
    onProgress(evt.message, evt);
  };

  const done = runDownload(resolved, progressCb, ac.signal).catch((err) => {
    const errMsg = `✗ Unexpected error: ${(err as Error).message}`;
    onProgress(errMsg, { type: "error", message: errMsg });
  });

  return {
    done,
    abort: () => ac.abort(),
    get aborted() {
      return ac.signal.aborted;
    },
  };
}
