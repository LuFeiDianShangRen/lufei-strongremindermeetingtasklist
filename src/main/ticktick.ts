import { shell } from "electron";
import { randomUUID } from "node:crypto";
import { createServer, type Server } from "node:net";
import { TickTickProject, TickTickProjectData } from "../shared/ticktick";
import { TickTickService, TickTickSyncSettings } from "../shared/types";

const serviceHosts: Record<TickTickService, { auth: string; token: string; api: string }> = {
  dida365: {
    auth: "https://dida365.com/oauth/authorize",
    token: "https://dida365.com/oauth/token",
    api: "https://api.dida365.com"
  },
  ticktick: {
    auth: "https://ticktick.com/oauth/authorize",
    token: "https://ticktick.com/oauth/token",
    api: "https://api.ticktick.com"
  }
};

function assertSyncSettings(settings: TickTickSyncSettings): void {
  if (!settings.clientId.trim() || !settings.clientSecret.trim()) {
    throw new Error("请先填写 Client ID 和 Client Secret。");
  }
  if (!settings.redirectUri.trim()) {
    throw new Error("请先填写回调地址。");
  }

  const redirectUri = new URL(settings.redirectUri);
  if (redirectUri.protocol !== "http:" || !["127.0.0.1", "localhost"].includes(redirectUri.hostname)) {
    throw new Error("回调地址必须是本机 http 地址。");
  }
}

function closeServer(server: Server): void {
  try {
    server.close();
  } catch {
    // Server may already be closed.
  }
}

async function waitForAuthorizationCode(redirectUri: string, state: string): Promise<string> {
  const redirect = new URL(redirectUri);
  const port = Number(redirect.port || 80);
  const host = redirect.hostname;

  return new Promise((resolve, reject) => {
    let server: Server | null = null;
    const timer = setTimeout(() => {
      if (server) {
        closeServer(server);
      }
      reject(new Error("授权超时，请重新连接滴答清单。"));
    }, 120_000);

    server = createServer((socket) => {
      socket.once("data", (buffer) => {
        const requestLine = buffer.toString("utf8").split("\n")[0] ?? "";
        const path = requestLine.split(" ")[1] ?? "/";
        const url = new URL(path, `${redirect.protocol}//${redirect.host}`);
        let body = "滴答清单授权完成，可以关闭这个页面。";
        let status = "200 OK";

        if (url.pathname !== redirect.pathname) {
          status = "404 Not Found";
          body = "授权地址不匹配。";
        } else if (url.searchParams.get("state") !== state) {
          status = "400 Bad Request";
          body = "授权状态不匹配，请重新连接。";
        } else {
          const code = url.searchParams.get("code");
          if (code) {
            clearTimeout(timer);
            if (server) {
              closeServer(server);
            }
            resolve(code);
          } else {
            status = "400 Bad Request";
            body = "授权失败，未收到 code。";
          }
        }

        socket.end(
          `HTTP/1.1 ${status}\r\nContent-Type: text/html; charset=utf-8\r\nConnection: close\r\n\r\n<!doctype html><html><body>${body}</body></html>`
        );
      });
    });

    server.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    server.listen(port, host);
  });
}

export async function authorizeTickTick(settings: TickTickSyncSettings): Promise<string> {
  assertSyncSettings(settings);

  const hosts = serviceHosts[settings.service];
  const state = randomUUID();
  const authorizeUrl = new URL(hosts.auth);
  authorizeUrl.searchParams.set("scope", "tasks:read");
  authorizeUrl.searchParams.set("client_id", settings.clientId.trim());
  authorizeUrl.searchParams.set("state", state);
  authorizeUrl.searchParams.set("redirect_uri", settings.redirectUri.trim());
  authorizeUrl.searchParams.set("response_type", "code");

  const codePromise = waitForAuthorizationCode(settings.redirectUri.trim(), state);
  await shell.openExternal(authorizeUrl.toString());
  const code = await codePromise;
  const response = await fetch(hosts.token, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${settings.clientId.trim()}:${settings.clientSecret.trim()}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: new URLSearchParams({
      code,
      grant_type: "authorization_code",
      scope: "tasks:read",
      redirect_uri: settings.redirectUri.trim()
    })
  });

  if (!response.ok) {
    throw new Error(`授权换取 token 失败：HTTP ${response.status}`);
  }

  const data = (await response.json()) as { access_token?: string };
  if (!data.access_token) {
    throw new Error("授权成功但未返回 access_token。");
  }

  return data.access_token;
}

async function tickTickJson<T>(settings: TickTickSyncSettings, path: string, init?: RequestInit): Promise<T> {
  if (!settings.accessToken) {
    throw new Error("请先连接滴答清单。");
  }

  const response = await fetch(`${serviceHosts[settings.service].api}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${settings.accessToken}`,
      ...init?.headers
    }
  });

  if (!response.ok) {
    throw new Error(`滴答清单同步失败：HTTP ${response.status}`);
  }

  return (await response.json()) as T;
}

export async function fetchTickTickProjectData(settings: TickTickSyncSettings): Promise<TickTickProjectData[]> {
  try {
    const tasks = await tickTickJson<TickTickProjectData["tasks"]>(settings, "/open/v1/task/filter", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        status: [0]
      })
    });

    if (tasks.length > 0) {
      return [
        {
          project: {
            id: "ticktick-filter",
            name: settings.service === "dida365" ? "滴答清单" : "TickTick",
            kind: "TASK"
          },
          tasks
        }
      ];
    }
  } catch {
    // Older OpenAPI docs did not always expose task filtering; fall back to project data.
  }

  const projects = await tickTickJson<TickTickProject[]>(settings, "/open/v1/project");
  const openProjects = projects.filter((project) => !project.closed && (!project.kind || project.kind.toUpperCase() === "TASK"));
  return Promise.all(
    openProjects.map((project) =>
      tickTickJson<TickTickProjectData>(settings, `/open/v1/project/${encodeURIComponent(project.id)}/data`)
    )
  );
}
