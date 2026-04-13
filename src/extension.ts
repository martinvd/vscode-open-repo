import * as path from "node:path";
import * as vscode from "vscode";
import { getGitRoot, getRemoteUrl, isGithubHost, remoteToWebUrl } from "./gitRemote";

const CONFIG_SECTION = "openRepo";
const GITHUB_ENTERPRISE_HOSTS_KEY = "githubEnterpriseHosts";

function githubEnterpriseHostsFromConfig(): string[] {
  const raw = vscode.workspace.getConfiguration(CONFIG_SECTION).get<string[]>(GITHUB_ENTERPRISE_HOSTS_KEY);
  return Array.isArray(raw) ? raw : [];
}

function statusBarIconForWebUrl(url: string, enterpriseHosts: readonly string[]): string {
  try {
    const host = new URL(url).hostname.toLowerCase();
    if (isGithubHost(host, enterpriseHosts)) {
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

    const enterpriseHosts = githubEnterpriseHostsFromConfig();
    const url = remoteToWebUrl(remote, enterpriseHosts);
    if (!url) {
      lastUrl = undefined;
      statusBar.hide();
      return;
    }

    lastUrl = url;
    statusBar.text = statusBarIconForWebUrl(url, enterpriseHosts);
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
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration(`${CONFIG_SECTION}.${GITHUB_ENTERPRISE_HOSTS_KEY}`)) void refresh();
    }),
  );

  void refresh();
}

export function deactivate(): void {}
