import { create } from 'zustand'
import { DEFAULT_BRAND_KIT, type OrgBrandKit } from '@shared/brandKit'

// The organization Brand Kit, read by every surface that wants to present on
// brand (PlexiDesign today; Docs/Sheets/Slides/Projects as they adopt it). Until
// a brand is saved the store holds the default brand, exactly like a fresh Canva
// account, so callers always have a usable kit.

interface BrandState {
  kit: OrgBrandKit
  isSet: boolean
  loaded: boolean
  load: () => Promise<void>
  save: (kit: OrgBrandKit) => Promise<void>
}

export const useBrandStore = create<BrandState>((set) => ({
  kit: DEFAULT_BRAND_KIT,
  isSet: false,
  loaded: false,
  load: async () => {
    try {
      const r = await window.api.brand.get()
      set({ kit: r.kit, isSet: r.isSet, loaded: true })
    } catch {
      set({ kit: DEFAULT_BRAND_KIT, isSet: false, loaded: true })
    }
  },
  save: async (kit) => {
    const saved = await window.api.brand.set(kit)
    set({ kit: saved, isSet: true })
  }
}))
