// src/utils/phones/tools/orientation.ts

export type OrientationAngle = 0 | 90 | 180 | 270;

function normalizeAngle(angle: number): OrientationAngle {
  const normalized = ((angle % 360) + 360) % 360;
  if (normalized === 90) return 90;
  if (normalized === 180) return 180;
  if (normalized === 270) return 270;
  return 0;
}

export function getScreenAngle(): OrientationAngle {
  if (typeof screen !== "undefined" && screen.orientation) {
    return normalizeAngle(screen.orientation.angle);
  }

  const legacy = (window as Window & { orientation?: number }).orientation;
  if (typeof legacy === "number") return normalizeAngle(-legacy);
  return 0;
}

export function remapDeviceAxes(
  x: number,
  y: number,
  angle: OrientationAngle,
): { x: number; y: number } {
  switch (angle) {
    case 90:
      return { x: -y, y: x };
    case 180:
      return { x: -x, y: -y };
    case 270:
      return { x: y, y: -x };
    default:
      return { x, y };
  }
}

export function onOrientationChange(callback: () => void): () => void {
  if (typeof screen !== "undefined" && screen.orientation) {
    const orientation = screen.orientation;
    orientation.addEventListener("change", callback);
    return () => orientation.removeEventListener("change", callback);
  }
  window.addEventListener("orientationchange", callback);
  return () => window.removeEventListener("orientationchange", callback);
}
