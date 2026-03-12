import {
  BoxRenderable,
  createCliRenderer,
  InputRenderable,
  InputRenderableEvents,
  LayoutEvents,
  TextRenderable,
  type KeyEvent,
} from "@opentui/core";

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
  borderColor: "#7c3aed",
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
  fg: "#6366f1",
});

const infoPanelLine2 = new TextRenderable(renderer, {
  id: "info-line-1",
  content: "──────────────────────",
  fg: "#7c3aed",
});

const infoPanelLine3 = new TextRenderable(renderer, {
  id: "info-line-2",
  content: "developed & maintained by",
  fg: "#8b5cf6",
});

const infoPanelLine4 = new TextRenderable(renderer, {
  id: "info-line-3",
  content: " ♡  github / dilukshann7 ♡ ",
  fg: "#a855f7",
});

const infoPanelLine5 = new TextRenderable(renderer, {
  id: "info-line-4",
  content: " (⌒ made for the public ⌒) ",
  fg: "#c084fc",
});

infoPanel.add(infoPanelLine1);
infoPanel.add(infoPanelLine2);
infoPanel.add(infoPanelLine3);
infoPanel.add(infoPanelLine4);
infoPanel.add(infoPanelLine5);
renderer.root.add(infoPanel);

const panelDefaults = {
  width: 120,
  height: 3,
  paddingLeft: 1,
  borderColor: "#5865F2",
};

const tokenPanel = new BoxRenderable(renderer, {
  ...panelDefaults,
  id: "token-panel",
  title: " # Discord Token ",
});
const channelIDPanel = new BoxRenderable(renderer, {
  ...panelDefaults,
  id: "channel-id-panel",
  title: " # Channel ID ",
});
const downloadLocationPanel = new BoxRenderable(renderer, {
  ...panelDefaults,
  id: "download-location-panel",
  title: " # Download Location ",
});
const skipFilesInputPanel = new BoxRenderable(renderer, {
  ...panelDefaults,
  id: "skip-files-input-panel",
  title: " # Extenstions to Skip ",
});

const inputDefaults = { width: 114 };

const tokenInput = new InputRenderable(renderer, {
  ...inputDefaults,
  id: "token-input",
  placeholder: "Enter your Discord token...",
});
const channelIDInput = new InputRenderable(renderer, {
  ...inputDefaults,
  id: "channel-id-input",
  placeholder: "Enter channel ID...",
});
const downloadLocationInput = new InputRenderable(renderer, {
  ...inputDefaults,
  id: "download-location-input",
  placeholder: "Enter download location (e.g. ./downloads)...",
});
const skipFilesInput = new InputRenderable(renderer, {
  ...inputDefaults,
  id: "skip-files-input",
  placeholder: "Enter file extensions to skip (e.g. .jpg .png)...",
});

let checked = false;

const checkbox = new TextRenderable(renderer, {
  id: "checkbox",
  content: "  [ ] Create a new folder for every message",
  fg: "#4f545c",
});

const hintBar = new BoxRenderable(renderer, {
  id: "hint-bar",
  position: "absolute",
  bottom: 0,
  width: "100%",
  height: 3,
  borderStyle: "single",
  borderColor: "#2a2d31",
  paddingLeft: 2,
  paddingRight: 2,
  flexDirection: "column",
  justifyContent: "center",
  alignItems: "center",
});

const hint = new TextRenderable(renderer, {
  id: "hint",
  content:
    "Tab · next field | Shift+Tab · prev field | Space · toggle checkbox | Enter · confirm | Ctrl+C · exit",
  fg: "#4f545c",
});

const inputs = [tokenInput, channelIDInput, downloadLocationInput];
let focusedIndex = 0;

function updateCheckboxColor() {
  checkbox.fg = focusedIndex === 3 ? "#5865F2" : "#4f545c";
}

function focusAt(index: number) {
  focusedIndex = (index + 4) % 4;

  if (focusedIndex < 3) {
    inputs.forEach((inp) => inp.blur());
    (inputs[focusedIndex] as InputRenderable).focus();
  } else {
    inputs.forEach((inp) => inp.blur());
  }

  updateCheckboxColor();
}

renderer.keyInput.on("keypress", (key: KeyEvent) => {
  if (key.name === "tab") {
    key.stopPropagation();
    focusAt(key.shift ? focusedIndex - 1 : focusedIndex + 1);
    return;
  }

  if (key.name === "space" && focusedIndex === 3) {
    key.stopPropagation();
    checked = !checked;
    checkbox.content = `  [${checked ? "X" : " "}] Create a new folder for every message`;
  }
});

focusAt(0);

function onSubmit(value: string) {
  process.stdout.write(`\nSubmitted: ${value}\n`);
  process.exit(0);
}

tokenInput.on(InputRenderableEvents.ENTER, onSubmit);
channelIDInput.on(InputRenderableEvents.ENTER, onSubmit);
downloadLocationInput.on(InputRenderableEvents.ENTER, onSubmit);
skipFilesInput.on(InputRenderableEvents.ENTER, onSubmit);

tokenPanel.add(tokenInput);
channelIDPanel.add(channelIDInput);
downloadLocationPanel.add(downloadLocationInput);
skipFilesInputPanel.add(skipFilesInput);

renderer.root.add(titleBanner);
renderer.root.add(tokenPanel);
renderer.root.add(channelIDPanel);
renderer.root.add(downloadLocationPanel);
renderer.root.add(skipFilesInputPanel);
renderer.root.add(checkbox);
renderer.root.add(hintBar);
hintBar.add(hint);
