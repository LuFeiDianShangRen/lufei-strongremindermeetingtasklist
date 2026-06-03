import {
  defaultHolidayPolicy,
  defaultRecurrenceRule,
  LEAD_MINUTES,
  LeadMinutes,
  RecurrenceFrequency,
  ReminderItem
} from "./types";

export interface TickTickProject {
  id: string;
  name: string;
  closed?: boolean;
  kind?: string;
}

export interface TickTickTask {
  id: string;
  projectId: string;
  title?: string;
  content?: string;
  desc?: string;
  startDate?: string | null;
  dueDate?: string | null;
  repeatFlag?: string | null;
  tags?: string[];
  status?: number;
  completedTime?: string | null;
}

export interface TickTickProjectData {
  project: TickTickProject;
  tasks: TickTickTask[];
}

const byDayMap: Record<string, number> = {
  SU: 0,
  MO: 1,
  TU: 2,
  WE: 3,
  TH: 4,
  FR: 5,
  SA: 6
};

function nextHourIso(now: Date): string {
  const date = new Date(now);
  date.setMinutes(0, 0, 0);
  date.setHours(date.getHours() + 1);
  return date.toISOString();
}

function parseTickTickDate(value?: string | null): string | null {
  if (!value) {
    return null;
  }

  const normalized = value.replace(/([+-]\d{2})(\d{2})$/, "$1:$2");
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function parseNumberList(value: string | undefined, min: number, max: number): number[] {
  if (!value) {
    return [];
  }

  return value
    .split(",")
    .map((part) => Number(part.trim()))
    .filter((number) => Number.isInteger(number) && number >= min && number <= max);
}

function parseRepeatFlag(value?: string | null): ReminderItem["recurrenceRule"] {
  const rule = defaultRecurrenceRule();
  if (!value?.startsWith("RRULE:")) {
    return rule;
  }

  const pairs = new Map(
    value
      .replace(/^RRULE:/, "")
      .split(";")
      .map((part) => {
        const [key, raw = ""] = part.split("=");
        return [key.toUpperCase(), raw] as const;
      })
  );
  const frequencyMap: Record<string, RecurrenceFrequency> = {
    DAILY: "daily",
    WEEKLY: "weekly",
    MONTHLY: "monthly",
    YEARLY: "yearly"
  };
  const frequency = frequencyMap[pairs.get("FREQ") ?? ""];

  if (!frequency) {
    return rule;
  }

  rule.frequency = frequency;
  rule.interval = Math.max(1, Number(pairs.get("INTERVAL") ?? 1) || 1);
  rule.weekdays = (pairs.get("BYDAY") ?? "")
    .split(",")
    .map((day) => byDayMap[day.trim().slice(-2).toUpperCase()])
    .filter((day): day is number => Number.isInteger(day));
  rule.monthDays = parseNumberList(pairs.get("BYMONTHDAY"), 1, 31);
  rule.months = parseNumberList(pairs.get("BYMONTH"), 1, 12);
  rule.count = pairs.has("COUNT") ? Math.max(1, Number(pairs.get("COUNT")) || 1) : null;

  const until = parseTickTickDate(pairs.get("UNTIL"));
  rule.endDate = until ? until.slice(0, 10) : null;
  return rule;
}

function normalizeLeadMinutes(value: LeadMinutes[]): LeadMinutes[] {
  const allowed = new Set<number>(LEAD_MINUTES);
  const result = value.filter((minute) => allowed.has(minute));
  return result.length ? result : [15];
}

export function tickTickTaskToReminder(
  task: TickTickTask,
  project: TickTickProject,
  defaultLeadMinutes: LeadMinutes[],
  existing: ReminderItem | undefined,
  now = new Date()
): ReminderItem | null {
  if (!task.id || !task.projectId) {
    return null;
  }

  const nowIso = now.toISOString();
  const startAt = parseTickTickDate(task.dueDate) ?? parseTickTickDate(task.startDate);
  const completedAt = task.status === 2 ? parseTickTickDate(task.completedTime) ?? nowIso : null;
  const description = [
    task.content?.trim(),
    task.desc?.trim(),
    `来源：滴答清单 / ${project.name || "未命名清单"}`,
    task.tags?.length ? `标签：${task.tags.join(", ")}` : null
  ]
    .filter(Boolean)
    .join("\n");

  return {
    id: `ticktick:${task.projectId}:${task.id}`,
    title: task.title?.trim() || "滴答清单任务",
    description,
    startAt: startAt ?? existing?.startAt ?? nextHourIso(now),
    leadMinutes: normalizeLeadMinutes(defaultLeadMinutes),
    recurrenceRule: parseRepeatFlag(task.repeatFlag),
    holidayPolicy: existing?.holidayPolicy ?? defaultHolidayPolicy(),
    enabled: Boolean(startAt) && task.status !== 2,
    completedAt,
    createdAt: existing?.createdAt ?? nowIso,
    updatedAt: nowIso
  };
}
