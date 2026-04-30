import * as vscode from 'vscode';
import { TokenCounter } from './tokenCounter';
import { ConfigManager } from './configManager';
import { CostCalculator } from './costCalculator';
import { StatusBar } from './statusBar';
import { OutputChannelManager } from './outputChannel';
import { NotificationManager } from './notificationManager';

let tokenCounter: TokenCounter;

export function activate(context: vscode.ExtensionContext): void {
  const config = new ConfigManager();
  tokenCounter = new TokenCounter();
  const costCalculator = new CostCalculator(config);
  const outputChannel = new OutputChannelManager(costCalculator);
  const notificationManager = new NotificationManager(config, costCalculator, outputChannel);
  const statusBar = new StatusBar(tokenCounter, costCalculator, config);

  context.subscriptions.push(outputChannel, statusBar);

  context.subscriptions.push(config.onDidChange(() => {
    // StatusBar re-reads config on each update cycle, so no explicit refresh needed
  }));

  context.subscriptions.push(
    vscode.commands.registerCommand('tokenMonitor.estimateSelection', () => {
      if (!config.enabled) { return; }
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        vscode.window.showInformationMessage('Token Monitor: No active editor.');
        return;
      }
      const selection = editor.selection;
      const text = selection.isEmpty
        ? editor.document.getText()
        : editor.document.getText(selection);

      const tokens = tokenCounter.countTokens(text);
      const estimate = costCalculator.estimate(tokens);
      const label = selection.isEmpty ? `File: ${editor.document.fileName}` : 'Selection';
      outputChannel.logEstimate(label, estimate);
      notificationManager.evaluate(tokens, label);
      outputChannel.show();
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('tokenMonitor.estimateFile', () => {
      if (!config.enabled) { return; }
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        vscode.window.showInformationMessage('Token Monitor: No active editor.');
        return;
      }
      const text = editor.document.getText();
      const tokens = tokenCounter.countTokens(text);
      const estimate = costCalculator.estimate(tokens);
      const label = `File: ${editor.document.fileName}`;
      outputChannel.logEstimate(label, estimate);
      notificationManager.evaluate(tokens, label);
      outputChannel.show();
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('tokenMonitor.estimateClipboard', async () => {
      if (!config.enabled) { return; }
      const text = await vscode.env.clipboard.readText();
      if (!text) {
        vscode.window.showInformationMessage('Token Monitor: Clipboard is empty.');
        return;
      }
      const tokens = tokenCounter.countTokens(text);
      const estimate = costCalculator.estimate(tokens);
      outputChannel.logEstimate('Clipboard', estimate);
      notificationManager.evaluate(tokens, 'Clipboard');
      outputChannel.show();
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('tokenMonitor.showSessionReport', () => {
      outputChannel.showSessionReport();
    }),
  );
}

export function deactivate(): void {
  tokenCounter?.dispose();
}
