/**
 * @jest-environment node
 */
import { resolveScheduledMode, partsInTz } from "../schedule";

// 2026-07-20 is a Monday; 10:00 and 20:00 UTC used for window checks.
const MON_10H = new Date("2026-07-20T10:00:00Z");
const MON_20H = new Date("2026-07-20T20:00:00Z");
const SAT_10H = new Date("2026-07-25T10:00:00Z");

const weekdays = { days: [1, 2, 3, 4, 5], start: "09:00", end: "18:00" };

describe("partsInTz", () => {
  it("computes ISO weekday and minutes in UTC", () => {
    expect(partsInTz(MON_10H, "UTC")).toEqual({ dow: 1, minutes: 600 });
    expect(partsInTz(SAT_10H, "UTC")).toEqual({ dow: 6, minutes: 600 });
  });
});

describe("resolveScheduledMode", () => {
  it("returns null when autoMode is off", () => {
    expect(resolveScheduledMode({ windows: [weekdays] }, MON_10H)).toBeNull();
    expect(resolveScheduledMode(undefined, MON_10H)).toBeNull();
  });

  it("is 'on' inside a weekday window", () => {
    expect(
      resolveScheduledMode({ autoMode: true, tz: "UTC", windows: [weekdays] }, MON_10H),
    ).toBe("on");
  });

  it("is 'off' outside the window hours", () => {
    expect(
      resolveScheduledMode({ autoMode: true, tz: "UTC", windows: [weekdays] }, MON_20H),
    ).toBe("off");
  });

  it("is 'off' on a day not covered by any window", () => {
    expect(
      resolveScheduledMode({ autoMode: true, tz: "UTC", windows: [weekdays] }, SAT_10H),
    ).toBe("off");
  });

  it("is 'off' when autoMode is on but no windows are defined", () => {
    expect(resolveScheduledMode({ autoMode: true, windows: [] }, MON_10H)).toBe("off");
  });
});
