import type { DeviceClass } from '@shared/deskLayout'

// The device class of the current client, used to key the per-(user, Desk,
// device class) layout overlay (PLX-UX-032, ADR-0006). The Electron desktop app
// is always 'desktop'; the mobile PWA reports 'mobile'. 'tablet' is reserved for
// a future responsive client. Keyed layouts never cross classes, so a user's
// desktop arrangement is never overwritten by another form factor.
export function currentDeviceClass(): DeviceClass {
  return 'desktop'
}
