import {
  BoxRenderable,
  createCliRenderer,
  InputRenderable,
  InputRenderableEvents,
  TextRenderable,
  type KeyEvent,
} from "@opentui/core";

const renderer = await createCliRenderer({ exitOnCtrlC: true });

const titleBanner = new TextRenderable(renderer, {
  id: "title-banner",
  content: [
    "",
    "    ██████╗    ██████╗      ██████╗ ██╗███████╗ ██████╗ ██████╗ ██████╗ ██████╗ ",
    "   ███████████████████╗     ██╔══██╗██║██╔════╝██╔════╝██╔═══██╗██╔══██╗██╔══██╗",
    "  █████████████████████╗    ██║  ██║██║███████╗██║     ██║   ██║██████╔╝██║  ██║",
    "  ████╗   ██████╗   ███║    ██║  ██║██║╚════██║██║     ██║   ██║██╔══██╗██║  ██║",
    "  ╚███████████████████╔╝    ██████╔╝██║███████║╚██████╗╚██████╔╝██║  ██║██████╔╝",
    "   ╚═███████████████╔═╝     ╚═════╝ ╚═╝╚══════╝ ╚═════╝ ╚═════╝ ╚═╝  ╚═╝╚═════╝ ",
    "",
    "  ────────────────────────────  Channel  Downloader  ───────────────────────────",
    "",
  ].join("\n"),
  fg: "#5865F2",
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
  title: " 🔑 Discord Token ",
});
const channelIDPanel = new BoxRenderable(renderer, {
  ...panelDefaults,
  id: "channel-id-panel",
  title: " # Channel ID ",
});
const downloadLocationPanel = new BoxRenderable(renderer, {
  ...panelDefaults,
  id: "download-location-panel",
  title: " 📁 Download Location ",
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

const hint = new TextRenderable(renderer, {
  id: "hint",
  content:
    "  Tab · next field   Shift+Tab · prev field   Enter · confirm   Ctrl+C · exit",
  fg: "#4f545c",
});

const inputs = [tokenInput, channelIDInput, downloadLocationInput];
let focusedIndex = 0;

function focusAt(index: number) {
  focusedIndex = (index + inputs.length) % inputs.length;
  (inputs[focusedIndex] as InputRenderable).focus();
}

renderer.keyInput.on("keypress", (key: KeyEvent) => {
  if (key.name === "tab") {
    focusAt(key.shift ? focusedIndex - 1 : focusedIndex + 1);
  }
});

focusAt(0);

function onSubmit(value: string) {
  process.stdout.write(`\nSubmitted: ${value}\n`);
  process.exit(0);
}

tokenInput.on(InputRenderableEvents.CHANGE, (_value) => {});
tokenInput.on(InputRenderableEvents.ENTER, onSubmit);
channelIDInput.on(InputRenderableEvents.CHANGE, (_value) => {});
channelIDInput.on(InputRenderableEvents.ENTER, onSubmit);
downloadLocationInput.on(InputRenderableEvents.CHANGE, (_value) => {});
downloadLocationInput.on(InputRenderableEvents.ENTER, onSubmit);

tokenPanel.add(tokenInput);
channelIDPanel.add(channelIDInput);
downloadLocationPanel.add(downloadLocationInput);

renderer.root.add(titleBanner);
renderer.root.add(tokenPanel);
renderer.root.add(channelIDPanel);
renderer.root.add(downloadLocationPanel);
renderer.root.add(hint);
