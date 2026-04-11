import * as vscode from "vscode";

export function activate(context: vscode.ExtensionContext): void {
  const disposable = vscode.commands.registerCommand("openRepo.helloWorld", () => {
    void vscode.window.showInformationMessage("Hello from Open Repo.");
  });
  context.subscriptions.push(disposable);
}

export function deactivate(): void {}
