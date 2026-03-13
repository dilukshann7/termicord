import {
  BoxRenderable,
  ScrollBoxRenderable,
  createCliRenderer,
  InputRenderable,
  InputRenderableEvents,
  LayoutEvents,
  TextRenderable,
  type KeyEvent,
} from "@opentui/core";

import {
  startDownloadTask,
  type DownloadHandle,
  type DownloadProgress,
} from "./middleware";

import {
  loadConfig,
  saveConfig,
  getActiveProfile,
  upsertProfile,
  deleteProfile,
  addHistoryEntry,
  getChannelState,
  setChannelState,
  makeDefaultProfile,
  type AppConfig,
  type Profile,
  type HistoryEntry,
} from "./config";

import fs from "fs";
import path from "path";
import os from "os";

const renderer = await createCliRenderer({ exitOnCtrlC: true });

const c = {
  lavender: "#c4b5fd",
  purple: "#a78bfa",
  violet: "#8b5cf6",
  pink: "#f0abfc",
  softPink: "#e879f9",
  dim: "#6b7280",
  dimBorder: "#374151",
  focus: "#f9a8d4",
  green: "#86efac",
  dimGreen: "#4ade80",
  yellow: "#fde047",
  red: "#f87171",
  transparent: "transparent",
};

function termW(): number {
  return renderer.terminalWidth;
}
function termH(): number {
  return renderer.terminalHeight;
}
function isWide(): boolean {
  return termW() >= 120;
}
function isBannerFit(): boolean {
  return termW() >= 84;
}
function logsHeight(): number {
  return Math.max(6, termH() - 13);
}
function configScrollHeight(): number {
  return Math.max(5, termH() - 16);
}

let appConfig: AppConfig = loadConfig();

function persistConfig() {
  saveConfig(appConfig);
}

function readActiveProfile(): Profile {
  return getActiveProfile(appConfig);
}

function writeActiveProfile(patch: Partial<Profile>) {
  const current = readActiveProfile();
  const updated: Profile = { ...current, ...patch };
  appConfig = upsertProfile(appConfig, updated);
  persistConfig();
}

const bannerLinesFull = [
  "",
  "  ████████╗███████╗██████╗ ███╗   ███╗██╗ ██████╗ ██████╗ ██████╗ ██████╗ ",
  "  ╚══██╔══╝██╔════╝██╔══██╗████╗ ████║██║██╔════╝██╔═══██╗██╔══██╗██╔══██╗",
  "     ██║   █████╗  ██████╔╝██╔████╔██║██║██║     ██║   ██║██████╔╝██║  ██║",
  "     ██║   ██╔══╝  ██╔══██╗██║╚██╔╝██║██║██║     ██║   ██║██╔══██╗██║  ██║",
  "     ██║   ███████╗██║  ██║██║ ╚═╝ ██║██║╚██████╗╚██████╔╝██║  ██║██████╔╝",
  "     ╚═╝   ╚══════╝╚═╝  ╚═╝╚═╝     ╚═╝╚═╝ ╚═════╝ ╚═════╝ ╚═╝  ╚═╝╚═════╝",
];

const bannerLinesCompact = [
  "",
  "  ╔══════════════════════════╗",
  "  ║       TERMICORD          ║",
  "  ╚══════════════════════════╝",
  "",
];

function getBannerLines(): string[] {
  return isBannerFit() ? bannerLinesFull : bannerLinesCompact;
}

const titleBanner = new TextRenderable(renderer, {
  id: "title-banner",
  content: getBannerLines()
    .map(() => "")
    .join("\n"),
  fg: c.lavender,
});

const infoPanel = new BoxRenderable(renderer, {
  id: "info-panel",
  position: "absolute",
  top: 1,
  right: 2,
  borderStyle: "double",
  borderColor: c.transparent,
  paddingLeft: 2,
  paddingRight: 2,
  paddingTop: 0,
  paddingBottom: 0,
  flexDirection: "column",
  alignItems: "center",
});
const infoPanelLine1 = new TextRenderable(renderer, {
  id: "info-line-0",
  content: "v1.0.2  ·  MIT License",
  fg: c.transparent,
});
const infoPanelLine2 = new TextRenderable(renderer, {
  id: "info-line-1",
  content: "──────────────────────",
  fg: c.transparent,
});
const infoPanelLine3 = new TextRenderable(renderer, {
  id: "info-line-2",
  content: "developed & maintained by",
  fg: c.transparent,
});
const infoPanelLine4 = new TextRenderable(renderer, {
  id: "info-line-3",
  content: " ♡  github / dilukshann7 ♡ ",
  fg: c.transparent,
});
infoPanel.add(infoPanelLine1);
infoPanel.add(infoPanelLine2);
infoPanel.add(infoPanelLine3);
infoPanel.add(infoPanelLine4);

const tabBar = new BoxRenderable(renderer, {
  id: "tab-bar",
  width: "100%" as `${number}%`,
  height: 3,
  borderStyle: "single",
  borderColor: c.dimBorder,
  paddingLeft: 1,
  paddingRight: 1,
  flexDirection: "row",
  alignItems: "center",
  justifyContent: "center",
});

const tabConfig = new TextRenderable(renderer, {
  id: "tab-config",
  content: "  [ Config ]  ",
  fg: c.lavender,
});
const tabLogs = new TextRenderable(renderer, {
  id: "tab-logs",
  content: "    Logs    ",
  fg: c.dim,
});
const tabHistory = new TextRenderable(renderer, {
  id: "tab-history",
  content: "    History ",
  fg: c.dim,
});

