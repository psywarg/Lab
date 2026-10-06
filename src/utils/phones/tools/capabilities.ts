// src/utils/phones/tools/capabilities.ts

export type MediaErrorKind =
  | "permission-denied"
  | "device-not-found"
  | "device-unavailable"
  | "insecure-origin"
  | "unsupported"
  | "unknown";

export type MediaErrorDescription = {
  kind: MediaErrorKind;
  message: string;
};

export function isSecureOrigin(): boolean {
  return typeof window !== "undefined" && window.isSecureContext;
}

export function describeMediaError(error: unknown): MediaErrorDescription {
  if (!isSecureOrigin()) {
    return {
      kind: "insecure-origin",
      message:
        "This page needs to be loaded over HTTPS for the browser to allow microphone access.",
    };
  }

  if (error instanceof DOMException) {
    switch (error.name) {
      case "NotAllowedError":
      case "SecurityError":
        return {
          kind: "permission-denied",
          message:
            "Microphone access was denied. Allow it in the browser's site settings and reload.",
        };
      case "NotFoundError":
        return {
          kind: "device-not-found",
          message: "No microphone was found on this device.",
        };
      case "NotReadableError":
        return {
          kind: "device-unavailable",
          message:
            "The microphone is in use by another app or tab. Close it and try again.",
        };
      case "OverconstrainedError":
        return {
          kind: "unsupported",
          message:
            "No microphone on this device matches the requested settings.",
        };
      default:
        return { kind: "unknown", message: `Microphone error: ${error.name}.` };
    }
  }

  return {
    kind: "unknown",
    message: "Permission denied or microphone unavailable.",
  };
}

export type BrowserCapabilities = {
  secureContext: boolean;
  genericSensor: boolean;
  deviceMotion: boolean;
  deviceOrientation: boolean;
  motionPermissionGate: boolean;
  wakeLock: boolean;
  getUserMedia: boolean;
  mediaRecorder: boolean;
  stereoPanner: boolean;
  oklch: boolean;
  permissionsQuery: boolean;
  suggestedBrowser: string | null;
};

let cached: BrowserCapabilities | null = null;

export function getBrowserCapabilities(): BrowserCapabilities {
  if (cached) return cached;

  const win = window as Window & {
    Accelerometer?: unknown;
    Gyroscope?: unknown;
  };
  const motionCtor = window.DeviceMotionEvent as
    | (typeof DeviceMotionEvent & {
        requestPermission?: () => Promise<"granted" | "denied">;
      })
    | undefined;

  const ua = navigator.userAgent;
  const isChromiumUA =
    /Chrome|Chromium|CriOS|Edg\//.test(ua) && !/OPR\//.test(ua);
  const isFirefoxUA = /Firefox|FxiOS/.test(ua);
  const isIOS = /iPhone|iPad|iPod/.test(ua);

  let suggestedBrowser: string | null = null;
  if (!("Accelerometer" in win) && !isChromiumUA) {
    suggestedBrowser = isIOS
      ? null
      : isFirefoxUA
        ? "Chrome on Android"
        : "Chrome";
  }

  cached = {
    secureContext: isSecureOrigin(),
    genericSensor: "Accelerometer" in win && "Gyroscope" in win,
    deviceMotion: "DeviceMotionEvent" in window,
    deviceOrientation: "DeviceOrientationEvent" in window,
    motionPermissionGate: typeof motionCtor?.requestPermission === "function",
    wakeLock: "wakeLock" in navigator,
    getUserMedia: typeof navigator.mediaDevices?.getUserMedia === "function",
    mediaRecorder: "MediaRecorder" in window,
    stereoPanner:
      typeof AudioContext !== "undefined" &&
      typeof AudioContext.prototype.createStereoPanner === "function",
    oklch:
      typeof CSS !== "undefined" &&
      CSS.supports("color", "oklch(50% 0.1 180)") &&
      CSS.supports("background", "linear-gradient(90deg in oklch, red, blue)"),
    permissionsQuery: typeof navigator.permissions?.query === "function",
    suggestedBrowser,
  };

  return cached;
}

export type SensorPermissionReason =
  "insecure-origin" | "denied" | "unsupported";

export type SensorPermissionResult =
  { granted: true } | { granted: false; reason: SensorPermissionReason };

type PermissionGatedEventCtor = {
  requestPermission?: () => Promise<"granted" | "denied">;
};

async function requestGatedSensorPermission(
  ctor: PermissionGatedEventCtor | undefined,
): Promise<SensorPermissionResult> {
  if (!isSecureOrigin()) return { granted: false, reason: "insecure-origin" };
  if (!ctor) return { granted: false, reason: "unsupported" };
  if (typeof ctor.requestPermission !== "function") {
    return { granted: true };
  }
  try {
    const state = await ctor.requestPermission();
    return state === "granted"
      ? { granted: true }
      : { granted: false, reason: "denied" };
  } catch {
    return { granted: false, reason: "denied" };
  }
}

export function requestMotionPermission(): Promise<SensorPermissionResult> {
  const ctor =
    "DeviceMotionEvent" in window
      ? (window.DeviceMotionEvent as typeof DeviceMotionEvent &
          PermissionGatedEventCtor)
      : undefined;
  return requestGatedSensorPermission(ctor);
}

export function requestOrientationPermission(): Promise<SensorPermissionResult> {
  const ctor =
    "DeviceOrientationEvent" in window
      ? (window.DeviceOrientationEvent as typeof DeviceOrientationEvent &
          PermissionGatedEventCtor)
      : undefined;
  return requestGatedSensorPermission(ctor);
}

export type MotionPermissionState = "granted" | "denied" | "prompt" | "unknown";

export async function getMotionPermissionState(): Promise<MotionPermissionState> {
  if (typeof navigator === "undefined" || !navigator.permissions?.query) {
    return "unknown";
  }
  try {
    const status = await navigator.permissions.query({
      name: "accelerometer" as PermissionName,
    });
    return status.state;
  } catch {
    return "unknown";
  }
}

export function describeSensorUnavailability(
  reason: SensorPermissionReason,
  options?: { permanentlyDenied?: boolean },
): string {
  if (reason === "insecure-origin") {
    return "This page needs to be loaded over HTTPS for the browser to allow motion sensor access.";
  }
  if (reason === "unsupported") {
    return "This browser does not expose motion sensor data on this device.";
  }
  return options?.permanentlyDenied
    ? "Motion access is blocked for this site. Re-enable it in Settings → Safari → Motion & Orientation Access (or the browser's site settings) and reload."
    : "Motion access was denied. Allow it when prompted and try again.";
}
