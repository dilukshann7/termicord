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
  channelId: string;
  outputDir: string;
  skipExtensions: string;
  foldersPerMessage: boolean;
  saveTxt: boolean;
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