tabBar.add(tabConfig);
tabBar.add(tabLogs);
tabBar.add(tabHistory);

function makePanel(id: string, title: string): BoxRenderable {
  return new BoxRenderable(renderer, {
    id,
    width: "100%" as `${number}%`,
    height: 3,
    paddingLeft: 1,
    borderColor: c.violet,
    title,
  });
}
function makeInput(id: string, placeholder: string): InputRenderable {
  return new InputRenderable(renderer, {
    id,
    width: "100%" as `${number}%`,
    placeholder,
  });
}

// Row 0 — Token
const tokenPanel = makePanel("token-panel", " Discord Token ");
let realTokenValue = "";
let tokenMasked = true;
const tokenInput = makeInput("token-input", "Enter your Discord token...");
function syncTokenDisplay() {
  tokenInput.value = tokenMasked
    ? "•".repeat(realTokenValue.length)
    : realTokenValue;
}
tokenPanel.add(tokenInput);

// Row 1 — Channel ID(s)
const channelIDPanel = makePanel("channel-id-panel", " Channel ID(s) ");
const channelIDInput = makeInput(
  "channel-id-input",
  "Channel ID (or comma-separated list)...",
);
channelIDPanel.add(channelIDInput);

// Row 2 — Download location
const downloadLocationPanel = makePanel(
  "download-location-panel",
  " Download Location ",
);
const downloadLocationInput = makeInput(
  "download-location-input",
  "Download location (e.g. ./downloads)...",
);
downloadLocationPanel.add(downloadLocationInput);

// Row 3 — Skip extensions
const skipFilesInputPanel = makePanel(
  "skip-files-input-panel",
  " Extensions to Skip ",
);
const skipFilesInput = makeInput(
  "skip-files-input",
  "Extensions to skip (e.g. .jpg .png)...",
);
skipFilesInputPanel.add(skipFilesInput);

// Row 4 — Filter author
const filterAuthorPanel = makePanel(
  "filter-author-panel",
  " Filter by Author ",
);
const filterAuthorInput = makeInput(
  "filter-author-input",
  "Username or user ID (blank = all)...",
);
filterAuthorPanel.add(filterAuthorInput);

// Row 5 — Filter date from
const filterDateFromPanel = makePanel("filter-date-from-panel", " Date From ");
const filterDateFromInput = makeInput(
  "filter-date-from-input",
  "YYYY-MM-DD (blank = no limit)...",
);
filterDateFromPanel.add(filterDateFromInput);

// Row 6 — Filter date to
const filterDateToPanel = makePanel("filter-date-to-panel", " Date To ");
const filterDateToInput = makeInput(
  "filter-date-to-input",
  "YYYY-MM-DD (blank = no limit)...",
);
filterDateToPanel.add(filterDateToInput);

// Row 7 — Message limit
const messageLimitPanel = makePanel("message-limit-panel", " Message Limit ");
const messageLimitInput = makeInput(
  "message-limit-input",
  "Max messages to fetch (blank = all)...",
);
messageLimitPanel.add(messageLimitInput);

// Row 8 — Max file size
const maxFileSizePanel = makePanel(
  "max-file-size-panel",
  " Max File Size (KB) ",
);
const maxFileSizeInput = makeInput(
  "max-file-size-input",
  "Max file size in KB (blank = no limit)...",
);
maxFileSizePanel.add(maxFileSizeInput);

// Row 9 — Filename template
const filenameTemplatePanel = makePanel(
  "filename-template-panel",
  " Filename Template ",
);
const filenameTemplateInput = makeInput(
  "filename-template-input",
  "{msgid}_{filename}  (tokens: {date} {author} {index} {ext})...",
);
filenameTemplatePanel.add(filenameTemplateInput);

let checked = false;
let saveTxt = false;
let downloadEmbeds = false;
let organiseByType = false;
let deduplicateByHash = false;

const checkbox = new TextRenderable(renderer, {
  id: "checkbox",
  content: "  [ ] Create a new folder for every message",
  fg: c.dim,
});
const saveTxtCheckbox = new TextRenderable(renderer, {
  id: "save-txt-checkbox",
  content: "  [ ] Save message content as .txt file",
  fg: c.dim,
});
const downloadEmbedsCheckbox = new TextRenderable(renderer, {
  id: "embeds-checkbox",
  content: "  [ ] Download embed images",
  fg: c.dim,
});
const organiseByTypeCheckbox = new TextRenderable(renderer, {
  id: "organise-checkbox",
  content: "  [ ] Organise files by type (images/videos/...)",
  fg: c.dim,
});
const deduplicateCheckbox = new TextRenderable(renderer, {
  id: "dedup-checkbox",
  content: "  [ ] Deduplicate by content hash",
  fg: c.dim,
});

const profileBar = new BoxRenderable(renderer, {
  id: "profile-bar",
  width: "100%" as `${number}%`,
  height: 3,
  borderStyle: "single",
  borderColor: c.dimBorder,
  paddingLeft: 1,
  paddingRight: 1,
  flexDirection: "row",
  alignItems: "center",
});
const profileBarText = new TextRenderable(renderer, {
  id: "profile-bar-text",
  content: "",
  fg: c.purple,
});
profileBar.add(profileBarText);

function renderProfileBar() {
  const names = appConfig.profiles.map((p) => p.name);
  const active = appConfig.activeProfile;
  const parts = names.map((n) => (n === active ? `[ ${n} ]` : `  ${n}  `));
  profileBarText.content =
    "Profile: " +
    parts.join(" · ") +
    "  (Ctrl+N new  Ctrl+D del  Ctrl+← → switch)";
}

