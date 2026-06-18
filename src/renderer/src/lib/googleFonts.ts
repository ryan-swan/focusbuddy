// Google Fonts catalogue + on-demand loader, shared by the document, spreadsheet
// and slide editors. A font's stylesheet is injected the first time it is shown
// or chosen (CSP already allows fonts.googleapis.com / fonts.gstatic.com), so we
// never ship every font up front. The list is a broad curated set of the most
// used Google families plus the app's bundled ones.

export const GENERIC_FONTS = [
  { label: 'Default', value: '' },
  { label: 'Sans', value: 'Inter, system-ui, sans-serif' },
  { label: 'Serif', value: 'Georgia, "Times New Roman", serif' },
  { label: 'Mono', value: '"JetBrains Mono", ui-monospace, monospace' }
]

// Broad set of popular Google Fonts. Each is loaded on demand.
export const GOOGLE_FONTS: string[] = [
  'Inter', 'Roboto', 'Open Sans', 'Lato', 'Montserrat', 'Poppins', 'Raleway', 'Oswald',
  'Source Sans 3', 'Noto Sans', 'Nunito', 'Nunito Sans', 'Work Sans', 'Rubik', 'PT Sans',
  'Ubuntu', 'Mukta', 'Quicksand', 'Karla', 'Mulish', 'Manrope', 'DM Sans', 'Heebo',
  'Barlow', 'Kanit', 'Fira Sans', 'Cabin', 'Josefin Sans', 'Hind', 'Titillium Web',
  'PT Serif', 'Merriweather', 'Playfair Display', 'Lora', 'Roboto Slab', 'Noto Serif',
  'Bitter', 'Crimson Text', 'Libre Baskerville', 'EB Garamond', 'Cormorant Garamond',
  'Source Serif 4', 'Spectral', 'Zilla Slab', 'Arvo', 'Domine', 'Frank Ruhl Libre',
  'Roboto Mono', 'JetBrains Mono', 'Source Code Pro', 'Fira Code', 'IBM Plex Mono',
  'Space Mono', 'Inconsolata', 'Ubuntu Mono', 'PT Mono',
  'Roboto Condensed', 'Archivo', 'Archivo Narrow', 'Barlow Condensed', 'Saira',
  'Exo 2', 'Teko', 'Bebas Neue', 'Anton', 'Pathway Gothic One',
  'Dancing Script', 'Pacifico', 'Caveat', 'Lobster', 'Satisfy', 'Great Vibes',
  'Shadows Into Light', 'Permanent Marker', 'Patrick Hand', 'Indie Flower', 'Kalam',
  'Comfortaa', 'Righteous', 'Fredoka', 'Baloo 2', 'Abril Fatface', 'Yeseva One',
  'Cardo', 'Alegreya', 'Vollkorn', 'Bree Serif', 'Maven Pro', 'Asap', 'Catamaran',
  'Signika', 'Questrial', 'Jost', 'Sora', 'Outfit', 'Plus Jakarta Sans', 'Figtree',
  'Albert Sans', 'Be Vietnam Pro', 'Onest', 'Schibsted Grotesk'
]

const loaded = new Set<string>()

// Inject the @font-face stylesheet for a family if not already loaded. No weight
// axis is requested so the call always succeeds even for single-weight families;
// bold/italic synthesise. Generic CSS stacks (containing a comma) are ignored.
export function loadGoogleFont(family: string): void {
  if (!family || family.includes(',') || loaded.has(family)) return
  loaded.add(family)
  const id = 'gf-' + family.replace(/[^a-z0-9]+/gi, '-').toLowerCase()
  if (document.getElementById(id)) return
  const link = document.createElement('link')
  link.id = id
  link.rel = 'stylesheet'
  link.href = `https://fonts.googleapis.com/css2?family=${family.replace(/ /g, '+')}:ital,wght@0,400;0,600;0,700;1,400&display=swap`
  document.head.appendChild(link)
}

// The CSS font-family value to store for a chosen Google family (with a fallback).
export function fontFamilyValue(family: string): string {
  if (!family) return ''
  if (family.includes(',')) return family // already a stack
  return `"${family}", sans-serif`
}

// Extract the primary family name from a stored CSS font-family value, for
// showing the current selection and matching the list.
export function familyLabel(value: string | undefined): string {
  if (!value) return 'Default'
  const first = value.split(',')[0].trim().replace(/^["']|["']$/g, '')
  return first || 'Default'
}
