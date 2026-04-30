import * as vscode from 'vscode';
import { TokenCounter } from './tokenCounter';
import { CostCalculator } from './costCalculator';
import { ConfigManager } from './configManager';

export class StatusBar implements vscode.Disposable {
  private readonly item: vscode.StatusBarItem;
  private readonly disposables: vscode.Disposable[] = [];
  private debounceTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(
    private readonly tokenCounter: TokenCounter,
    private readonly costCalculator: CostCalculator,
    private readonly config: ConfigManager,
  ) {
    this.item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
    this.item.command = 'tokenMonitor.estimateSelection';
    this.item.tooltip = 'Click to estimate tokens for selection';

    this.disposables.push(
      vscode.window.onDidChangeActiveTextEditor(() => this.scheduleUpdate()),
      vscode.window.onDidChangeTextEditorSelection(() => this.scheduleUpdate()),
      vscode.workspace.onDidChangeTextDocument(() => this.scheduleUpdate()),
    );

    this.update();
    this.item.show();
  }

  private scheduleUpdate(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }
    this.debounceTimer = setTimeout(() => this.update(), 300);
  }

  private update(): void {
    if (!this.config.enabled) {
      this.item.hide();
      return;
    }

    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      this.item.text = '$(symbol-number) No editor';
      this.item.backgroundColor = undefined;
      return;
    }

    const selection = editor.selection;
    const text = selection.isEmpty
      ? editor.document.getText()
      : editor.document.getText(selection);

    const tokens = this.tokenCounter.countTokens(text);
    const estimate = this.costCalculator.estimate(tokens);
    const label = selection.isEmpty ? 'file' : 'selection';

    this.item.text = `$(symbol-number) ${this.costCalculator.formatTokens(tokens)} tokens (${label}) ~${this.costCalculator.formatCost(estimate.totalCost)}`;

    if (tokens >= this.config.criticalThreshold) {
      this.item.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
    } else if (tokens >= this.config.warningThreshold) {
      this.item.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
    } else {
      this.item.backgroundColor = undefined;
    }

    this.item.show();
  }

  dispose(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }
    this.item.dispose();
    this.disposables.forEach((d) => d.dispose());
  }
}