const downloadButton = new BoxRenderable(renderer, {
  id: "download-button",
  position: "absolute",
  bottom: 3,
  width: "100%" as `${number}%`,
  height: 3,
  borderStyle: "double",
  borderColor: c.softPink,
  paddingLeft: 1,
  paddingRight: 1,
  flexDirection: "row",
  justifyContent: "center",
  alignItems: "center",
});
const downloadButtonText = new TextRenderable(renderer, {
  id: "download-button-text",
  content: "  ♡  Start Download  ♡  ",
  fg: c.pink,
});
downloadButton.add(downloadButtonText);

const scrollbarStyle = {
  trackOptions: {
    foregroundColor: c.violet,
    backgroundColor: c.dimBorder,
  },
  showArrows: true,
  arrowOptions: {
    foregroundColor: c.purple,
    backgroundColor: c.dimBorder,
  },
};

const logsBox = new ScrollBoxRenderable(renderer, {
  id: "logs-box",
  width: "100%" as `${number}%`,
  height: logsHeight(),
  borderStyle: "single",
  borderColor: c.dimBorder,
  title: " Logs  (Ctrl+S to export) ",
  paddingLeft: 1,
  paddingRight: 1,
  stickyScroll: true,
  stickyStart: "bottom",
  scrollbarOptions: scrollbarStyle,
});
const logsText = new TextRenderable(renderer, {
  id: "logs-text",
  content: "  Waiting for download to start...",
  fg: c.dim,
});
const progressBarText = new TextRenderable(renderer, {
  id: "progress-bar",
  content: "",
  fg: c.dimGreen,
});
logsBox.add(logsText);
logsBox.add(progressBarText);

const historyBox = new ScrollBoxRenderable(renderer, {
  id: "history-box",
  width: "100%" as `${number}%`,
  height: logsHeight(),
  borderStyle: "single",
  borderColor: c.dimBorder,
  title: " Download History ",
  paddingLeft: 1,
  paddingRight: 1,
  scrollbarOptions: scrollbarStyle,
});
const historyText = new TextRenderable(renderer, {
  id: "history-text",
  content: "  No history yet.",
  fg: c.dim,
});
historyBox.add(historyText);

function renderHistory() {
  const entries = appConfig.history;
  if (entries.length === 0) {
    historyText.content = "  No history yet.";
    historyText.fg = c.dim;
    return;
  }
  const lines = entries.map((e, i) => {
    const sizeMb = (e.totalBytes / 1024 / 1024).toFixed(2);
    const elapsed = (
      (new Date(e.finishedAt).getTime() - new Date(e.startedAt).getTime()) /
      1000
    ).toFixed(1);
    const status = e.aborted ? "ABORTED" : "DONE";
    return [
      `  ─── Run ${entries.length - i} [${status}] ───`,
      `  Channel  : ${e.channelId}`,
      `  Output   : ${e.outputDir}`,
      `  Started  : ${e.startedAt.replace("T", " ").slice(0, 19)}`,
      `  Files    : ${e.filesDownloaded} downloaded, ${e.skippedFiles} skipped, ${e.failedFiles} failed`,
      `  Size     : ${sizeMb} MB  |  Elapsed: ${elapsed}s`,
      "",
    ].join("\n");
  });
  historyText.content = lines.join("");
  historyText.fg = c.lavender;
}

const hintBar = new BoxRenderable(renderer, {
  id: "hint-bar",
  position: "absolute",
  bottom: 0,
  width: "100%" as `${number}%`,
  height: 3,
  borderStyle: "single",
  borderColor: c.dimBorder,
  paddingLeft: 2,
  paddingRight: 2,
  flexDirection: "row",
  justifyContent: "center",
  alignItems: "center",
});

const hintFull =
  "Ctrl+Q/E/R · tabs  |  Tab · next field  |  Shift+Tab · prev  |  Space · toggle  |  Enter · download  |  Esc · abort/config  |  Ctrl+C · exit";
const hintCompact =
  "C-Q/E/R tabs | Tab/S-Tab nav | Space toggle | Enter go | Esc abort | C-C quit";
const hint = new TextRenderable(renderer, {
  id: "hint",
  content: termW() >= 120 ? hintFull : hintCompact,
  fg: c.dim,
});
hintBar.add(hint);

const confirmOverlay = new BoxRenderable(renderer, {
  id: "confirm-overlay",
  position: "absolute",
  top: 5,
  width: "80%" as `${number}%`,
  borderStyle: "double",
  borderColor: c.yellow,
  paddingLeft: 2,
  paddingRight: 2,
  paddingTop: 1,
  paddingBottom: 1,
  flexDirection: "column",
  alignItems: "flex-start",
  visible: false,
});
const confirmText = new TextRenderable(renderer, {
  id: "confirm-text",
  content: "",
  fg: c.yellow,
});
const confirmHint = new TextRenderable(renderer, {
  id: "confirm-hint",
  content: "\n  Press Y to confirm  |  N / Esc to cancel",
  fg: c.dim,
});
confirmOverlay.add(confirmText);
confirmOverlay.add(confirmHint);

let pendingDownloadParams: (() => void) | null = null;

function showConfirm(summary: string, onConfirm: () => void) {
  confirmText.content = summary;
  pendingDownloadParams = onConfirm;
  confirmOverlay.visible = true;
}

function hideConfirm() {
  confirmOverlay.visible = false;
  pendingDownloadParams = null;
}

