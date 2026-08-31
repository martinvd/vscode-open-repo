import { describe, expect, test } from "bun:test";
import { gitExecutableFromConfig, isGithubHost, remoteToWebUrl } from "./gitRemote";

describe("gitExecutableFromConfig", () => {
  test("uses git.path string or first non-empty array entry", () => {
    expect(gitExecutableFromConfig(undefined)).toBe("git");
    expect(gitExecutableFromConfig("")).toBe("git");
    expect(gitExecutableFromConfig("/opt/homebrew/bin/git")).toBe("/opt/homebrew/bin/git");
    expect(gitExecutableFromConfig(["", "  /usr/bin/git  "])).toBe("/usr/bin/git");
  });
});

describe("isGithubHost", () => {
  test("github.com and www", () => {
    expect(isGithubHost("github.com")).toBe(true);
    expect(isGithubHost("GitHub.COM")).toBe(true);
    expect(isGithubHost("www.github.com")).toBe(true);
  });

  test("GitHub Enterprise Cloud hostnames", () => {
    expect(isGithubHost("acme.github.com")).toBe(true);
    expect(isGithubHost("octocorp.ghe.com")).toBe(true);
    expect(isGithubHost("ghe.com")).toBe(true);
  });

  test("common GHES github.* hostnames", () => {
    expect(isGithubHost("github.company.com")).toBe(true);
    expect(isGithubHost("github.internal")).toBe(true);
  });

  test("configured Enterprise Server hosts", () => {
    expect(isGithubHost("git.company.com")).toBe(false);
    expect(isGithubHost("git.company.com", ["git.company.com"])).toBe(true);
    expect(isGithubHost("git.company.com", ["  GIT.Company.COM  "])).toBe(true);
    expect(isGithubHost("git.company.com", ["other.example"])).toBe(false);
  });

  test("non-GitHub hosts", () => {
    expect(isGithubHost("gitlab.com")).toBe(false);
    expect(isGithubHost("bitbucket.org")).toBe(false);
  });
});

describe("remoteToWebUrl", () => {
  test("github.com HTTPS and SCP", () => {
    expect(remoteToWebUrl("https://github.com/acme/app.git")).toBe("https://github.com/acme/app");
    expect(remoteToWebUrl("git@github.com:acme/app.git")).toBe("https://github.com/acme/app");
    expect(remoteToWebUrl("ssh://git@github.com/acme/app.git")).toBe("https://github.com/acme/app");
  });

  test("GitHub Enterprise Cloud ghe.com (including subdomain SSH user)", () => {
    expect(remoteToWebUrl("https://octocorp.ghe.com/acme/app.git")).toBe(
      "https://octocorp.ghe.com/acme/app",
    );
    expect(remoteToWebUrl("octocorp@octocorp.ghe.com:acme/app.git")).toBe(
      "https://octocorp.ghe.com/acme/app",
    );
  });

  test("GHES github.company.com without extra config", () => {
    expect(remoteToWebUrl("git@github.company.com:org/repo.git")).toBe(
      "https://github.company.com/org/repo",
    );
    expect(remoteToWebUrl("https://github.company.com/org/repo")).toBe(
      "https://github.company.com/org/repo",
    );
  });

  test("custom GHES hostname requires config", () => {
    const remote = "git@git.company.com:org/repo.git";
    expect(remoteToWebUrl(remote)).toBeUndefined();
    expect(remoteToWebUrl(remote, ["git.company.com"])).toBe("https://git.company.com/org/repo");
    expect(remoteToWebUrl("https://git.company.com/org/repo.git", ["git.company.com"])).toBe(
      "https://git.company.com/org/repo",
    );
  });

  test("ssh:// with a custom port is not parsed as SCP (port is not a path segment)", () => {
    expect(remoteToWebUrl("ssh://git@github.company.com:22/org/repo.git")).toBe(
      "https://github.company.com/org/repo",
    );
    expect(remoteToWebUrl("ssh://git@git.company.com:122/org/repo.git", ["git.company.com"])).toBe(
      "https://git.company.com/org/repo",
    );
  });

  test("HTTPS remotes keep a non-default web port", () => {
    expect(remoteToWebUrl("https://git.company.com:8443/org/repo.git", ["git.company.com"])).toBe(
      "https://git.company.com:8443/org/repo",
    );
    expect(remoteToWebUrl("https://github.com:443/acme/app.git")).toBe("https://github.com/acme/app");
  });

  test("HTTPS remotes strip credentials", () => {
    expect(remoteToWebUrl("https://user:token@github.company.com/org/repo.git")).toBe(
      "https://github.company.com/org/repo",
    );
  });

  test("nested groups and gitlab still work", () => {
    expect(remoteToWebUrl("git@gitlab.com:group/sub/repo.git")).toBe(
      "https://gitlab.com/group/sub/repo",
    );
    expect(remoteToWebUrl("https://gitlab.company.com/group/repo.git")).toBe(
      "https://gitlab.company.com/group/repo",
    );
  });

  test("unsupported remotes", () => {
    expect(remoteToWebUrl("")).toBeUndefined();
    expect(remoteToWebUrl("git@bitbucket.org:org/repo.git")).toBeUndefined();
    expect(remoteToWebUrl("https://example.com/org/repo.git")).toBeUndefined();
  });
});
