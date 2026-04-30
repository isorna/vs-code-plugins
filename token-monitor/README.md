# Token Cost Monitor

Estimates token counts and costs for text before sending to AI assistants. Shows live status bar counts with configurable threshold warnings.

## Overview

When working with AI assistants like Windsurf Cascade, it's easy to send large prompts without realizing the token cost. **Token Cost Monitor** gives you real-time visibility into token counts and estimated costs directly in your editor.

The extension provides:

- A **live status bar** that continuously shows the token count and estimated cost of the current file or selection
- **On-demand commands** to estimate tokens for selections, files, or clipboard content
- **Configurable threshold warnings** that alert you when token counts exceed your limits
- A **dedicated output channel** with detailed per-estimate logs and session summaries

Token counting uses [`js-tiktoken`](https://github.com/nicolo-ribaudo/js-tiktoken) with the `gpt-4o` model encoding (`o200k_base`).

## Features

### Live Status Bar

A status bar item displays the token count and estimated cost for the active editor in real time. Updates are debounced at 300ms to keep the editor responsive.

```
$(symbol-number) 1,234 tokens (file) ~$0.013
```

- Shows count for the **selected text** when a selection is active, or the **full file** otherwise
- Color-coded background based on threshold levels:
  - **Default** — below warning threshold
  - **Yellow** — at or above warning threshold (default: 4,000 tokens)
  - **Red** — at or above critical threshold (default: 16,000 tokens)
- Click the status bar item to run the detailed estimate command

### Commands

Open the Command Palette (`Cmd+Shift+P` / `Ctrl+Shift+P`) and search for "Token Monitor":

| Command | Keybinding | Description |
|---------|------------|-------------|
| `Token Monitor: Estimate Tokens: Selection` | `Cmd+Shift+T` / `Ctrl+Shift+T` | Estimate tokens for the current selection, or the full file if nothing is selected |
| `Token Monitor: Estimate Tokens: Entire File` | — | Estimate tokens for the entire active file |
| `Token Monitor: Estimate Tokens: Clipboard` | — | Estimate tokens for the current clipboard content (useful before pasting into Cascade) |
| `Token Monitor: Show Session Cost Report` | — | Display a cumulative summary of all estimates made during the session |

Each estimate command logs detailed results to the **Token Cost Monitor** output channel:

```
[2:45:30 PM] File: src/extension.ts
  Input tokens:     1,234
  Est. output:      617
  Input cost:       $0.0037
  Output cost:      $0.0093
  Total est. cost:  $0.0130
```

### Threshold Notifications

When a token count exceeds configured thresholds, the extension shows VS Code notifications:

- **Warning** (default: 4,000 tokens) — Shows a warning notification with token count and estimated cost
- **Critical** (default: 16,000 tokens) — Shows an error notification with a strong warning

Each notification includes a **Show Details** button that opens the output channel for the full breakdown. A configurable cooldown (default: 30 seconds) prevents notification spam — threshold violations are always logged to the output channel regardless of cooldown.

### Session Cost Report

Run `Show Session Cost Report` to see a cumulative summary:

```
=====================================
         SESSION COST REPORT
=====================================
  Estimates run:    12
  Total tokens:     45,678
  Total est. cost:  $0.4796
=====================================
```

## Installation

### From Source

```bash
git clone <repo-url>
cd token-monitor
npm install
npm run build
npx @vscode/vsce package
```

Then in Windsurf or VS Code: **Extensions** > **...** > **Install from VSIX** and select the generated `.vsix` file.

### Development

Press `F5` in Windsurf/VS Code to launch an Extension Development Host with the extension loaded.

## Configuration

All settings are under the `tokenMonitor` namespace. Open **Settings** and search for "Token Monitor", or add them directly to `settings.json`:

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `tokenMonitor.enabled` | `boolean` | `true` | Enable or disable the Token Cost Monitor |
| `tokenMonitor.warningThreshold` | `number` | `4000` | Token count above which a warning notification is shown |
| `tokenMonitor.criticalThreshold` | `number` | `16000` | Token count above which an error notification is shown |
| `tokenMonitor.costPerMillionInputTokens` | `number` | `3.0` | Cost in USD per 1 million input tokens |
| `tokenMonitor.costPerMillionOutputTokens` | `number` | `15.0` | Cost in USD per 1 million output tokens |
| `tokenMonitor.estimatedOutputRatio` | `number` | `0.5` | Estimated output-to-input token ratio for cost projection |
| `tokenMonitor.notificationCooldownSeconds` | `number` | `30` | Minimum seconds between repeated threshold notifications |

### Example `settings.json`

```json
{
  "tokenMonitor.warningThreshold": 8000,
  "tokenMonitor.criticalThreshold": 32000,
  "tokenMonitor.costPerMillionInputTokens": 3.0,
  "tokenMonitor.costPerMillionOutputTokens": 15.0,
  "tokenMonitor.estimatedOutputRatio": 0.6
}
```

Settings take effect immediately — no reload required.

## Cost Estimation Formula

The extension projects both input and output costs:

```
inputCost            = (inputTokens / 1,000,000) * costPerMillionInputTokens
projectedOutputTokens = inputTokens * estimatedOutputRatio
projectedOutputCost  = (projectedOutputTokens / 1,000,000) * costPerMillionOutputTokens
totalEstimatedCost   = inputCost + projectedOutputCost
```

With default settings (`$3.00/M input`, `$15.00/M output`, `0.5 ratio`):

| Input Tokens | Input Cost | Projected Output (0.5x) | Output Cost | Total |
|--------------|-----------|------------------------|-------------|-------|
| 1,000 | $0.003 | 500 | $0.008 | $0.011 |
| 4,000 | $0.012 | 2,000 | $0.030 | $0.042 |
| 16,000 | $0.048 | 8,000 | $0.120 | $0.168 |
| 100,000 | $0.300 | 50,000 | $0.750 | $1.050 |

## Architecture

```
token-monitor/
├── package.json               # Extension manifest
├── tsconfig.json              # TypeScript configuration
├── esbuild.js                 # Build script (esbuild bundler)
├── jest.config.js             # Test configuration
├── .vscodeignore              # VSIX packaging exclusions
├── src/
│   ├── extension.ts           # Entry point — wires all modules, registers commands
│   ├── tokenCounter.ts        # Token counting via js-tiktoken (gpt-4o / o200k_base)
│   ├── costCalculator.ts      # Cost projection from token counts
│   ├── configManager.ts       # Typed wrapper for VS Code settings with change events
│   ├── statusBar.ts           # Live debounced status bar with threshold colors
│   ├── outputChannel.ts       # Detailed logging and session report aggregation
│   └── notificationManager.ts # Two-tier threshold notifications with cooldown
└── test/
    └── tokenCounter.test.ts   # Unit tests for token counting
```

## Development

### Prerequisites

- Node.js 18+
- npm

### Scripts

```bash
npm run build    # Bundle with esbuild → out/extension.js
npm run watch    # Rebuild on file changes
npm test         # Run unit tests (Jest)
npx @vscode/vsce package   # Package as .vsix
```

### Running Tests

```bash
npm test
```

Tests cover token counting edge cases: empty input, falsy input, simple text, code blocks, monotonicity, and determinism.

## Compatibility

- **Editors**: Windsurf IDE, VS Code, any VS Code fork
- **Engine**: `vscode ^1.85.0`
- **Runtime**: Pure JavaScript (`js-tiktoken`) — no WASM or native dependencies
