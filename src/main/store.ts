import { app } from "electron";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { ACKNOWLEDGE_SNOOZE_MINUTES } from "../shared/scheduler";
import {
  AlertOccurrence,
  AlertRecord,
  AppData,
  AppSettings,
  defaultSettings,
  ReminderItem
} from "../shared/types";

export class ReminderStore {
  private readonly filePath: string;
  private data: AppData | null = null;

  constructor(filePath = join(app.getPath("userData"), "reminders.json")) {
    this.filePath = filePath;
  }

  async load(): Promise<AppData> {
    if (this.data) {
      return this.data;
    }

    try {
      const raw = await readFile(this.filePath, "utf8");
      this.data = this.normalize(JSON.parse(raw));
    } catch {
      this.data = {
        version: 1,
        reminders: [],
        alerts: {},
        settings: defaultSettings()
      };
      await this.save();
    }

    return this.data;
  }

  async replace(data: AppData): Promise<AppData> {
    this.data = this.normalize(data);
    await this.save();
    return this.data;
  }

  async getData(): Promise<AppData> {
    return this.load();
  }

  async upsertReminder(item: ReminderItem): Promise<AppData> {
    const data = await this.load();
    const index = data.reminders.findIndex((existing) => existing.id === item.id);
    const nextItem = { ...item, updatedAt: new Date().toISOString() };

    if (index >= 0) {
      data.reminders[index] = nextItem;
    } else {
      data.reminders.push(nextItem);
    }

    await this.save();
    return data;
  }

  async upsertReminders(items: ReminderItem[]): Promise<{ data: AppData; imported: number; updated: number }> {
    const data = await this.load();
    let imported = 0;
    let updated = 0;

    for (const item of items) {
      const index = data.reminders.findIndex((existing) => existing.id === item.id);
      const nextItem = { ...item, updatedAt: new Date().toISOString() };

      if (index >= 0) {
        data.reminders[index] = nextItem;
        updated += 1;
      } else {
        data.reminders.push(nextItem);
        imported += 1;
      }
    }

    await this.save();
    return { data, imported, updated };
  }

  async deleteReminder(id: string): Promise<AppData> {
    const data = await this.load();
    data.reminders = data.reminders.filter((item) => item.id !== id);

    for (const key of Object.keys(data.alerts)) {
      if (data.alerts[key].itemId === id) {
        delete data.alerts[key];
      }
    }

    await this.save();
    return data;
  }

  async updateSettings(settings: AppSettings): Promise<AppData> {
    const data = await this.load();
    data.settings = {
      ...data.settings,
      ...settings
    };
    await this.save();
    return data;
  }

  async markAlertShown(alert: AlertOccurrence): Promise<AppData> {
    const data = await this.load();
    const now = new Date().toISOString();
    const existing = data.alerts[alert.key];

    data.alerts[alert.key] = {
      key: alert.key,
      itemId: alert.itemId,
      occurrenceAt: alert.occurrenceAt,
      remindAt: alert.remindAt,
      leadMinutes: alert.leadMinutes,
      triggeredAt: existing?.triggeredAt ?? now,
      lastShownAt: now,
      confirmedAt: existing?.confirmedAt ?? null,
      snoozedUntil:
        existing?.snoozedUntil && new Date(existing.snoozedUntil).getTime() > Date.now()
          ? existing.snoozedUntil
          : null
    };

    await this.save();
    return data;
  }

  async acknowledgeAlert(key: string): Promise<AlertRecord | null> {
    const data = await this.load();
    const existing = data.alerts[key];

    if (!existing) {
      return null;
    }

    const now = new Date();
    existing.lastShownAt = now.toISOString();
    existing.confirmedAt = null;
    existing.snoozedUntil = new Date(now.getTime() + ACKNOWLEDGE_SNOOZE_MINUTES * 60 * 1_000).toISOString();
    await this.save();
    return existing;
  }

  async setLastSchedulerCheck(value: string): Promise<void> {
    const data = await this.load();
    data.settings.lastSchedulerCheckAt = value;
    await this.save();
  }

  async save(): Promise<void> {
    if (!this.data) {
      return;
    }

    await mkdir(dirname(this.filePath), { recursive: true });
    const tempPath = `${this.filePath}.tmp`;
    await writeFile(tempPath, `${JSON.stringify(this.data, null, 2)}\n`, "utf8");
    await rename(tempPath, this.filePath);
  }

  private normalize(value: Partial<AppData>): AppData {
    const settings = {
      ...defaultSettings(),
      ...value.settings,
      holidayOverrides: {
        ...defaultSettings().holidayOverrides,
        ...value.settings?.holidayOverrides
      },
      tickTickSync: {
        ...defaultSettings().tickTickSync,
        ...value.settings?.tickTickSync
      }
    };

    return {
      version: 1,
      reminders: Array.isArray(value.reminders) ? value.reminders : [],
      alerts: value.alerts ?? {},
      settings
    };
  }
}
