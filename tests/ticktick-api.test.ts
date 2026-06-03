import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("electron", () => ({
  shell: {
    openExternal: vi.fn()
  }
}));

import { fetchTickTickProjectData } from "../src/main/ticktick";
import { defaultTickTickSyncSettings } from "../src/shared/types";

describe("TickTick OpenAPI sync", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("uses task filter data when project list is empty", async () => {
    const fetchMock = vi.fn(async (url: string | URL) => {
      if (String(url).endsWith("/open/v1/task/filter")) {
        return {
          ok: true,
          json: async () => [
            {
              id: "task-1",
              projectId: "project-1",
              title: "筛选接口任务",
              status: 0
            }
          ]
        };
      }

      throw new Error("project endpoint should not be called");
    });
    vi.stubGlobal("fetch", fetchMock);

    const data = await fetchTickTickProjectData({
      ...defaultTickTickSyncSettings(),
      accessToken: "token"
    });

    expect(data).toHaveLength(1);
    expect(data[0].tasks).toHaveLength(1);
    expect(data[0].tasks[0].title).toBe("筛选接口任务");
  });
});
