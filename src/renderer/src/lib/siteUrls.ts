// Public marketing-site URLs, in ONE place so they can be repointed with a
// single edit. The brand domain haptyx.app is not registered yet, so every
// in-app link that used to point there was dead; they point at the live Vercel
// deployment instead. If/when haptyx.app is registered and pointed at Vercel,
// change SITE_BASE here and every link follows.
export const SITE_BASE = 'https://haptyx-web.vercel.app'

export const HELP_BASE = `${SITE_BASE}/help`
export const PRICING_URL = `${SITE_BASE}/pricing`
