import React from 'react'
import Icon from '../Icon'
import { splitLeadingEmoji } from '../../lib/emojiIcon'

// Section markers, the premium way (A5.5, AI-41 — Caleb's amendment to R25):
// a heading or bullet that opens with an emoji renders the matching Plexii
// icon instead; an unmapped emoji is stripped. Raw emoji never reach the
// screen from assistant prose.
//
// STABLE MODULE-LEVEL COMPONENTS, the AI-32 law: ReactMarkdown overrides
// defined inside a render are new element types every commit and remount the
// whole subtree mid-stream (the flash that took round 4c to find). Everything
// here is defined once at module scope.

// Swap a leading emoji on the first text child for the icon (or nothing).
// Non-string first children (e.g. a heading starting with **bold**) pass
// through untouched — the transform only ever edits genuine leading text.
function withSectionIcon(children: React.ReactNode): React.ReactNode {
  const arr = React.Children.toArray(children)
  if (arr.length === 0 || typeof arr[0] !== 'string') return children
  const { matched, icon, rest } = splitLeadingEmoji(arr[0])
  if (!matched) return children
  const tail = [rest, ...arr.slice(1)]
  if (!icon) return tail
  return [
    <Icon
      key="section-icon"
      name={icon}
      className="text-accent mr-[0.45em] !inline-block align-[-0.14em]"
      style={{ fontSize: '0.95em' }}
    />,
    ...tail
  ]
}

type HeadingProps = React.HTMLAttributes<HTMLHeadingElement> & { children?: React.ReactNode }
type LiProps = React.LiHTMLAttributes<HTMLLIElement> & { children?: React.ReactNode }

function MdH1({ children, ...rest }: HeadingProps): React.JSX.Element {
  return <h1 {...rest}>{withSectionIcon(children)}</h1>
}
function MdH2({ children, ...rest }: HeadingProps): React.JSX.Element {
  return <h2 {...rest}>{withSectionIcon(children)}</h2>
}
function MdH3({ children, ...rest }: HeadingProps): React.JSX.Element {
  return <h3 {...rest}>{withSectionIcon(children)}</h3>
}
function MdH4({ children, ...rest }: HeadingProps): React.JSX.Element {
  return <h4 {...rest}>{withSectionIcon(children)}</h4>
}
function MdLi({ children, ...rest }: LiProps): React.JSX.Element {
  return <li {...rest}>{withSectionIcon(children)}</li>
}

// Spread into a ReactMarkdown components map. One object, module-level, so
// every consumer shares the same stable types.
export const MD_SECTION_COMPONENTS = {
  h1: MdH1,
  h2: MdH2,
  h3: MdH3,
  h4: MdH4,
  li: MdLi
} as const
