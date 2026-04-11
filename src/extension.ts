import * as path from "node:path";
import * as vscode from "vscode";
import { getGitRoot, getRemoteUrl, remoteToWebUrl } from "./gitRemote";

function statusBarIconForWebUrl(url: string): string {
  try {
    const host = new URL(url).hostname.toLowerCase();
    if (host === "github.com" || host.endsWith(".github.com")) {
      return "$(github)";
    }
    if (host.includes("gitlab")) {
      return "$(repo)";
    }
  } catch {
    /* invalid URL — fall through */
  }
  return "$(link-external)";
}

export function activate(context: vscode.ExtensionContext): void {
  let lastUrl: string | undefined;

  const statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
  statusBar.command = "openRepo.openRemote";

  function pickWorkspaceFolder(): vscode.WorkspaceFolder | undefined {
    const editor = vscode.window.activeTextEditor;
    const folders = vscode.workspace.workspaceFolders;
    if (!folders?.length) return undefined;

    if (editor?.document.uri.scheme === "file") {
      const filePath = editor.document.uri.fsPath;
      let best: vscode.WorkspaceFolder | undefined;
      let bestLen = -1;
      for (const f of folders) {
        const base = f.uri.fsPath;
        if (filePath === base || filePath.startsWith(base + path.sep)) {
          if (base.length > bestLen) {
            bestLen = base.length;
            best = f;
          }
        }
      }
      if (best) return best;
    }

    return folders[0];
  }

  async function refresh(): Promise<void> {
    const folder = pickWorkspaceFolder();
    if (!folder) {
      lastUrl = undefined;
      statusBar.hide();
      return;
    }

    const root = await getGitRoot(folder.uri.fsPath);
    if (!root) {
      lastUrl = undefined;
      statusBar.hide();
      return;
    }

    const remote = await getRemoteUrl(root);
    if (!remote) {
      lastUrl = undefined;
      statusBar.hide();
      return;
    }

    const url = remoteToWebUrl(remote);
    if (!url) {
      lastUrl = undefined;
      statusBar.hide();
      return;
    }

    lastUrl = url;
    statusBar.text = statusBarIconForWebUrl(url);
    statusBar.tooltip = `Open repository: ${url}`;
    statusBar.show();
  }

  context.subscriptions.push(
    vscode.commands.registerCommand("openRepo.openRemote", () => {
      if (lastUrl) void vscode.env.openExternal(vscode.Uri.parse(lastUrl));
    }),
    statusBar,
    vscode.workspace.onDidChangeWorkspaceFolders(() => void refresh()),
    vscode.window.onDidChangeActiveTextEditor(() => void refresh()),
  );

  void refresh();
}

export function deactivate(): void {}
