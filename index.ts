import {
  BoxRenderable,
  createCliRenderer,
  InputRenderable,
  InputRenderableEvents,
  LayoutEvents,
  TextRenderable,
  type KeyEvent,
} from "@opentui/core";

import { startDownloadTask, type DownloadHandle } from "./middleware";

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
  return Math.max(6, termH() - 18);
}

const bannerLinesFull = [
  "",
  "    ██████╗    ██████╗      ██████╗ ██╗███████╗ ██████╗ ██████╗ ██████╗ ██████╗ ",
  "   ███████████████████╗     ██╔══██╗██║██╔════╝██╔════╝██╔═══██╗██╔══██╗██╔══██╗",
  "  █████████████████████╗    ██║  ██║██║███████╗██║     ██║   ██║██████╔╝██║  ██║",
  "  ████╗   ██████╗   ███║    ██║  ██║██║╚════██║██║     ██║   ██║██╔══██╗██║  ██║",
  "  ╚███████████████████╔╝    ██████╔╝██║███████║╚██████╗╚██████╔╝██║  ██║██████╔╝",
  "   ╚═███████████████╔═╝     ╚═════╝ ╚═╝╚══════╝ ╚═════╝ ╚═════╝ ╚═╝  ╚═╝╚═════╝ ",
];