const summaryOverlay = new BoxRenderable(renderer, {
  id: "summary-overlay",
  position: "absolute",
  top: 5,
  width: "80%" as `${number}%`,
  borderStyle: "double",
  borderColor: c.green,
  paddingLeft: 2,
  paddingRight: 2,
  paddingTop: 1,
  paddingBottom: 1,
  flexDirection: "column",
  alignItems: "flex-start",
  visible: false,
});
const summaryText = new TextRenderable(renderer, {
  id: "summary-text",
  content: "",
  fg: c.green,
});
const summaryHint = new TextRenderable(renderer, {
  id: "summary-hint",
  content: "\n  Press any key to dismiss",
  fg: c.dim,
});
summaryOverlay.add(summaryText);
summaryOverlay.add(summaryHint);

let summaryVisible = false;

function showSummary(evt: DownloadProgress, elapsedMs: number) {
  const sizeMb = ((evt.totalBytes ?? 0) / 1024 / 1024).toFixed(2);
  const elapsed = (elapsedMs / 1000).toFixed(1);
  summaryText.content = [
    "  ── Download Complete ──",
    `  Files downloaded : ${evt.filesDownloaded ?? 0}`,
    `  Files skipped    : ${evt.skippedFiles ?? 0}`,
    `  Files failed     : ${evt.failedFiles ?? 0}`,
    `  Total size       : ${sizeMb} MB`,
    `  Elapsed          : ${elapsed}s`,
    `  Output           : ${evt.outputDir ?? ""}`,
  ].join("\n");
  summaryVisible = true;
  summaryOverlay.visible = true;
}

function hideSummary() {
  summaryVisible = false;
  summaryOverlay.visible = false;
}

const configScrollBox = new ScrollBoxRenderable(renderer, {
  id: "config-scroll-box",
  width: "100%" as `${number}%`,
  height: configScrollHeight(),
  scrollbarOptions: scrollbarStyle,
});

type Tab = "config" | "logs" | "history";
let activeTab: Tab = "config";

const configChildren = [
  profileBar,
  tokenPanel,
  channelIDPanel,
  downloadLocationPanel,
  skipFilesInputPanel,
  filterAuthorPanel,
  filterDateFromPanel,
  filterDateToPanel,
  messageLimitPanel,
  maxFileSizePanel,
  filenameTemplatePanel,
  checkbox,
  saveTxtCheckbox,
  downloadEmbedsCheckbox,
  organiseByTypeCheckbox,
  deduplicateCheckbox,
];

function showTab(tab: Tab) {
  if (activeTab === tab) return;
  activeTab = tab;

  tabConfig.fg = tab === "config" ? c.lavender : c.dim;
  tabLogs.fg = tab === "logs" ? c.lavender : c.dim;
  tabHistory.fg = tab === "history" ? c.lavender : c.dim;

  tabConfig.content = tab === "config" ? "  [ Config ]  " : "    Config    ";
  tabLogs.content = tab === "logs" ? "  [ Logs ]  " : "    Logs    ";
  tabHistory.content = tab === "history" ? "  [ History ]  " : "    History ";

  if (tab === "config") {
    logsBox.visible = false;
    historyBox.visible = false;
    configScrollBox.visible = true;
    downloadButton.visible = true;
    focusAt(0);
  } else if (tab === "logs") {
    configScrollBox.visible = false;
    downloadButton.visible = false;
    inputs.forEach((inp) => inp.blur());
    logsBox.visible = true;
    historyBox.visible = false;
    logsBox.focus();
  } else {
    configScrollBox.visible = false;
    downloadButton.visible = false;
    inputs.forEach((inp) => inp.blur());
    logsBox.visible = false;
    historyBox.visible = true;
    renderHistory();
    historyBox.focus();
  }
}

const TOTAL_FIELDS = 15;

const inputPanels = [
  tokenPanel, // 0
  channelIDPanel, // 1
  downloadLocationPanel, // 2
  skipFilesInputPanel, // 3
  filterAuthorPanel, // 4
  filterDateFromPanel, // 5
  filterDateToPanel, // 6
  messageLimitPanel, // 7
  maxFileSizePanel, // 8
  filenameTemplatePanel, // 9
];
const inputs = [
  tokenInput, // 0
  channelIDInput, // 1
  downloadLocationInput, // 2
  skipFilesInput, // 3
  filterAuthorInput, // 4
  filterDateFromInput, // 5
  filterDateToInput, // 6
  messageLimitInput, // 7
  maxFileSizeInput, // 8
  filenameTemplateInput, // 9
];
const checkboxRenderables = [
  checkbox, // 10
  saveTxtCheckbox, // 11
  downloadEmbedsCheckbox, // 12
  organiseByTypeCheckbox, // 13
  deduplicateCheckbox, // 14
];

let focusedIndex = 0;
let animationDone = false;

function updateFocusStyles() {
  inputPanels.forEach((panel, i) => {
    panel.borderColor = focusedIndex === i ? c.focus : c.violet;
  });
  checkboxRenderables.forEach((cb, i) => {
    cb.fg = focusedIndex === 10 + i ? c.focus : c.dim;
  });
}

function focusAt(index: number) {
  focusedIndex = ((index % TOTAL_FIELDS) + TOTAL_FIELDS) % TOTAL_FIELDS;
  inputs.forEach((inp) => inp.blur());
  if (focusedIndex < inputs.length) {
    inputs[focusedIndex]!.focus();
  }
  updateFocusStyles();
  const ROW = 3;
  let targetY: number;
  if (focusedIndex < inputPanels.length) {
    targetY = (focusedIndex + 1) * ROW;
  } else {
    const cbIdx = focusedIndex - inputPanels.length;
    targetY = (inputPanels.length + 1) * ROW + cbIdx;
  }
  configScrollBox.scrollTo(Math.max(0, targetY - ROW));
}

