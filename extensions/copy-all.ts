import { spawn } from "node:child_process";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

function textFromContent(content: unknown) {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";

  return content
    .map((block) => {
      if (!block || typeof block !== "object") return "";
      if (!("type" in block)) return "";

      if (
        block.type === "text" &&
        "text" in block &&
        typeof block.text === "string"
      ) {
        return block.text;
      }

      if (block.type === "image") return "[image]";

      return "";
    })
    .filter(Boolean)
    .join("\n");
}

function runClipboardCommand(command: string, args: string[], text: string) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(command, args);
    let stderr = "";

    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });

    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(
          new Error(
            stderr.trim() || `${[command, ...args].join(" ")} exited with code ${code}`,
          ),
        );
      }
    });

    child.stdin.end(text);
  });
}

async function copyToClipboard(text: string) {
  // Omarchy/Hyprland runs on Wayland, where wl-copy is the native clipboard
  // tool. Keep a few fallbacks for X11, macOS, and tmux-only sessions.
  const candidates: Array<[string, string[]]> = [
    ...(process.env.WAYLAND_DISPLAY ? [["wl-copy", []] as [string, string[]]] : []),
    ...(process.env.DISPLAY
      ? [
          ["xclip", ["-selection", "clipboard"]] as [string, string[]],
          ["xsel", ["--clipboard", "--input"]] as [string, string[]],
        ]
      : []),
    ["wl-copy", []],
    ["pbcopy", []],
    ...(process.env.TMUX ? [["tmux", ["load-buffer", "-"]] as [string, string[]]] : []),
  ];

  const errors: string[] = [];

  for (const [command, args] of candidates) {
    try {
      await runClipboardCommand(command, args, text);
      return;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      errors.push(`${command}: ${message}`);
    }
  }

  throw new Error(`Could not copy to clipboard. Tried: ${errors.join("; ")}`);
}

export default function (pi: ExtensionAPI) {
  pi.registerCommand("cp", {
    description: "Copy last assistant message to the clipboard using Linux/Wayland clipboard tools",
    handler: async (_args, ctx) => {
      await ctx.waitForIdle();

      const lastAssistantMessage = ctx.sessionManager
        .getBranch()
        .filter((entry) => entry.type === "message")
        .map((entry) => entry.message)
        .reverse()
        .find((message) => message.role === "assistant");

      const text = textFromContent(lastAssistantMessage?.content).trim();

      if (!text) {
        ctx.ui.notify("No assistant message to copy", "info");
        return;
      }

      await copyToClipboard(text);
      ctx.ui.notify("Copied last assistant message to clipboard", "info");
    },
  });

  pi.registerCommand("copy-all", {
    description:
      "Copy all previous user and assistant messages in this thread to the clipboard",
    handler: async (_args, ctx) => {
      await ctx.waitForIdle();

      const messages = ctx.sessionManager
        .getBranch()
        .filter((entry) => entry.type === "message")
        .map((entry) => entry.message)
        .filter(
          (message) => message.role === "user" || message.role === "assistant",
        );

      const text = messages
        .map((message) => {
          const content = textFromContent(message.content).trim();
          return `${message.role.toUpperCase()}:\n${content}`;
        })
        .filter((section) => !section.endsWith(":\n"))
        .join("\n\n---\n\n");

      if (!text) {
        ctx.ui.notify("No user or assistant messages to copy", "info");
        return;
      }

      await copyToClipboard(text);
      ctx.ui.notify(`Copied ${messages.length} messages to clipboard`, "info");
    },
  });
}
