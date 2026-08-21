// Plexii iconography — original brand icon set (43 marks).
// Source of truth: professional-brain/02-work/plexidesk/brand/01-knowledge/brand-assets/icons/
// (one SVG per icon; this file mirrors their inner markup verbatim).
// Drawn on a 24px grid, 1.75 stroke, round caps/joins, fill none, currentColor.
// Rendered by <Icon>: a name in PLEXII_BY_MATERIAL swaps the Material glyph
// app-wide; a 'plexii:<name>' name opts a single call site in explicitly
// (used where the Material name is ambiguous, e.g. lock/dashboard/grid_view/palette/draw).

export const PLEXII_ICONS: Record<string, string> = {
  'home':
    '<path d="M3.75 11.25 12 4.5l8.25 6.75"/><path d="M5.75 9.75V17.5A2.5 2.5 0 0 0 8.25 20h7.5a2.5 2.5 0 0 0 2.5-2.5V9.75"/><path d="M12 20v-4.25"/>',
  'desks':
    '<rect x="3.5" y="4.5" width="17" height="15" rx="2.5"/><rect x="6.75" y="7.75" width="4.5" height="4.5" rx="1.25"/><path d="M14.5 8.75h2.75M14.5 11.5h2.75M6.75 15.75h10.5"/>',
  'rooms':
    '<rect x="3.5" y="4.5" width="17" height="15" rx="2.5"/><path d="M12 4.5v6.5M12 11h8.5"/>',
  'docs':
    '<path d="M13.2 3.5H8A2.5 2.5 0 0 0 5.5 6v12A2.5 2.5 0 0 0 8 20.5h8a2.5 2.5 0 0 0 2.5-2.5V8.8c0-.4-.16-.78-.44-1.06l-3.8-3.8a1.5 1.5 0 0 0-1.06-.44Z"/><path d="M13.5 3.8v3.7A1.5 1.5 0 0 0 15 9h3.7"/><path d="M9 13.5h6M9 16.5h4"/>',
  'brain':
    '<rect x="4.5" y="4.5" width="15" height="15" rx="3"/><path d="M10.3 11.5v4.25M13.7 11.5v4.25"/><path d="M10.3 8.35v.01M13.7 8.35v.01"/>',
  'people':
    '<circle cx="9" cy="8.75" r="3.25"/><path d="M3.75 19.5c0-2.9 2.35-5.25 5.25-5.25s5.25 2.35 5.25 5.25"/><path d="M15.4 5.85a3.25 3.25 0 0 1 0 5.8"/><path d="M16.8 14.6c2.05.75 3.45 2.7 3.45 4.9"/>',
  'chat':
    '<path d="M4.5 19.5V8A3.5 3.5 0 0 1 8 4.5h8A3.5 3.5 0 0 1 19.5 8v4.25a3.5 3.5 0 0 1-3.5 3.5H8.75L4.5 19.5Z"/><path d="M9 9.25h6M9 12.25h3.5"/>',
  'files':
    '<path d="M3.5 17V6.5a2 2 0 0 1 2-2h3.6a2 2 0 0 1 1.6.8l.9 1.2a2 2 0 0 0 1.6.8H18a2.5 2.5 0 0 1 2.5 2.5V17a2.5 2.5 0 0 1-2.5 2.5H6A2.5 2.5 0 0 1 3.5 17Z"/>',
  'agents':
    '<circle cx="6.75" cy="6.75" r="2.5"/><circle cx="17.25" cy="17.25" r="2.5"/><path d="M9.25 6.75h4.5a3.5 3.5 0 0 1 3.5 3.5v4.5"/><path d="M6.75 9.25v4.5a3.5 3.5 0 0 0 3.5 3.5h4.5"/>',
  'search':
    '<circle cx="11" cy="11" r="5.75"/><path d="m15.35 15.35 4.9 4.9"/>',
  'notifications':
    '<path d="M6.25 10.5a5.75 5.75 0 0 1 11.5 0v2.8l1.55 2.8a.9.9 0 0 1-.79 1.34H5.49a.9.9 0 0 1-.79-1.34l1.55-2.8v-2.8Z"/><path d="M10.4 19.9a1.85 1.85 0 0 0 3.2 0"/>',
  'settings':
    '<path d="M4.5 7.25h7.4M16.1 7.25h3.4M4.5 12h2.4M11.1 12h8.4M4.5 16.75h7.4M16.1 16.75h3.4"/><circle cx="14" cy="7.25" r="2.1"/><circle cx="9" cy="12" r="2.1"/><circle cx="14" cy="16.75" r="2.1"/>',
  'calm':
    '<path d="M12 3.5a6.3 6.3 0 0 0 8.5 8.5A8.5 8.5 0 1 1 12 3.5Z"/>',
  'inbox':
    '<path d="M3.5 13.5 5.6 6.3A2.5 2.5 0 0 1 8 4.5h8a2.5 2.5 0 0 1 2.4 1.8l2.1 7.2"/><path d="M3.5 13.5h4.9l1.1 2.2h5l1.1-2.2h4.9"/><path d="M3.5 13.5v3.5A2.5 2.5 0 0 0 6 19.5h12a2.5 2.5 0 0 0 2.5-2.5v-3.5"/>',
  'meetings':
    '<rect x="4" y="5.75" width="16" height="14" rx="2.5"/><path d="M4 10.25h16M8.5 3.5v3.25M15.5 3.5v3.25"/>',
  'timer':
    '<circle cx="12" cy="13" r="7.25"/><path d="M12 9.75V13l2.5 1.75"/><path d="M9.75 3.5h4.5"/>',
  'new':
    '<path d="M12 5.25v13.5M5.25 12h13.5"/>',
  'office':
    '<rect x="4" y="8.25" width="16" height="11.25" rx="2.5"/><path d="M9.25 8.25v-1.5a2 2 0 0 1 2-2h1.5a2 2 0 0 1 2 2v1.5"/><path d="M4 13.25h16"/>',
  'all-desks':
    '<rect x="4" y="4" width="6.75" height="6.75" rx="1.75"/><rect x="13.25" y="4" width="6.75" height="6.75" rx="1.75"/><rect x="4" y="13.25" width="6.75" height="6.75" rx="1.75"/><rect x="13.25" y="13.25" width="6.75" height="6.75" rx="1.75"/>',
  'shared':
    '<circle cx="6" cy="12" r="2.4"/><circle cx="16.75" cy="5.75" r="2.4"/><circle cx="16.75" cy="18.25" r="2.4"/><path d="m8.1 10.8 6.55-3.85M8.1 13.2l6.55 3.85"/>',
  'plans':
    '<circle cx="6.25" cy="6.25" r="2.25"/><path d="M6.25 8.5v5a3.25 3.25 0 0 0 3.25 3.25h5.75"/><rect x="15.25" y="14.5" width="4.5" height="4.5" rx="1.4"/>',
  'tasks':
    '<rect x="4" y="4.5" width="16" height="15" rx="2.5"/><path d="m8.5 12.4 2.4 2.4 4.6-4.85"/>',
  'vault':
    '<path d="M12 3.75l6.75 2.5v5.1c0 4.4-2.9 7.5-6.75 8.9-3.85-1.4-6.75-4.5-6.75-8.9v-5.1L12 3.75Z"/><circle cx="12" cy="10.6" r="1.9"/><path d="M12 12.5v2.5"/>',
  'sheets':
    '<rect x="3.5" y="4.5" width="17" height="15" rx="2.5"/><path d="M3.5 9.75h17M9.75 9.75v9.75"/>',
  'slides':
    '<rect x="3.5" y="5" width="17" height="12.5" rx="2.5"/><path d="M10.5 8.75v5l3.9-2.5-3.9-2.5Z"/><path d="M12 17.5v2.75"/>',
  'draw':
    '<path d="m5 19 .9-4.1L16.3 4.5a2.15 2.15 0 0 1 3.05 3.05L8.9 18 5 19Z"/><path d="m14.15 6.65 3.05 3.05"/>',
  'design':
    '<circle cx="9.25" cy="9.25" r="4.75"/><rect x="10.5" y="10.5" width="9" height="9" rx="2.25"/>',
  'mail':
    '<rect x="3.5" y="5.5" width="17" height="13" rx="2.5"/><path d="m4.75 8.5 7.25 4.6 7.25-4.6"/>',
  'meet':
    '<rect x="3.5" y="7" width="12.5" height="10" rx="2.5"/><path d="m16 10.75 4.5-2.5v7.5l-4.5-2.5"/>',
  'sign':
    '<path d="M4.5 15.5c2-1 3.4-4.9 3.9-8 .2-1.3 1.6-1.2 1.7.1.2 2.7-.6 5.5.5 6.1s2.3-1.5 3.3-1.2c.9.2.6 1.7 1.7 1.9 1 .2 1.6-.8 3.9-.8"/><path d="M4.5 19.5h15"/>',
  'star':
    '<path d="m12 4.5 2.2 4.55 5.05.7-3.65 3.5.9 5-4.5-2.4-4.5 2.4.9-5-3.65-3.5 5.05-.7L12 4.5Z"/>',
  'clock':
    '<circle cx="12" cy="12" r="7.75"/><path d="M12 7.75V12l3 1.75"/>',
  'trash':
    '<path d="M5.5 7h13"/><path d="M9.5 7V5.75A1.75 1.75 0 0 1 11.25 4h1.5a1.75 1.75 0 0 1 1.75 1.75V7"/><path d="m6.75 7 .7 11a2.2 2.2 0 0 0 2.2 2.05h4.7a2.2 2.2 0 0 0 2.2-2.05l.7-11"/><path d="M10.25 10.75v5.5M13.75 10.75v5.5"/>',
  'templates':
    '<rect x="3.5" y="4.5" width="17" height="6" rx="2"/><rect x="3.5" y="13" width="7.5" height="6.5" rx="2"/><rect x="13" y="13" width="7.5" height="6.5" rx="2"/>',
  'org':
    '<rect x="5.5" y="4" width="13" height="16" rx="2"/><path d="M9.5 8.35v.01M14.5 8.35v.01M9.5 12.1v.01M14.5 12.1v.01"/><path d="M12 20v-3.5"/>',
  'directory':
    '<rect x="3.5" y="5.5" width="17" height="13" rx="2.5"/><circle cx="8.75" cy="10.5" r="1.9"/><path d="M6 15.75c.45-1.55 1.5-2.5 2.75-2.5s2.3.95 2.75 2.5"/><path d="M14.25 9.5h3.5M14.25 12.75h3.5"/>',
  'graph':
    '<circle cx="12" cy="5.75" r="2.1"/><circle cx="5.75" cy="17.25" r="2.1"/><circle cx="18.25" cy="17.25" r="2.1"/><path d="M10.95 7.5 6.8 15.4M13.05 7.5l4.15 7.9M7.85 17.25h8.3"/>',
  'decisions':
    '<path d="M9.75 13V9.9a2.25 2.25 0 1 1 4.5 0V13"/><rect x="5.5" y="13" width="13" height="3.75" rx="1.25"/><path d="M7 20h10"/>',
  'assemble':
    '<rect x="4" y="4" width="6.75" height="6.75" rx="1.75"/><rect x="13.25" y="4" width="6.75" height="6.75" rx="1.75"/><rect x="4" y="13.25" width="6.75" height="6.75" rx="1.75"/><path d="M16.6 13.9v5.5M13.85 16.65h5.5"/>',
  'flow':
    '<path d="M13 3.75 5.5 13.5h5L9 20.25l7.5-9.75h-5L13 3.75Z"/>',
  'connect':
    '<circle cx="12" cy="12" r="2.4"/><circle cx="12" cy="5" r="1.6"/><circle cx="19" cy="12" r="1.6"/><circle cx="12" cy="19" r="1.6"/><circle cx="5" cy="12" r="1.6"/><path d="M12 6.6v3M17.4 12h-3M12 17.4v-3M6.6 12h3"/>',
  'api':
    '<path d="m8.5 8-4 4 4 4M15.5 8l4 4-4 4"/><path d="m13.25 5.75-2.5 12.5"/>',
  'ai':
    '<path stroke-width="2.5" d="M9.4 9.2v10M14.6 9.2v10"/><path stroke-width="2.5" d="M9.4 4.9v.01M14.6 4.9v.01"/>',
}

