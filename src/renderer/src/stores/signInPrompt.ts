import { create } from 'zustand'

// A tiny shared flag so anywhere in the app (the Settings account section, a
// capability-expired prompt, a "sign in to invite" affordance) can pop the
// sign-in modal on demand. The modal renders on boot by its own rules; this
// lets it also open when the user explicitly asks, even after they once chose
// "Continue without account".
interface SignInPromptStore {
  open: boolean
  requestOpen: () => void
  close: () => void
}

export const useSignInPrompt = create<SignInPromptStore>((set) => ({
  open: false,
  requestOpen: () => set({ open: true }),
  close: () => set({ open: false })
}))
