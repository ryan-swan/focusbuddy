import { createContext } from 'react'
import type { SectionLayout } from '@shared/types'

export interface LayoutContextValue {
  layout: SectionLayout
  position: { x: number; y: number }
  size: { width: number; height: number }
}

export const SectionLayoutContext = createContext<LayoutContextValue | null>(null)
