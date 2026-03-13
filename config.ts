import fs from "fs";
import path from "path";
import os from "os";

export interface Profile {
  name: string;
  token: string;
  channelIds: string;
  outputDir: string;
  skipExtensions: string;
  foldersPerMessage: boolean;
  saveTxt: boolean;
  filterAuthor: string;
  filterDateFrom: string;
  filterDateTo: string;
  messageLimit: string;
  maxFileSizeKb: string;
  downloadEmbeds: boolean;
  organiseByType: boolean;
  deduplicateByHash: boolean;
  filenameTemplate: string;
}

export interface HistoryEntry {
  runId: string;
  channelId: string;
  outputDir: string;
  startedAt: string;
  finishedAt: string;
  filesDownloaded: number;
  filesTotal: number;
  failedFiles: number;
  skippedFiles: number;
  totalBytes: number;
  aborted: boolean;
}

export interface ChannelState {
  lastMessageId: string;
  lastRunAt: string;
}

export interface AppConfig {
  activeProfile: string;
  profiles: Profile[];
  history: HistoryEntry[];
  channelStates: Record<string, ChannelState>;
}

export const DEFAULT_PROFILE_NAME = "default";

export function makeDefaultProfile(name = DEFAULT_PROFILE_NAME): Profile {
  return {
    name,
    token: "",
    channelIds: "",
    outputDir: "./downloads",
    skipExtensions: "",
    foldersPerMessage: false,
    saveTxt: false,
    filterAuthor: "",
    filterDateFrom: "",
    filterDateTo: "",
    messageLimit: "",
    maxFileSizeKb: "",
    downloadEmbeds: false,
    organiseByType: false,
    deduplicateByHash: false,
    filenameTemplate: "{msgid}_{filename}",
  };
}

function makeDefaultConfig(): AppConfig {
  return {
    activeProfile: DEFAULT_PROFILE_NAME,
    profiles: [makeDefaultProfile()],
    history: [],
    channelStates: {},
  };
}

function getConfigPath(): string {
  try {
    const dir = path.join(os.homedir(), ".config", "termicord");
    fs.mkdirSync(dir, { recursive: true });
    return path.join(dir, "config.json");
  } catch {
    return path.join(process.cwd(), ".termicord-config.json");
  }
}

export function loadConfig(): AppConfig {
  const configPath = getConfigPath();
  try {
    const raw = fs.readFileSync(configPath, "utf8");
    const parsed = JSON.parse(raw) as Partial<AppConfig>;

    const base = makeDefaultConfig();
    const config: AppConfig = {
      activeProfile: parsed.activeProfile ?? base.activeProfile,
      profiles:
        parsed.profiles && parsed.profiles.length > 0
          ? parsed.profiles.map((p) => ({
              ...makeDefaultProfile(p.name),
              ...p,
            }))
          : base.profiles,
      history: parsed.history ?? [],
      channelStates: parsed.channelStates ?? {},
    };
    return config;
  } catch {
    return makeDefaultConfig();
  }
}

export function saveConfig(config: AppConfig): void {
  const configPath = getConfigPath();
  try {
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), "utf8");
  } catch {}
}

export function getActiveProfile(config: AppConfig): Profile {
  return (
    config.profiles.find((p) => p.name === config.activeProfile) ??
    config.profiles[0] ??
    makeDefaultProfile()
  );
}

export function upsertProfile(config: AppConfig, profile: Profile): AppConfig {
  const idx = config.profiles.findIndex((p) => p.name === profile.name);
  const profiles =
    idx >= 0
      ? config.profiles.map((p, i) => (i === idx ? profile : p))
      : [...config.profiles, profile];
  return { ...config, profiles };
}

export function deleteProfile(config: AppConfig, name: string): AppConfig {
  if (config.profiles.length <= 1) return config; // keep at least one
  const profiles = config.profiles.filter((p) => p.name !== name);
  const activeProfile =
    config.activeProfile === name
      ? (profiles[0]?.name ?? DEFAULT_PROFILE_NAME)
      : config.activeProfile;
  return { ...config, profiles, activeProfile };
}

const MAX_HISTORY = 50;

export function addHistoryEntry(
  config: AppConfig,
  entry: HistoryEntry,
): AppConfig {
  const history = [entry, ...config.history].slice(0, MAX_HISTORY);
  return { ...config, history };
}

export function getChannelState(
  config: AppConfig,
  channelId: string,
): ChannelState | undefined {
  return config.channelStates[channelId];
}

export function setChannelState(
  config: AppConfig,
  channelId: string,
  state: ChannelState,
): AppConfig {
  return {
    ...config,
    channelStates: { ...config.channelStates, [channelId]: state },
  };
}

export function clearChannelState(
  config: AppConfig,
  channelId: string,
): AppConfig {
  const channelStates = { ...config.channelStates };
  delete channelStates[channelId];
  return { ...config, channelStates };
}
