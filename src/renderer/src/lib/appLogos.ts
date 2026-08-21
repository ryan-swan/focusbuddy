// Real brand logos for the standard-app catalog, bundled as local assets so
// they render instantly and offline. Downloaded from each vendor's official
// icon endpoints (apple-touch-icon / gstatic product icons) at 128px+.
//
// Two lookups:
//   logoForStandardId — direct hit for catalog entries (the Add dialog).
//   logoForUrl        — match any ConnectedApp back to a catalog logo by
//                       hostname, so apps added before this feature (or with
//                       equivalent URLs) pick up their real logo with no
//                       migration or DB backfill.

import gmail from '../assets/app-logos/gmail.png'
import gcal from '../assets/app-logos/gcal.png'
import gdrive from '../assets/app-logos/gdrive.png'
import notion from '../assets/app-logos/notion.png'
import trello from '../assets/app-logos/trello.png'
import todoist from '../assets/app-logos/todoist.png'
import slack from '../assets/app-logos/slack.png'
import discord from '../assets/app-logos/discord.png'
import whatsapp from '../assets/app-logos/whatsapp.png'
import github from '../assets/app-logos/github.png'
import linear from '../assets/app-logos/linear.png'
import jira from '../assets/app-logos/jira.png'
import claude from '../assets/app-logos/claude.png'
import chatgpt from '../assets/app-logos/chatgpt.png'
import gemini from '../assets/app-logos/gemini.png'
import spotify from '../assets/app-logos/spotify.png'
import ytmusic from '../assets/app-logos/ytmusic.png'
import youtube from '../assets/app-logos/youtube.png'
import figma from '../assets/app-logos/figma.png'
import miro from '../assets/app-logos/miro.png'

const LOGO_BY_ID: Record<string, string> = {
  gmail,
  gcal,
  gdrive,
  notion,
  trello,
  todoist,
  slack,
  discord,
  whatsapp,
  github,
  linear,
  jira,
  claude,
  chatgpt,
  gemini,
  spotify,
  ytmusic,
  youtube,
  figma,
  miro
}

// hostname → catalog id. Covers the catalog URLs plus the equivalent hosts a
// user might have added by hand (chatgpt.com vs chat.openai.com, etc.).
// Subdomain fallback below handles www. and deeper subdomains of these roots.
const HOST_TO_ID: Record<string, string> = {
  'mail.google.com': 'gmail',
  'calendar.google.com': 'gcal',
  'drive.google.com': 'gdrive',
  'docs.google.com': 'gdrive',
  'notion.so': 'notion',
  'notion.site': 'notion',
  'trello.com': 'trello',
  'todoist.com': 'todoist',
  'slack.com': 'slack',
  'discord.com': 'discord',
  'discord.gg': 'discord',
  'whatsapp.com': 'whatsapp',
  'github.com': 'github',
  'linear.app': 'linear',
  'jira.com': 'jira',
  'atlassian.com': 'jira',
  'atlassian.net': 'jira',
  'claude.ai': 'claude',
  'chatgpt.com': 'chatgpt',
  'chat.openai.com': 'chatgpt',
  'gemini.google.com': 'gemini',
  'spotify.com': 'spotify',
  'music.youtube.com': 'ytmusic',
  'youtube.com': 'youtube',
  'youtu.be': 'youtube',
  'figma.com': 'figma',
  'miro.com': 'miro'
}

export function logoForStandardId(id: string): string | null {
  return LOGO_BY_ID[id] ?? null
}

export function logoForUrl(url: string | null | undefined): string | null {
  if (!url) return null
  let host: string
  try {
    host = new URL(url).hostname.toLowerCase()
  } catch {
    return null
  }
  // Exact host first (music.youtube.com must win over youtube.com), then walk
  // up the domain so www.slack.com / app.slack.com resolve to slack.com.
  while (host) {
    const id = HOST_TO_ID[host]
    if (id) return LOGO_BY_ID[id] ?? null
    const dot = host.indexOf('.')
    if (dot === -1) return null
    host = host.slice(dot + 1)
  }
  return null
}
