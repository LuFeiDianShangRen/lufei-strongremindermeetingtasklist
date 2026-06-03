import { describe, expect, it } from "vitest";
import { tickTickTaskToReminder } from "../src/shared/ticktick";

describe("ticktick task conversion", () => {
  it("converts a dated TickTick task into a local reminder", () => {
    const reminder = tickTickTaskToReminder(
      {
        id: "task-1",
        projectId: "project-1",
        title: "同步会议",
        dueDate: "2026-06-03T09:00:00+0800",
        repeatFlag: "RRULE:FREQ=WEEKLY;INTERVAL=1;BYDAY=MO,WE",
        status: 0
      },
      { id: "project-1", name: "工作" },
      [15],
      undefined,
      new Date("2026-06-03T00:00:00.000Z")
    );

    expect(reminder?.id).toBe("ticktick:project-1:task-1");
    expect(reminder?.title).toBe("同步会议");
    expect(reminder?.enabled).toBe(true);
    expect(reminder?.startAt).toBe("2026-06-03T01:00:00.000Z");
    expect(reminder?.recurrenceRule.frequency).toBe("weekly");
    expect(reminder?.recurrenceRule.weekdays).toEqual([1, 3]);
  });

  it("imports an undated task as disabled", () => {
    const reminder = tickTickTaskToReminder(
      {
        id: "task-2",
        projectId: "project-1",
        title: "无时间任务",
        status: 0
      },
      { id: "project-1", name: "工作" },
      [15],
      undefined,
      new Date("2026-06-03T08:20:00.000Z")
    );

    expect(reminder?.enabled).toBe(false);
    expect(reminder?.startAt).toBe("2026-06-03T09:00:00.000Z");
  });
});
