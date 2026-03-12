import {
  runDownload,
  parseSkipExtensions,
  type DownloadConfig,
  type ProgressCallback,
} from "./backend";

export interface DownloadConfigRaw {
  token: string;
  channelId: string;
  outputDir: string;
  skipExtensions: string;
  foldersPerMessage: boolean;
}

export interface DownloadHandle {
  done: Promise<void>;
  abort: () => void;
  readonly aborted: boolean;
}

export function startDownloadTask(
  config: DownloadConfigRaw,
  onProgress: (line: string) => void,
): DownloadHandle {
  const ac = new AbortController();

  const resolved: DownloadConfig = {
    token: config.token,
    channelId: config.channelId,
    outputDir: config.outputDir || "./downloads",
    skipExtensions: parseSkipExtensions(config.skipExtensions),
    foldersPerMessage: config.foldersPerMessage,
  };

  const progressCb: ProgressCallback = (evt) => {
    onProgress(evt.message);
  };

  const done = runDownload(resolved, progressCb, ac.signal).catch((err) => {
    onProgress(`✗ Unexpected error: ${(err as Error).message}`);
  });

  return {
    done,
    abort: () => ac.abort(),
    get aborted() {
      return ac.signal.aborted;
    },
  };
}
