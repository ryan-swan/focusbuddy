// Curated catalog of standard apps for the Connected Apps picker.
// Each preset is a one-tap add: title, URL, icon, suggested accent color.
// Users can also add custom URLs that don't match any preset.

export interface StandardApp {
  id: string // stable internal key (used as preset matcher)
  title: string
  url: string
  icon: string // Material Symbols icon name
  color: string // brand-ish hex for visual distinction in the sidebar
  category: 'Productivity' | 'Comms' | 'Dev' | 'AI' | 'Media' | 'Design'
}

export const STANDARD_APPS: StandardApp[] = [
  // ── Productivity ─────────────────────────────────────────────────────────────
  {
    id: 'gmail',
    title: 'Gmail',
    url: 'https://mail.google.com/mail/u/0/',
    icon: 'mail',
    color: '#ea4335',
    category: 'Comms'
  },
  {
    id: 'gcal',
    title: 'Google Calendar',
    url: 'https://calendar.google.com/calendar/u/0/r',
    icon: 'event',
    color: '#4285f4',
    category: 'Productivity'
  },
  {
    id: 'gdrive',
    title: 'Google Drive',
    url: 'https://drive.google.com/drive/u/0/my-drive',
    icon: 'cloud',
    color: '#0f9d58',
    category: 'Productivity'
  },
  {
    id: 'notion',
    title: 'Notion',
    url: 'https://www.notion.so',
    icon: 'description',
    color: '#000000',
    category: 'Productivity'
  },
  {
    id: 'trello',
    title: 'Trello',
    url: 'https://trello.com',
    icon: 'view_kanban',
    color: '#0079bf',
    category: 'Productivity'
  },
  {
    id: 'todoist',
    title: 'Todoist',
    url: 'https://todoist.com/app',
    icon: 'checklist',
    color: '#e44332',
    category: 'Productivity'
  },

  // ── Comms ────────────────────────────────────────────────────────────────────
  {
    id: 'slack',
    title: 'Slack',
    url: 'https://app.slack.com/client',
    icon: 'forum',
    color: '#611f69',
    category: 'Comms'
  },
  {
    id: 'discord',
    title: 'Discord',
    url: 'https://discord.com/app',
    icon: 'forum',
    color: '#5865f2',
    category: 'Comms'
  },
  {
    id: 'whatsapp',
    title: 'WhatsApp',
    url: 'https://web.whatsapp.com',
    icon: 'chat',
    color: '#25d366',
    category: 'Comms'
  },

  // ── Dev ──────────────────────────────────────────────────────────────────────
  {
    id: 'github',
    title: 'GitHub',
    url: 'https://github.com',
    icon: 'code',
    color: '#24292f',
    category: 'Dev'
  },
  {
    id: 'linear',
    title: 'Linear',
    url: 'https://linear.app',
    icon: 'linear_scale',
    color: '#5e6ad2',
    category: 'Dev'
  },
  {
    id: 'jira',
    title: 'Jira',
    url: 'https://jira.com',
    icon: 'bug_report',
    color: '#0052cc',
    category: 'Dev'
  },

  // ── AI ───────────────────────────────────────────────────────────────────────
  {
    id: 'claude',
    title: 'Claude',
    url: 'https://claude.ai/chats',
    icon: 'smart_toy',
    color: '#cc785c',
    category: 'AI'
  },
  {
    id: 'chatgpt',
    title: 'ChatGPT',
    url: 'https://chat.openai.com',
    icon: 'smart_toy',
    color: '#10a37f',
    category: 'AI'
  },
  {
    id: 'gemini',
    title: 'Gemini',
    url: 'https://gemini.google.com/app',
    icon: 'auto_awesome',
    color: '#4796e3',
    category: 'AI'
  },

  // ── Media ────────────────────────────────────────────────────────────────────
  {
    id: 'spotify',
    title: 'Spotify',
    url: 'https://open.spotify.com',
    icon: 'music_note',
    color: '#1db954',
    category: 'Media'
  },
  {
    id: 'ytmusic',
    title: 'YouTube Music',
    url: 'https://music.youtube.com',
    icon: 'library_music',
    color: '#ff0000',
    category: 'Media'
  },
  {
    id: 'youtube',
    title: 'YouTube',
    url: 'https://www.youtube.com',
    icon: 'smart_display',
    color: '#ff0000',
    category: 'Media'
  },

  // ── Design ───────────────────────────────────────────────────────────────────
  {
    id: 'figma',
    title: 'Figma',
    url: 'https://www.figma.com/files/recent',
    icon: 'design_services',
    color: '#a259ff',
    category: 'Design'
  },
  {
    id: 'miro',
    title: 'Miro',
    url: 'https://miro.com/app/dashboard/',
    icon: 'space_dashboard',
    color: '#ffd02f',
    category: 'Design'
  }
]

export function findStandardApp(id: string): StandardApp | null {
  return STANDARD_APPS.find((a) => a.id === id) ?? null
}

export function categoriesOrdered(): StandardApp['category'][] {
  return ['Productivity', 'Comms', 'Dev', 'AI', 'Media', 'Design']
}