const bannerLinesCompact = [
  "",
  "  ╔══════════════════════════╗",
  "  ║   DISCORD  DOWNLOADER   ║",
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
  content: "v1.0.0  ·  MIT License",
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

tabBar.add(tabConfig);
tabBar.add(tabLogs);

const tokenPanel = new BoxRenderable(renderer, {
  id: "token-panel",
  width: "100%" as `${number}%`,
  height: 3,
  paddingLeft: 1,
  borderColor: c.violet,
  title: " ♡ Discord Token ",
});
const channelIDPanel = new BoxRenderable(renderer, {
  id: "channel-id-panel",
  width: "100%" as `${number}%`,
  height: 3,
  paddingLeft: 1,
  borderColor: c.violet,
  title: " ♡ Channel ID ",
});
const downloadLocationPanel = new BoxRenderable(renderer, {
  id: "download-location-panel",
  width: "100%" as `${number}%`,
  height: 3,
  paddingLeft: 1,
  borderColor: c.violet,
  title: " ♡ Download Location ",
});
const skipFilesInputPanel = new BoxRenderable(renderer, {
  id: "skip-files-input-panel",
  width: "100%" as `${number}%`,
  height: 3,
  paddingLeft: 1,
  borderColor: c.violet,
  title: " ♡ Extensions to Skip ",
});

const tokenInput = new InputRenderable(renderer, {
  id: "token-input",
  width: "100%" as `${number}%`,
  placeholder: "Enter your Discord token...",
});
const channelIDInput = new InputRenderable(renderer, {
  id: "channel-id-input",
  width: "100%" as `${number}%`,
  placeholder: "Enter channel ID...",
});
const downloadLocationInput = new InputRenderable(renderer, {
  id: "download-location-input",
  width: "100%" as `${number}%`,
  placeholder: "Enter download location (e.g. ./downloads)...",
});
const skipFilesInput = new InputRenderable(renderer, {
  id: "skip-files-input",
  width: "100%" as `${number}%`,
  placeholder: "Enter file extensions to skip (e.g. .jpg .png)...",
});

tokenPanel.add(tokenInput);
channelIDPanel.add(channelIDInput);
downloadLocationPanel.add(downloadLocationInput);
skipFilesInputPanel.add(skipFilesInput);

let checked = false;

const checkbox = new TextRenderable(renderer, {
  id: "checkbox",
  content: "  [ ] Create a new folder for every message",
  fg: c.dim,
});

const downloadButton = new BoxRenderable(renderer, {
  id: "download-button",
  position: "absolute",
  bottom: 3, // sits directly on top of the hint bar
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

const logsBox = new BoxRenderable(renderer, {
  id: "logs-box",
  width: "100%" as `${number}%`,
  height: logsHeight(),
  borderStyle: "single",
  borderColor: c.dimBorder,
  title: " ♡ Logs ",
  paddingLeft: 1,
  paddingRight: 1,
  flexDirection: "column",
  overflow: "scroll",
});

const logsText = new TextRenderable(renderer, {
  id: "logs-text",
  content: "  Waiting for download to start...",
  fg: c.dim,
});

logsBox.add(logsText);

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
  "Q/E · switch tabs  |  Tab · next field  |  Shift+Tab · prev  |  Space · toggle  |  Enter · download  |  Ctrl+C · exit";
const hintCompact =
  "Q/E tabs | Tab/S-Tab fields | Space toggle | Enter go | ^C quit";

const hint = new TextRenderable(renderer, {
  id: "hint",
  content: termW() >= 120 ? hintFull : hintCompact,
  fg: c.dim,
});

hintBar.add(hint);

type Tab = "config" | "logs";
let activeTab: Tab = "config";

const configChildren = [
  tokenPanel,
  channelIDPanel,
  downloadLocationPanel,
  skipFilesInputPanel,
  checkbox,
];

function showTab(tab: Tab) {
  if (activeTab === tab) return;
  activeTab = tab;

  tabConfig.fg = tab === "config" ? c.lavender : c.dim;
  tabLogs.fg = tab === "logs" ? c.lavender : c.dim;
  tabConfig.content = tab === "config" ? "  [ Config ]  " : "    Config    ";
  tabLogs.content = tab === "logs" ? "  [ Logs ]  " : "    Logs    ";

  if (tab === "config") {
    logsBox.visible = false;
    configChildren.forEach((child) => {
      child.visible = true;
    });
    downloadButton.visible = true;
    focusAt(0);
  } else {
    configChildren.forEach((child) => {
      child.visible = false;
    });
    downloadButton.visible = false;
    inputs.forEach((inp) => inp.blur());
    logsBox.visible = true;
  }
}

// 0-3 = inputs, 4 = checkbox
const TOTAL_FIELDS = 5;
const inputPanels = [
  tokenPanel,
  channelIDPanel,
  downloadLocationPanel,
  skipFilesInputPanel,
];
const inputs = [
  tokenInput,
  channelIDInput,
  downloadLocationInput,
  skipFilesInput,
];

let focusedIndex = 0;
let animationDone = false;

function updateFocusStyles() {
  inputPanels.forEach((panel, i) => {
    panel.borderColor = focusedIndex === i ? c.focus : c.violet;
  });
  checkbox.fg = focusedIndex === 4 ? c.focus : c.dim;
}

function focusAt(index: number) {
  focusedIndex = ((index % TOTAL_FIELDS) + TOTAL_FIELDS) % TOTAL_FIELDS;
  if (focusedIndex < 4) {
    inputs.forEach((inp) => inp.blur());
    (inputs[focusedIndex] as InputRenderable).focus();
  } else {
    inputs.forEach((inp) => inp.blur());
  }
  updateFocusStyles();
}

const logLines: string[] = [];

function addLog(line: string) {
  const now = new Date();
  const ts = `${now.getHours().toString().padStart(2, "0")}:${now.getMinutes().toString().padStart(2, "0")}:${now.getSeconds().toString().padStart(2, "0")}`;
  logLines.push(`  [${ts}] ${line}`);
  logsText.content = logLines.join("\n");
  logsText.fg = c.green;
}

let activeDownload: DownloadHandle | null = null;
let isDownloading = false;

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
  }
}

function startDownload() {
  if (isDownloading) {
    addLog("⚠ Download already in progress.");
    showTab("logs");
    return;
  }

  const token = (tokenInput as any).value ?? "";
  const channel = (channelIDInput as any).value ?? "";
  const location = (downloadLocationInput as any).value || "./downloads";
  const skip = (skipFilesInput as any).value ?? "";

  if (!token || !channel) {
    addLog("✗ Missing required fields (token and channel ID).");
    showTab("logs");
    return;
  }

  addLog(`♡ Starting download...`);
  addLog(
    `  Token    : ${token.slice(0, 8)}${"*".repeat(Math.max(0, token.length - 8))}`,
  );
  addLog(`  Channel  : ${channel}`);
  addLog(`  Location : ${location}`);
  addLog(`  Skip ext : ${skip || "(none)"}`);
  addLog(`  Folders  : ${checked ? "yes (one per message)" : "no"}`);
  addLog(`──────────────────────────────────────────────`);

  showTab("logs");
  setDownloading(true);

  activeDownload = startDownloadTask(
    {
      token,
      channelId: channel,
      outputDir: location,
      skipExtensions: skip,
      foldersPerMessage: checked,
    },
    (line) => addLog(line),
  );

  activeDownload.done.then(() => {
    setDownloading(false);
    activeDownload = null;
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

function handleResize() {
  if (animationDone) {
    titleBanner.content = getBannerLines().join("\n");
    infoPanel.visible = isWide();
  }
  logsBox.height = logsHeight();
  hint.content = termW() >= 120 ? hintFull : hintCompact;
}

renderer.root.on(LayoutEvents.RESIZED, handleResize);

renderer.keyInput.on("keypress", (key: KeyEvent) => {
  if (!animationDone) return;

  if (key.name === "q" || key.name === "Q") {
    showTab("config");
    return;
  }
  if (key.name === "e" || key.name === "E") {
    showTab("logs");
    return;
  }

  if (activeTab === "config") {
    if (key.name === "tab") {
      key.stopPropagation();
      focusAt(key.shift ? focusedIndex - 1 : focusedIndex + 1);
      return;
    }
    if (key.name === "space" && focusedIndex === 4) {
      checked = !checked;
      checkbox.content = `  [${checked ? "♡" : " "}] Create a new folder for every message`;
    }
  }
});

const onFieldEnter = () => startDownload();
tokenInput.on(InputRenderableEvents.ENTER, onFieldEnter);
channelIDInput.on(InputRenderableEvents.ENTER, onFieldEnter);
downloadLocationInput.on(InputRenderableEvents.ENTER, onFieldEnter);
skipFilesInput.on(InputRenderableEvents.ENTER, onFieldEnter);

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
  configChildren.forEach((child) => {
    child.visible = false;
  });
  logsBox.visible = false;
  downloadButton.visible = false;
  hintBar.visible = false;

  renderer.root.add(tabBar);
  configChildren.forEach((child) => renderer.root.add(child));
  renderer.root.add(logsBox);
  renderer.root.add(downloadButton);
  renderer.root.add(hintBar);

  const pd = 120;
  setTimeout(() => {
    tabBar.visible = true;
  }, pd * 1);
  setTimeout(() => {
    tokenPanel.visible = true;
  }, pd * 2);
  setTimeout(() => {
    channelIDPanel.visible = true;
  }, pd * 3);
  setTimeout(() => {
    downloadLocationPanel.visible = true;
  }, pd * 4);
  setTimeout(() => {
    skipFilesInputPanel.visible = true;
  }, pd * 5);
  setTimeout(() => {
    checkbox.visible = true;
  }, pd * 6);
  setTimeout(
    () => {
      downloadButton.visible = true;
    },
    pd * 6 + 120,
  );
  setTimeout(
    () => {
      hintBar.visible = true;
    },
    pd * 6 + 220,
  );

  setTimeout(
    () => {
      animationDone = true;
      focusAt(0);
      handleResize();
    },
    pd * 6 + 320,
  );
});
