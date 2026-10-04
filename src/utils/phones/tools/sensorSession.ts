// src/utils/phones/tools/sensorSession.ts
// Start/pause button state shared by the accelerometer and gyroscope tests.

export type SensorRunState = {
  started: boolean;
  /** Paused because fullscreen was left, or by the user. */
  paused: boolean;
  /** Permission or sensor start still in progress. */
  inFlight: boolean;
};

export type StartButtonView = {
  running: boolean;
  label: "Starting..." | "Pause" | "Resume" | "Start";
  disabled: boolean;
};

export function startButtonView({ started, paused, inFlight }: SensorRunState): StartButtonView {
  const running = started && !paused;
  return {
    running,
    disabled: inFlight,
    label: inFlight ? "Starting..." : running ? "Pause" : paused ? "Resume" : "Start",
  };
}

export function applyStartButton(button: HTMLElement | null, state: SensorRunState): void {
  if (!button) return;
  const view = startButtonView(state);
  button.classList.toggle("is-running", view.running);
  button.setAttribute("aria-pressed", String(view.running));
  button.toggleAttribute("disabled", view.disabled);
  button.textContent = view.label;
}
