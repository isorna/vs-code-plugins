"use strict";

const vscode = require("vscode");
const { KittScannerManager } = require("./src/kittScannerManager");
const { collectSpecKitStatus } = require("./src/specKitStatus");

class SpecKitStatusProvider {
  constructor(context, statusBarItem, kittScannerManager) {
    this.context = context;
    this.statusBarItem = statusBarItem;
    this.kittScannerManager = kittScannerManager;
    this.onDidChangeTreeDataEmitter = new vscode.EventEmitter();
    this.onDidChangeTreeData = this.onDidChangeTreeDataEmitter.event;
    this.state = {
      rootPath: null,
      status: null
    };
  }

  async refresh() {
    await this.kittScannerManager.runTask(async () => {
      const folder = vscode.workspace.workspaceFolders?.[0];
      const rootPath = folder?.uri.fsPath ?? null;
      this.state.rootPath = rootPath;

      if (!rootPath) {
        this.state.status = null;
        this.renderStatusBar(null);
        this.onDidChangeTreeDataEmitter.fire();
        return;
      }

      try {
        const configuration = vscode.workspace.getConfiguration("specKitStatus");
        this.state.status = await collectSpecKitStatus(rootPath, {
          preferGitBranchFeature: configuration.get("preferGitBranchFeature", true)
        });
        this.renderStatusBar(this.state.status);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.state.status = {
          phase: "Unavailable",
          workflow: "Unavailable",
          feature: "Unknown",
          completion: 0,
          summary: "Unable to load Spec Kit status.",
          details: message
        };
        this.renderStatusBar(this.state.status);
      }

      this.onDidChangeTreeDataEmitter.fire();
    });
  }

  getTreeItem(item) {
    return item;
  }

  async getChildren() {
    const rootPath = this.state.rootPath;
    const status = this.state.status;

    if (!rootPath) {
      return [
        this.createItem("Workspace", "Open a folder to inspect Spec Kit status.", "No workspace folder is open.")
      ];
    }

    if (!status) {
      return [
        this.createItem("Status", "Refreshing...", "Spec Kit status is loading.")
      ];
    }

    return [
      this.createItem("Phase", status.phase, status.phaseDetail),
      this.createItem("Workflow", status.workflow, status.workflowDetail),
      this.createItem("Feature", status.feature, status.featureDetail),
      this.createItem("Completion", `${status.completion}%`, status.completionDetail)
    ];
  }

  createItem(label, description, tooltip) {
    const item = new vscode.TreeItem(label, vscode.TreeItemCollapsibleState.None);
    item.description = description;
    item.tooltip = tooltip;
    item.contextValue = "specKitStatusItem";
    return item;
  }

  renderStatusBar(status) {
    const enabled = vscode.workspace.getConfiguration("specKitStatus").get("showStatusBar", true);
    if (!enabled) {
      this.statusBarItem.hide();
      return;
    }

    if (!status) {
      this.statusBarItem.text = "$(checklist) Spec Kit";
      this.statusBarItem.tooltip = "Open a workspace folder to inspect Spec Kit status.";
      this.statusBarItem.command = "specKitStatus.refresh";
      this.statusBarItem.show();
      return;
    }

    this.statusBarItem.text = `$(checklist) ${status.completion}% ${status.feature} · ${status.phase}`;
    this.statusBarItem.tooltip = [
      `Feature: ${status.feature}`,
      `Phase: ${status.phase}`,
      `Workflow: ${status.workflow}`,
      `Completion: ${status.completion}%`
    ].join("\n");
    this.statusBarItem.command = "specKitStatus.refresh";
    this.statusBarItem.show();
  }
}

function activate(context) {
  const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
  const kittScannerManager = new KittScannerManager({
    extensionsApi: vscode.extensions,
    configurationTarget: vscode.ConfigurationTarget.Workspace,
    onError: (error) => {
      console.warn("[spec-kit-status] Unable to sync KITT scanner.", error);
    }
  });
  const provider = new SpecKitStatusProvider(context, statusBarItem, kittScannerManager);
  let watcherDisposables = [];

  function registerWatchers() {
    for (const disposable of watcherDisposables) {
      disposable.dispose();
    }
    watcherDisposables = [];

    for (const folder of vscode.workspace.workspaceFolders ?? []) {
      const specWatcher = vscode.workspace.createFileSystemWatcher(
        new vscode.RelativePattern(folder, "specs/**")
      );
      const specifyWatcher = vscode.workspace.createFileSystemWatcher(
        new vscode.RelativePattern(folder, ".specify/**")
      );
      const gitHeadWatcher = vscode.workspace.createFileSystemWatcher(
        new vscode.RelativePattern(folder, ".git/HEAD")
      );

      const refresh = () => {
        void provider.refresh();
      };

      specWatcher.onDidCreate(refresh);
      specWatcher.onDidChange(refresh);
      specWatcher.onDidDelete(refresh);
      specifyWatcher.onDidCreate(refresh);
      specifyWatcher.onDidChange(refresh);
      specifyWatcher.onDidDelete(refresh);
      gitHeadWatcher.onDidCreate(refresh);
      gitHeadWatcher.onDidChange(refresh);
      gitHeadWatcher.onDidDelete(refresh);

      watcherDisposables.push(specWatcher, specifyWatcher, gitHeadWatcher);
    }
  }

  context.subscriptions.push(statusBarItem);
  context.subscriptions.push(
    vscode.window.registerTreeDataProvider("specKitStatusView", provider),
    vscode.commands.registerCommand("specKitStatus.refresh", async () => {
      await provider.refresh();
    }),
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration("specKitStatus")) {
        void provider.refresh();
      }
    }),
    vscode.workspace.onDidChangeWorkspaceFolders(() => {
      registerWatchers();
      void provider.refresh();
    }),
    new vscode.Disposable(() => {
      void kittScannerManager.dispose();
      for (const disposable of watcherDisposables) {
        disposable.dispose();
      }
    })
  );

  registerWatchers();
  void provider.refresh();
}

function deactivate() {}

module.exports = {
  activate,
  deactivate
};
