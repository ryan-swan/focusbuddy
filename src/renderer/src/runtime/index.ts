// @plexi/runtime — the minimal shared platform surface both apps need, kept
// deliberately small for the lean split: theme, the signal backend config, and
// the account/session store. The desk's DB, file manager, collaboration, and
// capabilities are NOT here — the standalone PlexiOffice app reaches documents
// through the cloud-documents API (see @plexi/office), not the desk platform.
//
// Like the office barrel, this is the import boundary: the PlexiOffice app shell
// consumes the runtime from here so the eventual package extraction is a matter
// of moving the alias target, not rewriting call sites.

export {
  useTheme,
  applyTheme,
  applyFont,
  loadTheme,
  type ThemeMode,
  type AccentColor,
  type FontChoice
} from '../lib/theme'

export { signalConfig } from '../lib/signalConfig'

export { useAccountStore } from '../stores/account'
