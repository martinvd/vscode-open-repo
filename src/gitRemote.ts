import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

/** Resolves `git.path` (string or string[]) from the Git extension; otherwise `"git"`. */
export function gitExecutableFromConfig(gitPath: unknown): string {
  if (typeof gitPath === "string" && gitPath.trim()) return gitPath.trim();
  if (Array.isArray(gitPath)) {
    for (const entry of gitPath) {
      if (typeof entry === "string" && entry.trim()) return entry.trim();
    }
  }
  return "git";
}

async function gitOutput(cwd: string, args: string[], gitPath: string): Promise<string | undefined> {
  try {
    const { stdout } = await execFileAsync(gitPath, ["-C", cwd, ...args], {
      encoding: "utf8",
      maxBuffer: 1024 * 1024,
    });
    const s = stdout.trim();
    return s || undefined;
  } catch {
    return undefined;
  }
}

export async function getGitRoot(workspaceFolder: string, gitPath = "git"): Promise<string | undefined> {
  return gitOutput(workspaceFolder, ["rev-parse", "--show-toplevel"], gitPath);
}

/** Uses `origin` if present, otherwise the first remote from `git remote`. */
export async function getRemoteUrl(root: string, gitPath = "git"): Promise<string | undefined> {
  const origin = await gitOutput(root, ["remote", "get-url", "origin"], gitPath);
  if (origin) return origin;
  const list = await gitOutput(root, ["remote"], gitPath);
  if (!list) return undefined;
  const first = list
    .split("\n")
    .map((l) => l.trim())
    .find(Boolean);
  if (!first) return undefined;
  return gitOutput(root, ["remote", "get-url", first], gitPath);
}

function stripGitSuffix(p: string): string {
  return p.replace(/\.git$/i, "") || p;
}

function repoPathFromUrlPathname(pathname: string): string {
  return stripGitSuffix(pathname.replace(/^\/+/, ""));
}

/** HTTPS origin for a browser URL. SSH ports must not be copied here. */
function httpsOrigin(hostname: string, port?: string): string {
  if (port && port !== "443") {
    return `https://${hostname}:${port}`;
  }
  return `https://${hostname}`;
}

/**
 * True for github.com, GitHub Enterprise Cloud (`*.github.com`, `*.ghe.com`),
 * common GHES hostnames (`github.*`), or configured Enterprise Server hosts.
 */
export function isGithubHost(hostname: string, enterpriseHosts: readonly string[] = []): boolean {
  const h = hostname.toLowerCase();
  if (h === "github.com" || h === "www.github.com") return true;
  if (h.endsWith(".github.com")) return true;
  if (h === "ghe.com" || h.endsWith(".ghe.com")) return true;
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

function webUrlFromParsed(
  hostname: string,
  pathname: string,
  githubEnterpriseHosts: readonly string[],
  httpsPort?: string,
): string | undefined {
  const host = hostname.toLowerCase();
  if (!host || !isSupportedHost(host, githubEnterpriseHosts)) return undefined;
  const repoPath = repoPathFromUrlPathname(pathname);
  if (!repoPath) return undefined;
  return `${httpsOrigin(host, httpsPort)}/${repoPath}`;
}

/** Converts a git remote URL to an HTTPS repo URL, or `undefined` if unsupported. */
export function remoteToWebUrl(
  remote: string,
  githubEnterpriseHosts: readonly string[] = [],
): string | undefined {
  const trimmed = remote.trim();
  if (!trimmed) return undefined;

  // Scheme URLs first. `ssh://git@host:port/path` must not be parsed as SCP
  // (`user@host:path`), which would treat the SSH port as the repo path.
  if (/^(?:git\+)?https?:\/\//i.test(trimmed)) {
    try {
      const u = new URL(trimmed.replace(/^git\+/i, ""));
      return webUrlFromParsed(u.hostname, u.pathname, githubEnterpriseHosts, u.port);
    } catch {
      return undefined;
    }
  }

  if (/^(?:git\+)?ssh:\/\//i.test(trimmed) || /^git:\/\//i.test(trimmed)) {
    try {
      const u = new URL(trimmed.replace(/^git\+/i, ""));
      return webUrlFromParsed(u.hostname, u.pathname, githubEnterpriseHosts);
    } catch {
      return undefined;
    }
  }

  const scp = trimmed.match(/^[^@\s]+@([^:]+):(.+)$/);
  if (scp) {
    return webUrlFromParsed(scp[1], scp[2], githubEnterpriseHosts);
  }

  return undefined;
}
