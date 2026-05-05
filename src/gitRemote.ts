import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

async function gitOutput(cwd: string, args: string[]): Promise<string | undefined> {
  try {
    const { stdout } = await execFileAsync("git", ["-C", cwd, ...args], {
      encoding: "utf8",
      maxBuffer: 1024 * 1024,
    });
    const s = stdout.trim();
    return s || undefined;
  } catch {
    return undefined;
  }
}

export async function getGitRoot(workspaceFolder: string): Promise<string | undefined> {
  return gitOutput(workspaceFolder, ["rev-parse", "--show-toplevel"]);
}

/** Uses `origin` if present, otherwise the first remote from `git remote`. */
export async function getRemoteUrl(root: string): Promise<string | undefined> {
  const origin = await gitOutput(root, ["remote", "get-url", "origin"]);
  if (origin) return origin;
  const list = await gitOutput(root, ["remote"]);
  if (!list) return undefined;
  const first = list
    .split("\n")
    .map((l) => l.trim())
    .find(Boolean);
  if (!first) return undefined;
  return gitOutput(root, ["remote", "get-url", first]);
}

function stripGitSuffix(p: string): string {
  return p.replace(/\.git$/i, "") || p;
}

/** True for github.com, GitHub Enterprise Cloud (`*.github.com`), common GHES hostnames (`github.*`), or configured Enterprise Server hosts. */
export function isGithubHost(hostname: string, enterpriseHosts: readonly string[] = []): boolean {
  const h = hostname.toLowerCase();
  if (h === "github.com" || h === "www.github.com") return true;
  if (h.endsWith(".github.com")) return true;
  if (h.startsWith("github.")) return true;
  for (const entry of enterpriseHosts) {
    const x = entry.trim().toLowerCase();
    if (x && h === x) return true;
  }
  return false;
}

function isSupportedHost(hostname: string, githubEnterpriseHosts: readonly string[]): boolean {
  const h = hostname.toLowerCase();
  if (isGithubHost(h, githubEnterpriseHosts)) return true;
  if (h === "gitlab.com" || h.endsWith(".gitlab.com")) return true;
  if (h.includes("gitlab")) return true;
  return false;
}

/** Converts a git remote URL to an HTTPS repo URL, or `undefined` if unsupported. */
export function remoteToWebUrl(
  remote: string,
  githubEnterpriseHosts: readonly string[] = [],
): string | undefined {
  const trimmed = remote.trim();
  if (!trimmed) return undefined;

  const scp = trimmed.match(/^[^@]+@([^:]+):(.+)$/);
  if (scp) {
    const host = scp[1].toLowerCase();
    if (!isSupportedHost(host, githubEnterpriseHosts)) return undefined;
    let repoPath = scp[2].replace(/^\/+/, "");
    repoPath = stripGitSuffix(repoPath);
    return `https://${host}/${repoPath}`;
  }

  if (trimmed.startsWith("ssh://")) {
    try {
      const u = new URL(trimmed);
      const host = u.hostname.toLowerCase();
      if (!isSupportedHost(host, githubEnterpriseHosts)) return undefined;
      let repoPath = u.pathname.replace(/^\/+/, "");
      repoPath = stripGitSuffix(repoPath);
      return `https://${host}/${repoPath}`;
    } catch {
      return undefined;
    }
  }

  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    try {
      const u = new URL(trimmed);
      const host = u.hostname.toLowerCase();
      if (!isSupportedHost(host, githubEnterpriseHosts)) return undefined;
      let repoPath = u.pathname.replace(/^\/+/, "");
      repoPath = stripGitSuffix(repoPath);
      return `https://${host}/${repoPath}`;
    } catch {
      return undefined;
    }
  }

  return undefined;
}