function loadProfileIntoUI() {
  const p = readActiveProfile();
  realTokenValue = p.token;
  syncTokenDisplay();
  channelIDInput.value = p.channelIds;
  downloadLocationInput.value = p.outputDir;
  skipFilesInput.value = p.skipExtensions;
  filterAuthorInput.value = p.filterAuthor;
  filterDateFromInput.value = p.filterDateFrom;
  filterDateToInput.value = p.filterDateTo;
  messageLimitInput.value = p.messageLimit;
  maxFileSizeInput.value = p.maxFileSizeKb;
  filenameTemplateInput.value = p.filenameTemplate;
  checked = p.foldersPerMessage;
  saveTxt = p.saveTxt;
  downloadEmbeds = p.downloadEmbeds;
  organiseByType = p.organiseByType;
  deduplicateByHash = p.deduplicateByHash;
  syncCheckboxes();
  renderProfileBar();
}

function syncCheckboxes() {
  checkbox.content = `  [${checked ? "♡" : " "}] Create a new folder for every message`;
  saveTxtCheckbox.content = `  [${saveTxt ? "♡" : " "}] Save message content as .txt file`;
  downloadEmbedsCheckbox.content = `  [${downloadEmbeds ? "♡" : " "}] Download embed images`;
  organiseByTypeCheckbox.content = `  [${organiseByType ? "♡" : " "}] Organise files by type (images/videos/...)`;
  deduplicateCheckbox.content = `  [${deduplicateByHash ? "♡" : " "}] Deduplicate by content hash`;
}

function saveUIToProfile() {
  writeActiveProfile({
    token: realTokenValue,
    channelIds: channelIDInput.value ?? "",
    outputDir: downloadLocationInput.value || "./downloads",
    skipExtensions: skipFilesInput.value ?? "",
    filterAuthor: filterAuthorInput.value ?? "",
    filterDateFrom: filterDateFromInput.value ?? "",
    filterDateTo: filterDateToInput.value ?? "",
    messageLimit: messageLimitInput.value ?? "",
    maxFileSizeKb: maxFileSizeInput.value ?? "",
    filenameTemplate: filenameTemplateInput.value ?? "{msgid}_{filename}",
    foldersPerMessage: checked,
    saveTxt,
    downloadEmbeds,
    organiseByType,
    deduplicateByHash,
  });
}

const logLines: string[] = [];
let runCount = 0;

function addLog(line: string) {
  const now = new Date();
  const ts = `${now.getHours().toString().padStart(2, "0")}:${now.getMinutes().toString().padStart(2, "0")}:${now.getSeconds().toString().padStart(2, "0")}`;
  logLines.push(`  [${ts}] ${line}`);
  logsText.content = logLines.join("\n");
  logsText.fg = c.green;
}

function updateProgressBar(downloaded: number, total: number) {
  if (total === 0) {
    progressBarText.content = "";
    return;
  }
  const pct = Math.min(100, Math.round((downloaded / total) * 100));
  const barWidth = Math.max(10, Math.min(50, termW() - 30));
  const filled = Math.round((pct / 100) * barWidth);
  const empty = barWidth - filled;
  const bar = "█".repeat(filled) + "░".repeat(empty);
  progressBarText.content = `\n  [${bar}] ${pct}%  (${downloaded}/${total} files)`;
  progressBarText.fg = pct === 100 ? c.green : c.dimGreen;
}

