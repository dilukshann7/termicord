import {
  BoxRenderable,
  createCliRenderer,
  Text,
  TextareaRenderable,
} from "@opentui/core";

const renderer = await createCliRenderer({
  exitOnCtrlC: true,
});

const panel = new BoxRenderable(renderer, {
  id: "panel",
  width: 120,
  height: 10,
  borderStyle: "single",
  borderColor: "#5865F2",
});

renderer.root.add(panel);
