import type { CSSProperties } from "react";
import type { DeviceTypes } from "@/types";

type ResponsiveStyleMap = Partial<Record<Exclude<DeviceTypes, "Desktop">, CSSProperties>>;

type ExtendedStyles = CSSProperties & {
  __sbResponsive?: ResponsiveStyleMap;
};

const INTERNAL_KEYS = new Set(["__sbResponsive"]);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const sanitizeStyleObject = (style: CSSProperties | undefined): CSSProperties => {
  if (!isRecord(style)) return {};
  const next: CSSProperties = {};
  Object.entries(style).forEach(([key, value]) => {
    if (!INTERNAL_KEYS.has(key)) {
      (next as Record<string, unknown>)[key] = value;
    }
  });
  return next;
};

const normalizeResponsive = (styles: ExtendedStyles | CSSProperties | undefined): ResponsiveStyleMap => {
  const raw = (styles as ExtendedStyles | undefined)?.__sbResponsive;
  if (!isRecord(raw)) return {};

  const tablet = sanitizeStyleObject(raw.Tablet);
  const mobile = sanitizeStyleObject(raw.Mobile);

  const result: ResponsiveStyleMap = {};
  if (Object.keys(tablet).length > 0) result.Tablet = tablet;
  if (Object.keys(mobile).length > 0) result.Mobile = mobile;

  return result;
};

export const resolveResponsiveStyles = (
  styles: CSSProperties | undefined,
  device: DeviceTypes,
): CSSProperties => {
  const base = sanitizeStyleObject(styles);
  const responsive = normalizeResponsive(styles as ExtendedStyles | undefined);

  if (device === "Desktop") return base;
  if (device === "Tablet") return { ...base, ...(responsive.Tablet ?? {}) };

  return {
    ...base,
    ...(responsive.Tablet ?? {}),
    ...(responsive.Mobile ?? {}),
  };
};

const isEmpty = (value: string) => value.trim() === "";

export const setResponsiveStyle = (
  styles: CSSProperties | undefined,
  device: DeviceTypes,
  property: string,
  value: string,
): CSSProperties => {
  const base = sanitizeStyleObject(styles);
  const responsive = normalizeResponsive(styles as ExtendedStyles | undefined);

  if (device === "Desktop") {
    if (isEmpty(value)) {
      delete (base as Record<string, unknown>)[property];
    } else {
      (base as Record<string, unknown>)[property] = value;
    }
  } else {
    const bucket = { ...(responsive[device] ?? {}) } as CSSProperties;
    if (isEmpty(value)) {
      delete (bucket as Record<string, unknown>)[property];
    } else {
      (bucket as Record<string, unknown>)[property] = value;
    }

    if (Object.keys(bucket).length === 0) {
      delete responsive[device];
    } else {
      responsive[device] = bucket;
    }
  }

  if (Object.keys(responsive).length === 0) return base;

  return {
    ...base,
    __sbResponsive: responsive,
  } as ExtendedStyles;
};
