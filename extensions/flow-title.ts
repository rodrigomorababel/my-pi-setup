import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type {
  ExtensionAPI,
  ExtensionContext,
  Theme,
} from "@mariozechner/pi-coding-agent";
import { Text } from "@mariozechner/pi-tui";

const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";

const DEEP_ORANGE: Rgb = [180, 70, 0];
const ORANGE: Rgb = [247, 128, 24];
const AMBER: Rgb = [255, 170, 48];
const GOLD: Rgb = [255, 210, 105];
const PALETTE: Rgb[] = [DEEP_ORANGE, ORANGE, AMBER, GOLD, AMBER, ORANGE];

type Rgb = [number, number, number];
type Renderable = {
  render(width: number): string[];
  invalidate?: () => void;
};
type RenderableContainer = Renderable & { children: Renderable[] };
type TuiLike = RenderableContainer & { requestRender(force?: boolean): void };

const ANSI_PATTERN =
  /[\u001B\u009B][[\]()#;?]*(?:(?:(?:[a-zA-Z\d]*(?:;[a-zA-Z\d]*)*)?\u0007)|(?:(?:\d{1,4}(?:;\d{0,4})*)?[\dA-PR-TZcf-nq-uy=><~]))/g;

const TITLE_LINES = [
  "  ██████╗  █████╗ ██████╗ ███████╗██╗     ",
  "  ██╔══██╗██╔══██╗██╔══██╗██╔════╝██║     ",
  "  ██████╔╝███████║██████╔╝█████╗  ██║     ",
  "  ██╔══██╗██╔══██║██╔══██╗██╔══╝  ██║     ",
  "  ██████╔╝██║  ██║██████╔╝███████╗███████╗",
  "  ╚═════╝ ╚═╝  ╚═╝╚═════╝ ╚══════╝╚══════╝",
];

function mix(a: number, b: number, t: number) {
  return Math.round(a + (b - a) * t);
}

function sampleGradient(position: number) {
  const wrapped = ((position % 1) + 1) % 1;
  const scaled = wrapped * PALETTE.length;
  const index = Math.floor(scaled);
  const nextIndex = (index + 1) % PALETTE.length;
  const t = scaled - index;
  const a = PALETTE[index]!;
  const b = PALETTE[nextIndex]!;
  return [mix(a[0], b[0], t), mix(a[1], b[1], t), mix(a[2], b[2], t)] as Rgb;
}

function fg([r, g, b]: Rgb, text: string) {
  return `\x1b[38;2;${r};${g};${b}m${text}${RESET}`;
}

function gradientText(text: string, phase: number) {
  const chars = [...text];
  const span = Math.max(chars.length - 1, 1);
  return chars
    .map((char, index) => {
      if (char === " ") return char;
      return fg(sampleGradient(index / span + phase), char);
    })
    .join("");
}

function center(text: string, width: number) {
  const length = [...text].length;
  if (length >= width) return text;
  return `${" ".repeat(Math.floor((width - length) / 2))}${text}`;
}

function projectName() {
  return path.basename(process.cwd()) || "session";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isRenderable(value: unknown): value is Renderable {
  return isRecord(value) && typeof value.render === "function";
}

function isRenderableContainer(value: unknown): value is RenderableContainer {
  return isRenderable(value) && Array.isArray(value.render);
}

function withoutAnsi(text: string) {
  return text.replace(ANSI_PATTERN, "");
}

function renderedText(component: Renderable) {
  try {
    return withoutAnsi(component.render(120).join("\n"));
  } catch {
    return "";
  }
}

function hasSectionHeader(text: string, header: string) {
  return text.split("\n").some((line) => line.trim() === header);
}

function isHiddenStartupListing(component: Renderable) {
  const text = renderedText(component);
  const isThemesListing =
    hasSectionHeader(text, "[Themes]") &&
    (text.includes("/themes/") || text.includes(".pi/agent/themes"));
  const isExtensionsListing =
    hasSectionHeader(text, "[Extensions]") &&
    (text.includes("/extensions/") || text.includes(".pi/agent/extensions"));

  return isThemesListing || isExtensionsListing;
}

function isBlankSpacer(component: Renderable) {
  return renderedText(component).trim() === "";
}

function discoverExtensionNames(cwd: string) {
  const agentDir = process.env.PI_CODING_AGENT_DIR ?? path.join(os.homedir(), ".pi", "agent");
  const settingsPath = path.join(agentDir, "settings.json");
  const names = new Set<string>();

  function addDir(dir: string) {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir)) {
      const full = path.join(dir, entry);
      try {
        const stat = fs.statSync(full);
        if (stat.isFile() && /\.[cm]?tsx?$/.test(entry)) names.add(entry);
        if (stat.isDirectory() && ["index.ts", "index.tsx", "index.js"].some((file) => fs.existsSync(path.join(full, file)))) names.add(entry);
      } catch {
        // ignore unreadable entries
      }
    }
  }

  addDir(path.join(agentDir, "extensions"));
  addDir(path.join(cwd, ".pi", "extensions"));

  try {
    const settings = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
    for (const pkg of Array.isArray(settings.packages) ? settings.packages : []) {
      if (typeof pkg !== "string" || pkg.includes(":")) continue;
      const pkgDir = path.isAbsolute(pkg) ? pkg : path.join(agentDir, pkg);
      addDir(path.join(pkgDir, "extensions"));
    }
  } catch {
    // ignore settings parse errors
  }

  return [...names].sort((a, b) => a.localeCompare(b));
}

