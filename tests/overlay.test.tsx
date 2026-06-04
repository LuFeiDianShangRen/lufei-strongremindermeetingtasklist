// @vitest-environment jsdom
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AlertOccurrence } from "../src/shared/types";

describe("overlay alert", () => {
  let onOverlayAlert: ((alert: AlertOccurrence) => void) | null;
  let acknowledgeOverlay: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.resetModules();
    document.body.innerHTML = '<div id="overlay-root"></div>';
    onOverlayAlert = null;
    acknowledgeOverlay = vi.fn();

    Object.defineProperty(window, "reminderApi", {
      configurable: true,
      value: {
        onOverlayAlert: vi.fn((callback: (alert: AlertOccurrence) => void) => {
          onOverlayAlert = callback;
          return () => undefined;
        }),
        acknowledgeOverlay,
        setOverlayInteractive: vi.fn()
      }
    });
  });

  afterEach(() => {
    document.body.innerHTML = "";
    vi.restoreAllMocks();
  });

  it("acknowledges immediately when the action button is pressed", async () => {
    await act(async () => {
      await import("../src/overlay/overlay");
    });

    await act(async () => {
      onOverlayAlert?.({
        key: "alert-1",
        itemId: "item-1",
        title: "测试任务",
        description: "",
        occurrenceAt: "2026-06-04T10:00:00.000Z",
        remindAt: "2026-06-04T09:50:00.000Z",
        leadMinutes: 10
      });
    });

    const button = document.querySelector<HTMLButtonElement>(".ack-button");
    expect(button?.textContent).toBe("我马上去做");

    await act(async () => {
      button?.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    });

    expect(acknowledgeOverlay).toHaveBeenCalledTimes(1);
    expect(acknowledgeOverlay).toHaveBeenCalledWith("alert-1");
  });
});
