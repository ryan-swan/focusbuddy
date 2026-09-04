// A small Markdown renderer for read-only previews: headings, bullets, numbered
// items, bold, and blank-line spacing. Not a parser — deliberately — because the
// places that use it are showing a short document to be READ, not edited, and a
// full pipeline would be a dependency and a security surface for no gain.
//
// Lifted out of ResumeModal, which owned the only copy. The agent delivery
// preview needed exactly the same thing, and a second copy is how two renderers
// drift until the same text looks different in two places.

export function renderInline(text: string): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*)/g)
  return parts.map((p, i) => {
    if (p.startsWith('**') && p.endsWith('**')) {
      return <strong key={i}>{p.slice(2, -2)}</strong>
    }
    return <span key={i}>{p}</span>
  })
}

export function renderMarkdown(md: string): JSX.Element {
  const lines = md.split('\n')
  return (
    <div className="text-sm text-[var(--ink-90)] leading-relaxed">
      {lines.map((line, i) => {
        if (line.startsWith('# ')) {
          return (
            <h2
              key={i}
              className="text-base font-semibold text-[var(--ink-100)] mt-3 mb-1 first:mt-0"
            >
              {line.slice(2)}
            </h2>
          )
        }
        if (line.startsWith('## ')) {
          return (
            <h3 key={i} className="text-sm font-semibold text-[var(--ink-100)] mt-2 mb-1">
              {line.slice(3)}
            </h3>
          )
        }
        if (line.startsWith('- ') || line.startsWith('* ')) {
          return (
            <div key={i} className="pl-4 -indent-2 my-0.5">
              • {renderInline(line.slice(2))}
            </div>
          )
        }
        const numMatch = /^(\d+)\.\s+(.*)$/.exec(line)
        if (numMatch) {
          return (
            <div key={i} className="pl-5 -indent-3 my-0.5">
              <span className="text-[var(--ink-50)] font-medium">{numMatch[1]}.</span>{' '}
              {renderInline(numMatch[2])}
            </div>
          )
        }
        if (line.trim() === '') return <div key={i} className="h-1.5" />
        return (
          <div key={i} className="my-0.5">
            {renderInline(line)}
          </div>
        )
      })}
    </div>
  )
}