function renderHeader(width: number, phase: number, subtitleText: string) {
  const lines = TITLE_LINES.map((line, row) =>
    gradientText(center(line, width), phase + row * 0.045),
  );
  const subtitle = center(subtitleText, width);

  return [
    "",
    ...lines,
    `${BOLD}${gradientText(subtitle, phase + 0.18)}${RESET}`,
    "",
  ];
}

function resourceSection(title: string, names: string[], theme: Theme) {
  return `${theme.fg("mdHeading", `[${title}]`)}\n${theme.fg("dim", `  ${names.length ? names.join(", ") : "none"}`)}`;
}

export default function (pi: ExtensionAPI) {
  let requestRender: (() => void) | undefined;
  let currentModelId = "no model selected";

  pi.registerMessageRenderer<{ extensions: string[]; themes: string[] }>("new-session-resources", (message, _options, theme) => {
    const extensions = message.details?.extensions ?? [];
    const themes = message.details?.themes ?? [];
    return new Text(`${resourceSection("Extensions", extensions, theme)}\n\n${resourceSection("Themes", themes, theme)}`, 0, 0);
  });

  function installHeader(ctx: ExtensionContext) {
    ctx.ui.setHeader((tui) => {
      requestRender = () => tui.requestRender();
      return {
        render(width: number) {
          return renderHeader(width, 0, `${currentModelId} · ${projectName()}`);
        },
        invalidate() {
          tui.requestRender();
        },
      };
    });
  }

  pi.on("session_start", (event, ctx) => {
    currentModelId = ctx.model?.id ?? "no model selected";
    if (!ctx.hasUI) return;

    installHeader(ctx);

    if (event.reason === "new") {
      setTimeout(() => {
        pi.sendMessage({
          customType: "new-session-resources",
          content: "",
          display: true,
          details: {
            extensions: discoverExtensionNames(ctx.cwd),
            themes: ctx.ui.getAllThemes().map((theme) => theme.name).sort((a, b) => a.localeCompare(b)),
          },
        });
      }, 0);
    }

    // /new, /resume, and /fork rebuild parts of the TUI after session_start.
    // Re-apply the header on the next tick so it survives that replacement flow too.
    if (event.reason !== "startup") {
      setTimeout(() => installHeader(ctx), 0);
    }
  });

  pi.on("model_select", (event) => {
    currentModelId = event.model.id;
    requestRender?.();
  });

  pi.on("session_shutdown", (event, ctx) => {
    requestRender = undefined;

    // Don't clear the header during session replacement flows. The new extension
    // instance will install its header for the replacement session.
    if (ctx.hasUI && (event.reason === "quit" || event.reason === "reload")) {
      ctx.ui.setHeader(undefined);
    }
  });

  pi.registerCommand("flow-title", {
    description: "Enable the orange BABEL flowing gradient session header",
    handler: async (_args, ctx) => {
      installHeader(ctx);
      ctx.ui.notify("Flow title enabled", "info");
    },
  });

  pi.registerCommand("flow-title-builtin", {
    description: "Restore pi's built-in header for this session",
    handler: async (_args, ctx) => {
      ctx.ui.setHeader(undefined);
      ctx.ui.notify("Built-in header restored", "info");
    },
  });
}
