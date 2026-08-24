// Emoji → premium icon (A5.5, AI-41 — Caleb's ruling amending R25).
//
// The model may open a section heading with one relevant emoji, but a raw
// emoji never reaches the screen: the renderer treats it as an ICON HINT and
// swaps it for the matching Plexii icon (Material name, accent-tinted at the
// call site). An emoji with no mapping is stripped — the calm fallback — so
// the answer degrades to a plain heading, never to a decorated one. Pure and
// dependency-free so the map and the splitter unit-test in isolation.

// Generous coverage of the section-marker emojis models actually reach for.
// Every value is a Material Symbols name already in the app's icon language.
export const EMOJI_ICON_MAP: Readonly<Record<string, string>> = {
  '🚀': 'rocket_launch',
  '💡': 'lightbulb',
  '📌': 'push_pin',
  '📍': 'location_on',
  '📋': 'checklist',
  '✅': 'check_circle',
  '☑️': 'check_circle',
  '✔️': 'check_circle',
  '⚠️': 'warning',
  '❗': 'priority_high',
  '❓': 'help',
  '🔥': 'local_fire_department',
  '⭐': 'star',
  '🌟': 'star',
  '✨': 'auto_awesome',
  '🎯': 'flag',
  '🏁': 'flag',
  '🚩': 'flag',
  '📈': 'trending_up',
  '📉': 'trending_down',
  '📊': 'bar_chart',
  '💰': 'payments',
  '💵': 'payments',
  '💸': 'payments',
  '🗓️': 'calendar_month',
  '📅': 'calendar_month',
  '📆': 'calendar_month',
  '⏰': 'schedule',
  '⏱️': 'timer',
  '📁': 'folder',
  '📂': 'folder_open',
  '🗂️': 'folder_open',
  '📄': 'description',
  '📝': 'edit_note',
  '✏️': 'edit',
  '🧠': 'psychology',
  '🤖': 'smart_toy',
  '👥': 'groups',
  '👤': 'person',
  '🔑': 'key',
  '🔒': 'lock',
  '🔓': 'lock_open',
  '🔗': 'link',
  '🌐': 'language',
  '🌍': 'public',
  '🌎': 'public',
  '🌏': 'public',
  '🔍': 'search',
  '🔎': 'search',
  '💬': 'forum',
  '✉️': 'mail',
  '📧': 'mail',
  '📨': 'mail',
  '📞': 'call',
  '☎️': 'call',
  '🏠': 'home',
  '🏢': 'apartment',
  '💼': 'work',
  '🛠️': 'build',
  '🔧': 'build',
  '⚙️': 'settings',
  '🧪': 'science',
  '🎨': 'palette',
  '🎉': 'celebration',
  '🎊': 'celebration',
  '❤️': 'favorite',
  '💪': 'fitness_center',
  '🍽️': 'restaurant',
  '✈️': 'flight',
  '🛒': 'shopping_cart',
  '🐛': 'bug_report',
  '🎓': 'school',
  '📚': 'menu_book',
  '📖': 'menu_book',
  '🧾': 'receipt_long',
  '🧭': 'explore',
  '🗺️': 'map',
  '⚡': 'bolt',
  '☀️': 'wb_sunny',
  '🌙': 'dark_mode',
  '💻': 'computer',
  '📱': 'smartphone',
  '🖼️': 'image',
  '📷': 'photo_camera',
  '🎥': 'videocam',
  '🎵': 'music_note',
  '🏆': 'emoji_events',
  '🥇': 'emoji_events',
  '🎁': 'redeem',
  '♻️': 'recycling',
  '🗑️': 'delete'
}

// One leading emoji cluster: a pictographic (with optional variation selector),
// optionally extended by ZWJ sequences and skin-tone modifiers, plus the
// whitespace that follows it. Keycap digits (1️⃣) deliberately do not match —
// a numbered heading keeps its number.
const LEADING_EMOJI =
  /^(\p{Extended_Pictographic}(?:[︎️]|\p{Emoji_Modifier})*(?:‍\p{Extended_Pictographic}(?:[︎️]|\p{Emoji_Modifier})*)*)\s*/u

export interface LeadingEmojiSplit {
  // True when a leading emoji cluster was found (and removed from rest).
  matched: boolean
  // The mapped icon name, or null when the emoji has no mapping (strip only).
  icon: string | null
  // The text with the leading emoji cluster and its spacing removed.
  rest: string
}

export function splitLeadingEmoji(text: string): LeadingEmojiSplit {
  const m = LEADING_EMOJI.exec(text)
  if (!m) return { matched: false, icon: null, rest: text }
  // Look the cluster up with and without a trailing variation selector — the
  // map keys carry the form models most often emit, but both arrive in the
  // wild ('⚠' vs '⚠️').
  const cluster = m[1]
  const icon =
    EMOJI_ICON_MAP[cluster] ??
    EMOJI_ICON_MAP[cluster.replace(/[︎️]/g, '')] ??
    EMOJI_ICON_MAP[`${cluster}️`] ??
    null
  return { matched: true, icon, rest: text.slice(m[0].length) }
}
