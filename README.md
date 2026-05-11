# My Pi Setup

Personal Pi coding-agent setup with custom extensions, theme, and settings.

## Requirements

- Node.js 22+
- pnpm 10+
- git
- Pi provider credentials configured separately (for example OpenAI/Codex auth)

Optional, depending on which extensions you use:

- `wl-copy` on Wayland/Linux for clipboard support (`copy-all` extension)
- `git` available in `PATH` for the git status widget
- A Firecrawl API key for the Firecrawl search/scrape tools

## Install

This setup is expected to live at `~/.pi/agent/my-pi-setup`.

```bash
mkdir -p ~/.pi/agent
git clone <REPO_URL> ~/.pi/agent/my-pi-setup
cd ~/.pi/agent/my-pi-setup
pnpm install
```

Replace `<REPO_URL>` with the URL of this repository.

## Configure environment variables

Create a local `.env` file from the example:

```bash
cp .env.example .env
```

Then edit `.env` and add any required secrets:

```env
FIRECRAWL_API_KEY=your_firecrawl_key_here
```

`.env` is intentionally ignored by git.

## Run Pi with this setup

From this directory:

```bash
pnpm exec pi
```

Or add a shell alias:

```bash
alias pi='cd ~/.pi/agent/my-pi-setup && pnpm exec pi'
```

## What is included

- `settings.json` — default Pi settings, provider/model, and theme selection
- `themes/github-dark-default.json` — custom theme
- `extensions/` — custom Pi extensions and tools
- `assets/` — setup assets such as preview images

## Updating

```bash
cd ~/.pi/agent/my-pi-setup
git pull
pnpm install
```

## Notes

- Do not commit `.env`, `auth.json`, `models.json`, sessions, or `node_modules`.
- If Pi cannot find dependencies after pulling updates, run `pnpm install` again.