function exportLog() {
  const location = downloadLocationInput.value || "./downloads";
  try {
    fs.mkdirSync(location, { recursive: true });
    const now = new Date();
    const stamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}_${String(now.getHours()).padStart(2, "0")}${String(now.getMinutes()).padStart(2, "0")}${String(now.getSeconds()).padStart(2, "0")}`;
    const logPath = path.join(location, `termicord_${stamp}.log`);
    fs.writeFileSync(logPath, logLines.join("\n"), "utf8");
    addLog(`📄 Log exported to: ${logPath}`);
  } catch (err) {
    addLog(`✗ Failed to export log: ${(err as Error).message}`);
  }
}

let activeDownload: DownloadHandle | null = null;
let isDownloading = false;
let _runStartTime = 0;
let _currentFilesTotal = 0;
let _currentDownloaded = 0;
let _currentChannelId = "";

function setDownloading(active: boolean) {
  isDownloading = active;
  if (active) {
    downloadButtonText.content = "  ♡  Downloading…  ♡  ";
    downloadButtonText.fg = c.dimGreen;
    downloadButton.borderColor = c.dimGreen;
  } else {
    downloadButtonText.content = "  ♡  Start Download  ♡  ";
    downloadButtonText.fg = c.pink;
    downloadButton.borderColor = c.softPink;
    updateProgressBar(0, 0);
  }
}

function validateFields(
  token: string,
  channel: string,
  location: string,
  skip: string,
  dateFrom: string,
  dateTo: string,
): string | null {
  if (!token) return "✗ Discord token is required.";
  if (!channel) return "✗ Channel ID is required.";

  const ids = channel
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  for (const id of ids) {
    if (!/^\d{17,20}$/.test(id))
      return `✗ Channel ID "${id}" must be a 17–20 digit numeric snowflake.`;
  }

  if (location.trim() && /[<>|"?*]/.test(location))
    return "✗ Download location contains invalid characters.";
  if (/\*[^.\s]/.test(skip))
    return "✗ Extensions to Skip: use plain extensions (e.g. .jpg), not glob patterns.";

  const dateRx = /^\d{4}-\d{2}-\d{2}$/;
  if (dateFrom && !dateRx.test(dateFrom))
    return "✗ Date From must be YYYY-MM-DD format.";
  if (dateTo && !dateRx.test(dateTo))
    return "✗ Date To must be YYYY-MM-DD format.";
  if (dateFrom && dateTo && dateFrom > dateTo)
    return "✗ Date From must be before Date To.";

  return null;
}

function startDownload() {
  if (isDownloading) {
    addLog("⚠ Download already in progress.");
    showTab("logs");
    return;
  }

  const token = realTokenValue;
  const channel = channelIDInput.value ?? "";
  const location = downloadLocationInput.value || "./downloads";
  const skip = skipFilesInput.value ?? "";
  const dateFrom = filterDateFromInput.value ?? "";
  const dateTo = filterDateToInput.value ?? "";
  const author = filterAuthorInput.value ?? "";
  const limit = messageLimitInput.value ?? "";
  const maxSize = maxFileSizeInput.value ?? "";
  const tmpl = filenameTemplateInput.value || "{msgid}_{filename}";

  const validationError = validateFields(
    token,
    channel,
    location,
    skip,
    dateFrom,
    dateTo,
  );
  if (validationError) {
    addLog(validationError);
    showTab("logs");
    return;
  }

  saveUIToProfile();

  const ids = channel
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const summary = [
    "  Ready to download:",
    `  Channel(s)   : ${ids.join(", ")}`,
    `  Output dir   : ${location}`,
    `  Skip ext     : ${skip || "(none)"}`,
    `  Author filter: ${author || "(none)"}`,
    `  Date range   : ${dateFrom || "∞"} → ${dateTo || "∞"}`,
    `  Msg limit    : ${limit || "unlimited"}`,
    `  Max size     : ${maxSize ? maxSize + " KB" : "unlimited"}`,
    `  Embeds       : ${downloadEmbeds ? "yes" : "no"}  |  Organise: ${organiseByType ? "yes" : "no"}  |  Dedup: ${deduplicateByHash ? "yes" : "no"}`,
  ].join("\n");

  showConfirm(summary, () => {
    executeDownload(
      token,
      channel,
      location,
      skip,
      dateFrom,
      dateTo,
      author,
      limit,
      maxSize,
      tmpl,
    );
  });
}

function executeDownload(
  token: string,
  channel: string,
  location: string,
  skip: string,
  dateFrom: string,
  dateTo: string,
  author: string,
  limit: string,
  maxSize: string,
  tmpl: string,
) {
  runCount++;
  if (runCount > 1) {
    logLines.push("");
    logLines.push(`  ══════════════ Run #${runCount} ══════════════`);
    logLines.push("");
  }

  const ids = channel
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  addLog("♡ Starting download...");
  addLog(
    `  Token    : ${token.slice(0, 8)}${"*".repeat(Math.max(0, token.length - 8))}`,
  );
  addLog(`  Channel(s): ${ids.join(", ")}`);
  addLog(`  Location : ${location}`);
  addLog(`  Skip ext : ${skip || "(none)"}`);
  addLog(`  Folders  : ${checked ? "yes (one per message)" : "no"}`);
  addLog(`  Save .txt: ${saveTxt ? "yes" : "no"}`);
  if (author) addLog(`  Author   : ${author}`);
  if (dateFrom || dateTo)
    addLog(`  Dates    : ${dateFrom || "∞"} → ${dateTo || "∞"}`);
  if (limit) addLog(`  Limit    : ${limit} messages`);
  if (maxSize) addLog(`  Max size : ${maxSize} KB`);
  addLog("──────────────────────────────────────────────");

  _currentFilesTotal = 0;
  _currentDownloaded = 0;
  _currentChannelId = ids[0] ?? "";
  _runStartTime = Date.now();

  const firstChannelState = getChannelState(appConfig, _currentChannelId);
  const resumeAfterMessageId = firstChannelState?.lastMessageId ?? "";

  const startedAt = new Date().toISOString();
  let _lastEvt: DownloadProgress | null = null;

  showTab("logs");
  setDownloading(true);

  activeDownload = startDownloadTask(
    {
      token,
      channelId: channel,
      outputDir: location,
      skipExtensions: skip,
      foldersPerMessage: checked,
      saveTxt,
      filterAuthor: author,
      filterDateFrom: dateFrom,
      filterDateTo: dateTo,
      messageLimit: limit,
      maxFileSizeKb: maxSize,
      downloadEmbeds,
      organiseByType,
      deduplicateByHash,
      filenameTemplate: tmpl,
      resumeAfterMessageId,
    },
    (line: string, evt: DownloadProgress) => {
      addLog(line);
      _lastEvt = evt;
      if (evt.filesTotal !== undefined) _currentFilesTotal = evt.filesTotal;
      if (evt.filesDownloaded !== undefined) {
        _currentDownloaded = evt.filesDownloaded;
        updateProgressBar(_currentDownloaded, _currentFilesTotal);
      }
    },
  );

  activeDownload.done.then(() => {
    const elapsedMs = Date.now() - _runStartTime;
    setDownloading(false);

    const wasAborted = activeDownload?.aborted ?? false;
    activeDownload = null;

    if (_currentChannelId && _lastEvt) {
      appConfig = setChannelState(appConfig, _currentChannelId, {
        lastMessageId: "",
        lastRunAt: new Date().toISOString(),
      });
    }

    const histEntry: HistoryEntry = {
      runId: Date.now().toString(),
      channelId: _currentChannelId,
      outputDir: path.resolve(location),
      startedAt,
      finishedAt: new Date().toISOString(),
      filesDownloaded: _lastEvt?.filesDownloaded ?? 0,
      filesTotal: _lastEvt?.filesTotal ?? 0,
      failedFiles: _lastEvt?.failedFiles ?? 0,
      skippedFiles: _lastEvt?.skippedFiles ?? 0,
      totalBytes: _lastEvt?.totalBytes ?? 0,
      aborted: wasAborted,
    };
    appConfig = addHistoryEntry(appConfig, histEntry);
    persistConfig();

    if (!wasAborted && _lastEvt) {
      showSummary(_lastEvt, elapsedMs);
    }
  });
}

