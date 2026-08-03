// Electron-builder config for the PlexiDesk desktop app.
//
// This replaces the old static electron-builder.yml so macOS signing can be
// decided from the environment. Two modes:
//
//   1. NOTARISED (creds present): a build that has an Apple Developer ID cert in
//      the keychain (or via CSC_LINK/CSC_KEY_PASSWORD) AND the notarisation env
//      vars (APPLE_ID, APPLE_APP_SPECIFIC_PASSWORD, APPLE_TEAM_ID) signs with the
//      real Developer ID, turns on the Hardened Runtime, and notarises with
//      Apple. This is what makes a downloaded app open on a double-click with no
//      Gatekeeper block — the fix for the "bounces then hangs" report on macOS.
//
//   2. AD-HOC (no creds): falls back to the exact behaviour every release so far
//      shipped — identity:null so electron-builder skips signing, then the
//      afterPack hook ad-hoc signs (codesign --sign -). A credential-less build
//      is therefore byte-for-byte the same as before, so nothing breaks while we
//      wait on the Apple Developer account.
//
// appId stays app.haptyx.desktop on purpose: it is the OS/LaunchServices upgrade
// identity, so keeping it lets an existing Haptyx install upgrade IN PLACE to the
// renamed PlexiDesk build. Asset filenames stay "Haptyx-…" so the hardcoded
// auto-update URL in shipped clients keeps resolving across the rename.

const hasNotaryCreds =
  !!process.env.APPLE_TEAM_ID &&
  !!process.env.APPLE_ID &&
  !!process.env.APPLE_APP_SPECIFIC_PASSWORD

const macSigning = hasNotaryCreds
  ? {
      hardenedRuntime: true,
      gatekeeperAssess: false,
      // Auto-pick the "Developer ID Application" identity from the keychain (or
      // the cert electron-builder imports from CSC_LINK). CSC_NAME can pin an
      // exact identity string if more than one is present.
      identity: process.env.CSC_NAME || undefined,
      entitlements: 'build/entitlements.mac.plist',
      entitlementsInherit: 'build/entitlements.mac.plist',
      // electron-builder runs notarytool with these creds (read from env).
      notarize: { teamId: process.env.APPLE_TEAM_ID }
    }
  : {
      hardenedRuntime: false,
      gatekeeperAssess: false,
      // identity:null forces electron-builder to skip its signing path entirely;
      // afterPack then ad-hoc signs. `-` as an identity does NOT work (it is
      // treated as a keychain name and silently skipped). See build/adhoc-sign.cjs.
      identity: null
    }

/** @type {import('electron-builder').Configuration} */
module.exports = {
  appId: 'app.haptyx.desktop',
  productName: 'PlexiDesk',
  copyright: 'Copyright © 2026 PlexiDesk',
  artifactName: 'Haptyx-${version}-${os}-${arch}.${ext}',

  directories: {
    output: 'release',
    buildResources: 'build'
  },

  files: [
    'out/**/*',
    'package.json',
    '!**/node_modules/*/{CHANGELOG.md,README.md,readme.md}',
    '!**/*.{ts,tsx,map}'
  ],

  asarUnpack: [
    // Native modules must live outside the asar archive so Node can load them.
    'node_modules/better-sqlite3/**/*',
    'node_modules/node-mac-haptics/**/*',
    // pdf-parse resolves its pdfjs worker relative to its own dist on disk, which
    // asar packing would break — keep it unpacked so PDF text extraction works in
    // the packaged app (not just the unpacked dev build).
    'node_modules/pdf-parse/**/*',
    // Offline OCR for scanned PDFs. tesseract.js loads its worker script + WASM
    // core from disk, pdf-to-png-converter renders via @napi-rs/canvas (a native
    // .node addon) and its own pdfjs — all break inside an asar, so unpack them.
    'node_modules/tesseract.js/**/*',
    'node_modules/tesseract.js-core/**/*',
    'node_modules/pdf-to-png-converter/**/*',
    'node_modules/@napi-rs/**/*'
  ],

  // Bundle the English OCR training data (offline, on-device — no CDN fetch).
  // Copied into the app's Resources so ocr.ts can read it via process.resourcesPath.
  extraResources: [{ from: 'resources/tessdata', to: 'tessdata' }],

  publish: {
    provider: 'github',
    owner: 'saasmouth',
    repo: 'focusbuddy',
    releaseType: 'release'
  },

  protocols: [
    {
      name: 'Haptyx Protocol',
      schemes: ['haptyx'],
      role: 'Viewer'
    }
  ],

  mac: {
    category: 'public.app-category.productivity',
    // Plexii brand icon (build/icon.icns, generated from the wordmark). Replaces
    // the default Electron icon in the dock, Finder, and the dmg.
    icon: 'build/icon.icns',
    // Ship BOTH the zip (electron-updater reads it via latest-mac.yml) and a dmg
    // (what a new user downloads and double-clicks to install — and, unlike a raw
    // .app-in-.zip, a dmg does not get its code signature corrupted by the
    // browser download + Archive Utility unzip that caused the launch hang).
    target: [
      { target: 'zip', arch: ['arm64'] },
      { target: 'dmg', arch: ['arm64'] }
    ],
    // macOS permission strings. Without these in Info.plist macOS silently denies
    // getUserMedia for camera + microphone — the user never sees the system
    // prompt. NSCameraUsageDescription is what fixes the video-note capture.
    extendInfo: {
      NSMicrophoneUsageDescription:
        'PlexiDesk records voice notes that you choose to capture on your desk. Audio is processed locally (or sent to your configured transcription provider) and never proxied through PlexiDesk.',
      NSCameraUsageDescription:
        'PlexiDesk records video notes when you choose to capture them. Video and audio are stored locally and only transcribed via your configured provider.'
    },
    ...macSigning
  },

  // Ad-hoc sign the .app so macOS Apple Silicon will execute it — ONLY in the
  // no-creds fallback. With a real Developer ID + notarisation, electron-builder
  // signs properly and running the ad-hoc pass afterwards would stomp that
  // signature and break notarisation, so the hook is omitted in that mode.
  afterPack: hasNotaryCreds ? undefined : 'build/adhoc-sign.cjs',

  dmg: {
    title: 'PlexiDesk ${version}',
    iconSize: 96,
    contents: [
      { x: 130, y: 220, type: 'file' },
      { x: 410, y: 220, type: 'link', path: '/Applications' }
    ]
  },

  // ── Windows ────────────────────────────────────────────────────────────────
  // Produces an NSIS installer. MUST be built on a Windows runner (better-sqlite3
  // is compiled per-OS). Code signing via CSC_LINK + CSC_KEY_PASSWORD (unsigned
  // if unset; SmartScreen warns until signed with an OV/EV cert).
  win: {
    icon: 'build/icon.ico',
    target: [{ target: 'nsis', arch: ['x64'] }]
  },

  nsis: {
    oneClick: false,
    perMachine: false,
    allowToChangeInstallationDirectory: true,
    createDesktopShortcut: true,
    createStartMenuShortcut: true,
    shortcutName: 'PlexiDesk'
  },

  // Native modules are pre-rebuilt via `npm run rebuild`; the in-builder rebuild
  // hangs on node-mac-haptics.
  npmRebuild: false
}