// Material Symbols names that are unambiguous across the app map straight
// to their Plexii replacement. Ambiguous names (lock, dashboard, grid_view,
// palette, draw) are deliberately absent — those call sites opt in with
// 'plexii:vault', 'plexii:home', 'plexii:office', 'plexii:design', 'plexii:sign', 'plexii:templates'.
export const PLEXII_BY_MATERIAL: Record<string, string> = {
  desk: 'desks',
  meeting_room: 'rooms',
  folder_shared: 'shared',
  account_tree: 'plans',
  checklist: 'tasks',
  calendar_month: 'meetings',
  folder: 'files',
  diversity_3: 'people',
  group: 'people',
  groups: 'people',
  neurology: 'brain',
  search: 'search',
  add: 'new',
  settings: 'settings',
  notifications: 'notifications',
  forum: 'chat',
  description: 'docs',
  home: 'home',
  inbox: 'inbox',
  timer: 'timer',
  mail: 'mail',
  table_chart: 'sheets',
  slideshow: 'slides',
  gesture: 'draw',
  video_call: 'meet',
  videocam: 'meet',
  star: 'star',
  schedule: 'clock',
  history: 'clock',
  delete: 'trash',
  apartment: 'org',
  badge: 'directory',
  bubble_chart: 'graph',
  gavel: 'decisions',
  dashboard_customize: 'assemble',
  bolt: 'flow',
  hub: 'connect',
  api: 'api',
  smart_toy: 'agents',
  space_dashboard: 'desks',
  apps: 'all-desks',
  auto_awesome: 'ai',
  auto_awesome_motion: 'ai',
}