function abortDownload() {
  if (activeDownload && isDownloading) {
    activeDownload.abort();
    addLog("⊘ Download aborted by user.");
    setDownloading(false);
    activeDownload = null;
  }
}

function switchProfile(dir: 1 | -1) {
  const idx = appConfig.profiles.findIndex(
    (p) => p.name === appConfig.activeProfile,
  );
  const next =
    (idx + dir + appConfig.profiles.length) % appConfig.profiles.length;
  appConfig.activeProfile = appConfig.profiles[next]!.name;
  persistConfig();
  loadProfileIntoUI();
}

function newProfile() {
  const name = `profile${appConfig.profiles.length + 1}`;
  const p = makeDefaultProfile(name);
  appConfig = upsertProfile(appConfig, p);
  appConfig.activeProfile = name;
  persistConfig();
  loadProfileIntoUI();
  addLog(`✓ Created new profile: ${name}`);
}

function deleteCurrentProfile() {
  if (appConfig.profiles.length <= 1) {
    addLog("⚠ Cannot delete the last profile.");
    return;
  }
  const name = appConfig.activeProfile;
  appConfig = deleteProfile(appConfig, name);
  persistConfig();
  loadProfileIntoUI();
  addLog(`✓ Deleted profile: ${name}`);
}

function handleResize() {
  if (animationDone) {
    titleBanner.content = getBannerLines().join("\n");
    infoPanel.visible = isWide();
  }
  logsBox.height = logsHeight();
  historyBox.height = logsHeight();
  configScrollBox.height = configScrollHeight();
  hint.content = termW() >= 120 ? hintFull : hintCompact;
}

renderer.root.on(LayoutEvents.RESIZED, handleResize);

renderer.keyInput.on("keypress", (key: KeyEvent) => {
  if (!animationDone) return;

  if (summaryVisible) {
    hideSummary();
    return;
  }

  if (confirmOverlay.visible) {
    if (key.name === "y" || key.name === "Y") {
      hideConfirm();
      pendingDownloadParams?.();
    } else if (key.name === "n" || key.name === "N" || key.name === "escape") {
      hideConfirm();
      addLog("Download cancelled by user.");
      showTab("logs");
    }
    return;
  }

  const anyInputFocused =
    focusedIndex < inputs.length && activeTab === "config";

  if (focusedIndex === 0 && activeTab === "config") {
    if (key.name === "tab") {
    } else if (key.ctrl || key.name === "escape" || key.name === "return") {
    } else if (key.name === "backspace") {
      realTokenValue = realTokenValue.slice(0, -1);
      syncTokenDisplay();
      saveUIToProfile();
      return;
    } else if (key.name === "delete") {
      realTokenValue = "";
      syncTokenDisplay();
      saveUIToProfile();
      return;
    } else if (
      key.sequence &&
      key.sequence.length === 1 &&
      !key.ctrl &&
      !key.meta
    ) {
      realTokenValue += key.sequence;
      syncTokenDisplay();
      saveUIToProfile();
      return;
    }
  }

  if (!anyInputFocused || key.ctrl) {
    if (key.ctrl && (key.name === "q" || key.name === "Q")) {
      showTab("config");
      return;
    }
    if (key.ctrl && (key.name === "e" || key.name === "E")) {
      showTab("logs");
      return;
    }
    if (key.ctrl && (key.name === "r" || key.name === "R")) {
      showTab("history");
      return;
    }

    if (!anyInputFocused) {
      if (key.name === "q" || key.name === "Q") {
        showTab("config");
        return;
      }
      if (key.name === "e" || key.name === "E") {
        showTab("logs");
        return;
      }
      if (key.name === "r" || key.name === "R") {
        showTab("history");
        return;
      }
    }
  }

  if (key.ctrl && (key.name === "s" || key.name === "S")) {
    if (activeTab === "logs") {
      exportLog();
      return;
    }
  }

  if (key.name === "escape") {
    if (isDownloading) {
      abortDownload();
    } else {
      showTab("config");
    }
    return;
  }

  if (key.ctrl && key.name === "n") {
    newProfile();
    return;
  }
  if (key.ctrl && key.name === "d") {
    deleteCurrentProfile();
    return;
  }
  if (key.ctrl && key.name === "left") {
    switchProfile(-1);
    return;
  }
  if (key.ctrl && key.name === "right") {
    switchProfile(1);
    return;
  }

  if (activeTab === "config") {
    if (key.name === "tab") {
      key.stopPropagation();

      if (focusedIndex === 0 && !key.shift) {
        tokenMasked = true;
        syncTokenDisplay();
      }
      if (focusedIndex === 1 && key.shift) {
        tokenMasked = true;
        syncTokenDisplay();
      }

      focusAt(key.shift ? focusedIndex - 1 : focusedIndex + 1);

      saveUIToProfile();
      return;
    }

    if (
      focusedIndex === 0 &&
      key.ctrl &&
      (key.name === "h" || key.name === "t")
    ) {
      tokenMasked = !tokenMasked;
      syncTokenDisplay();
      return;
    }

    if (key.name === "space") {
      const cbIndex = focusedIndex - 10;
      if (cbIndex === 0) {
        checked = !checked;
      } else if (cbIndex === 1) {
        saveTxt = !saveTxt;
      } else if (cbIndex === 2) {
        downloadEmbeds = !downloadEmbeds;
      } else if (cbIndex === 3) {
        organiseByType = !organiseByType;
      } else if (cbIndex === 4) {
        deduplicateByHash = !deduplicateByHash;
      }
      syncCheckboxes();
      saveUIToProfile();
    }

    if (key.name === "return" && focusedIndex >= 10) {
      startDownload();
    }

    if (
      focusedIndex > 0 &&
      focusedIndex < inputs.length &&
      key.sequence &&
      key.sequence.length >= 1 &&
      !key.ctrl &&
      !key.meta
    ) {
      setTimeout(saveUIToProfile, 50);
    }
  }
});

