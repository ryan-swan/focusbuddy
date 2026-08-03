// Whether the user allows anonymous, aggregate usage reporting. This is the real
// switch behind the telemetry the app sends while signed in: the reporter checks
// it before every send, so turning it off actually stops the reporting (it
// previously did not, which contradicted the "no telemetry" promise). Default on,
// but now honestly disclosed and genuinely reversible.

const KEY = 'plexi.telemetry.enabled'

export function telemetryEnabled(): boolean {
  return localStorage.getItem(KEY) !== 'off'
}

export function setTelemetryEnabled(on: boolean): void {
  localStorage.setItem(KEY, on ? 'on' : 'off')
}
