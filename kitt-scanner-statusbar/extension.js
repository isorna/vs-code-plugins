"use strict";

const vscode = require("vscode");
const {
  DEFAULT_COLOR,
  DEFAULT_FRAME_DELAY,
  buildFrames,
  normalizeColor,
  normalizeFrameDelay
} = require("./src/kittScanner");
const { createExternalController } = require("./src/externalControl");

class KittScannerController {
  constructor() {
    this.frames = buildFrames();
    this.currentFrame = 0;
    this.timer = null;
    this.statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
    this.statusBarItem.name = "KITT Scanner";
    this.statusBarItem.command = "kittScanner.openSettings";
  }

  refresh() {
    const configuration = vscode.workspace.getConfiguration("kittScanner");
    const enabled = configuration.get("enabled", true);

    if (!enabled) {
      this.stop();
      this.statusBarItem.hide();
      return;
    }

    const color = normalizeColor(configuration.get("color", DEFAULT_COLOR));
    const speed = normalizeFrameDelay(configuration.get("speed", DEFAULT_FRAME_DELAY));

    this.statusBarItem.color = color;
    this.statusBarItem.tooltip = [
      "KITT: Escaneando...",
      `Color: ${color}`,
      `Velocidad: ${speed} ms/frame`,
      "Haz clic para abrir la configuración."
    ].join("\n");

    this.restart(speed);
    this.renderFrame();
    this.statusBarItem.show();
  }

  restart(speed) {
    this.stop();
    this.timer = setInterval(() => {
      this.renderFrame();
    }, speed);
  }

  renderFrame() {
    this.statusBarItem.text = this.frames[this.currentFrame];
    this.currentFrame = (this.currentFrame + 1) % this.frames.length;
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  dispose() {
    this.stop();
    this.statusBarItem.dispose();
  }
}

function activate(context) {
  const scanner = new KittScannerController();
  const controller = createExternalController(
    (section) => vscode.workspace.getConfiguration(section),
    () => scanner.refresh()
  );

  context.subscriptions.push(
    scanner,
    vscode.commands.registerCommand("kittScanner.openSettings", async () => {
      await vscode.commands.executeCommand("workbench.action.openSettings", "kittScanner");
    }),
    vscode.commands.registerCommand("kittScanner.enable", async (target) => {
      return controller.enable(target);
    }),
    vscode.commands.registerCommand("kittScanner.disable", async (target) => {
      return controller.disable(target);
    }),
    vscode.commands.registerCommand("kittScanner.toggle", async (target) => {
      return controller.toggle(target);
    }),
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration("kittScanner")) {
        scanner.refresh();
      }
    })
  );

  scanner.refresh();
  return controller;
}

function deactivate() {}

module.exports = {
  activate,
  deactivate
};