const onFieldEnter = () => startDownload();
inputs.forEach((inp) => inp.on(InputRenderableEvents.ENTER, onFieldEnter));

downloadButton.onMouseDown = () => {
  if (isDownloading) {
    abortDownload();
  } else {
    startDownload();
  }
};

renderer.root.add(titleBanner);

function animateBanner(onComplete: () => void) {
  const lines = getBannerLines();
  const revealedLines: string[] = lines.map(() => "");
  lines.forEach((line, i) => {
    setTimeout(() => {
      revealedLines[i] = line;
      titleBanner.content = revealedLines.join("\n");
      if (i === lines.length - 1) onComplete();
    }, i * 55);
  });
}

animateBanner(() => {
  if (isWide()) {
    infoPanel.borderColor = c.purple;
    infoPanelLine1.fg = c.transparent;
    infoPanelLine2.fg = c.transparent;
    infoPanelLine3.fg = c.transparent;
    infoPanelLine4.fg = c.transparent;
    renderer.root.add(infoPanel);
    const id = 80;
    setTimeout(() => {
      infoPanelLine1.fg = c.lavender;
    }, id * 1);
    setTimeout(() => {
      infoPanelLine2.fg = c.violet;
    }, id * 2);
    setTimeout(() => {
      infoPanelLine3.fg = c.purple;
    }, id * 3);
    setTimeout(() => {
      infoPanelLine4.fg = c.pink;
    }, id * 4);
  } else {
    infoPanel.visible = false;
    renderer.root.add(infoPanel);
  }

  tabBar.visible = false;
  configScrollBox.visible = false;
  logsBox.visible = false;
  historyBox.visible = false;
  downloadButton.visible = false;
  hintBar.visible = false;
  confirmOverlay.visible = false;
  summaryOverlay.visible = false;

  configChildren.forEach((child) => {
    child.visible = false;
    configScrollBox.add(child);
  });

  renderer.root.add(tabBar);
  renderer.root.add(configScrollBox);
  renderer.root.add(logsBox);
  renderer.root.add(historyBox);
  renderer.root.add(downloadButton);
  renderer.root.add(hintBar);
  renderer.root.add(confirmOverlay);
  renderer.root.add(summaryOverlay);

  loadProfileIntoUI();

  const pd = 120;
  setTimeout(() => {
    tabBar.visible = true;
  }, pd * 1);
  setTimeout(() => {
    configScrollBox.visible = true;
  }, pd * 2);
  setTimeout(() => {
    profileBar.visible = true;
  }, pd * 2);
  setTimeout(() => {
    tokenPanel.visible = true;
  }, pd * 3);
  setTimeout(() => {
    channelIDPanel.visible = true;
  }, pd * 4);
  setTimeout(() => {
    downloadLocationPanel.visible = true;
  }, pd * 5);
  setTimeout(() => {
    skipFilesInputPanel.visible = true;
  }, pd * 6);
  setTimeout(() => {
    filterAuthorPanel.visible = true;
  }, pd * 7);
  setTimeout(() => {
    filterDateFromPanel.visible = true;
  }, pd * 8);
  setTimeout(() => {
    filterDateToPanel.visible = true;
  }, pd * 9);
  setTimeout(() => {
    messageLimitPanel.visible = true;
  }, pd * 10);
  setTimeout(() => {
    maxFileSizePanel.visible = true;
  }, pd * 11);
  setTimeout(() => {
    filenameTemplatePanel.visible = true;
  }, pd * 12);
  setTimeout(() => {
    checkbox.visible = true;
  }, pd * 13);
  setTimeout(
    () => {
      saveTxtCheckbox.visible = true;
    },
    pd * 13 + 60,
  );
  setTimeout(
    () => {
      downloadEmbedsCheckbox.visible = true;
    },
    pd * 13 + 120,
  );
  setTimeout(
    () => {
      organiseByTypeCheckbox.visible = true;
    },
    pd * 13 + 180,
  );
  setTimeout(
    () => {
      deduplicateCheckbox.visible = true;
    },
    pd * 13 + 240,
  );
  setTimeout(
    () => {
      downloadButton.visible = true;
    },
    pd * 13 + 300,
  );
  setTimeout(
    () => {
      hintBar.visible = true;
    },
    pd * 13 + 380,
  );
  setTimeout(
    () => {
      animationDone = true;
      focusAt(0);
      handleResize();
    },
    pd * 13 + 480,
  );
});
