import * as path from "node:path";
import * as vscode from "vscode";
import {
  getGitRoot,
  getRemoteUrl,
  gitExecutableFromConfig,
  isGithubHost,
  remoteToWebUrl,
} from "./gitRemote";

const CONFIG_SECTION = "openRepo";
const GITHUB_ENTERPRISE_HOSTS_KEY = "githubEnterpriseHosts";
const STATUS_BAR_PRIORITY_KEY = "statusBarPriority";
/** Built-in Git SCM entries use 10000 (left). Sit immediately to their right. */
const DEFAULT_STATUS_BAR_PRIORITY = 9999;
const STATUS_BAR_ITEM_ID = "openRepo.remote";
const OUTPUT_CHANNEL_NAME = "Open Repo";

function githubEnterpriseHostsFromConfig(): string[] {
  const raw = vscode.workspace.getConfiguration(CONFIG_SECTION).get<string[]>(GITHUB_ENTERPRISE_HOSTS_KEY);
  return Array.isArray(raw) ? raw : [];
}

function statusBarPriorityFromConfig(): number {
  const raw = vscode.workspace.getConfiguration(CONFIG_SECTION).get<number>(STATUS_BAR_PRIORITY_KEY);
  return typeof raw === "number" && Number.isFinite(raw) ? raw : DEFAULT_STATUS_BAR_PRIORITY;
}

function gitPathFromConfig(): string {
  return gitExecutableFromConfig(vscode.workspace.getConfiguration("git").get("path"));
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

function createRemoteStatusBarItem(priority: number): vscode.StatusBarItem {
  const item = vscode.window.createStatusBarItem(
    STATUS_BAR_ITEM_ID,
    vscode.StatusBarAlignment.Left,
    priority,
  );
  item.name = "Open Repo";
  item.command = "openRepo.openRemote";
  item.accessibilityInformation = { label: "Open repository in browser" };
  return item;
}

function writeLog(channel: vscode.OutputChannel, message: string): void {
  channel.appendLine(`[${new Date().toISOString()}] ${message}`);
}

export function activate(context: vscode.ExtensionContext): void {
  // Regular output channel (not { log: true }): always listed in the Output
  // dropdown, and messages are not filtered by log level. Write immediately so
  // the channel is not omitted as empty.
  const output = vscode.window.createOutputChannel(OUTPUT_CHANNEL_NAME);
  context.subscriptions.push(output);
  writeLog(output, `Activated (${context.extension.id} ${context.extension.packageJSON.version})`);

  try {
    activateBody(context, output);
  } catch (err) {
    const message = err instanceof Error ? err.stack ?? err.message : String(err);
    writeLog(output, `Activation failed: ${message}`);
    void vscode.window.showErrorMessage(`Open Repo failed to activate: ${err instanceof Error ? err.message : String(err)}`);
  }
}

function activateBody(context: vscode.ExtensionContext, output: vscode.OutputChannel): void {
  let lastUrl: string | undefined;
  let statusBar = createRemoteStatusBarItem(statusBarPriorityFromConfig());

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

  function hide(reason: string): void {
    lastUrl = undefined;
    statusBar.hide();
    writeLog(output, `Status bar hidden: ${reason}`);
  }

  async function refresh(): Promise<void> {
    const folder = pickWorkspaceFolder();
    if (!folder) {
      hide("no workspace folder");
      return;
    }

    const gitPath = gitPathFromConfig();
    const root = await getGitRoot(folder.uri.fsPath, gitPath);
    if (!root) {
      hide(`not a git repository (or git not found: ${gitPath})`);
      return;
    }

    const remote = await getRemoteUrl(root, gitPath);
    if (!remote) {
      hide("no git remote");
      return;
    }

    const enterpriseHosts = githubEnterpriseHostsFromConfig();
    const url = remoteToWebUrl(remote, enterpriseHosts);
    if (!url) {
      hide(`unsupported remote: ${remote}`);
      return;
    }

    lastUrl = url;
    statusBar.text = statusBarIconForWebUrl(url, enterpriseHosts);
    statusBar.tooltip = `Open repository: ${url}`;
    statusBar.show();
    writeLog(output, `Status bar shown: ${url}`);
  }

  context.subscriptions.push(
    vscode.commands.registerCommand("openRepo.openRemote", () => {
      if (lastUrl) {
        void vscode.env.openExternal(vscode.Uri.parse(lastUrl));
        return;
      }
      void vscode.window.showWarningMessage("Open Repo has no repository URL yet. Check the Open Repo output channel for why.");
      output.show(true);
    }),
    vscode.commands.registerCommand("openRepo.showOutput", () => {
      output.show(true);
    }),
    statusBar,
    vscode.workspace.onDidChangeWorkspaceFolders(() => void refresh()),
    vscode.window.onDidChangeActiveTextEditor(() => void refresh()),
    vscode.workspace.onDidChangeConfiguration((e) => {
      const hostsChanged = e.affectsConfiguration(`${CONFIG_SECTION}.${GITHUB_ENTERPRISE_HOSTS_KEY}`);
      const gitPathChanged = e.affectsConfiguration("git.path");
      const priorityChanged = e.affectsConfiguration(`${CONFIG_SECTION}.${STATUS_BAR_PRIORITY_KEY}`);

      if (priorityChanged) {
        statusBar.dispose();
        statusBar = createRemoteStatusBarItem(statusBarPriorityFromConfig());
        context.subscriptions.push(statusBar);
      }

      if (hostsChanged || gitPathChanged || priorityChanged) void refresh();
    }),
  );

  void refresh();
}

export function deactivate(): void {}
