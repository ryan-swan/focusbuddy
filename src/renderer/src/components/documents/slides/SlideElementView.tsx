// Pure renderer for a single slide element, positioned in 1280x720 logical
// units. It is wrapped by SlideFace inside a stage that is CSS-scaled, so this
// component always works in logical pixels and renders identically at thumbnail,
// editor, present and export sizes.

import type { SlideElement, SlideTextElement } from '@shared/types'

function TextContent({ el }: { el: SlideTextElement }): JSX.Element {
  const justify = el.vAlign === 'middle' ? 'center' : el.vAlign === 'bottom' ? 'flex-end' : 'flex-start'
  return (
    <div
      style={{ display: 'flex', flexDirection: 'column', justifyContent: justify, height: '100%', fontFamily: el.fontFamily }}
    >
      {el.paragraphs.map((p, i) => (
        <div
          key={i}
          style={{
            textAlign: p.align ?? 'left',
            display: 'flex',
            gap: 8,
            justifyContent: p.align === 'center' ? 'center' : p.align === 'right' ? 'flex-end' : 'flex-start'
          }}
        >
          {p.listStyle === 'bullet' && <span style={{ opacity: 0.7 }}>•</span>}
          {p.listStyle === 'number' && <span style={{ opacity: 0.7 }}>{i + 1}.</span>}
          <span>
            {p.runs.map((r, j) => (
              <span
                key={j}
                style={{
                  fontWeight: r.bold ? 700 : undefined,
                  fontStyle: r.italic ? 'italic' : undefined,
                  textDecoration: r.underline ? 'underline' : undefined,
                  color: r.color,
                  fontSize: r.fontSize
                }}
              >
                {r.text || '​'}
              </span>
            ))}
          </span>
        </div>
      ))}
    </div>
  )
}

export default function SlideElementView({ el }: { el: SlideElement }): JSX.Element {
  const base: React.CSSProperties = {
    position: 'absolute',
    left: el.x,
    top: el.y,
    width: el.w,
    height: el.h,
    transform: el.rotation ? `rotate(${el.rotation}deg)` : undefined,
    overflow: 'hidden'
  }

  if (el.type === 'text') {
    return (
      <div style={{ ...base }}>
        <TextContent el={el} />
      </div>
    )
  }
  if (el.type === 'image') {
    return (
      <div style={base}>
        <img src={el.src} alt="" style={{ width: '100%', height: '100%', objectFit: el.fit ?? 'contain' }} />
      </div>
    )
  }
  if (el.type === 'shape') {
    const radius = el.shape === 'ellipse' ? '50%' : el.shape === 'roundRect' ? 16 : 0
    if (el.shape === 'triangle') {
      return (
        <div style={base}>
          <div
            style={{
              width: '100%',
              height: '100%',
              clipPath: 'polygon(50% 0%, 0% 100%, 100% 100%)',
              backgroundColor: el.fill?.type === 'solid' ? el.fill.color : 'transparent'
            }}
          />
        </div>
      )
    }
    return (
      <div
        style={{
          ...base,
          backgroundColor: el.fill?.type === 'solid' ? el.fill.color : 'transparent',
          borderRadius: radius,
          border: el.border ? `${el.border.width}px ${el.border.style ?? 'solid'} ${el.border.color}` : undefined
        }}
      />
    )
  }
  // line: drawn as the diagonal of its box (top-left to bottom-right)
  return (
    <div style={base}>
      <svg width="100%" height="100%" viewBox={`0 0 ${el.w} ${el.h}`} preserveAspectRatio="none">
        {el.arrowEnd && (
          <defs>
            <marker id={`arrow-${el.id}`} markerWidth="10" markerHeight="10" refX="8" refY="3" orient="auto">
              <path d="M0,0 L0,6 L9,3 z" fill={el.stroke} />
            </marker>
          </defs>
        )}
        <line
          x1={0}
          y1={0}
          x2={el.w}
          y2={el.h}
          stroke={el.stroke}
          strokeWidth={el.strokeWidth}
          markerEnd={el.arrowEnd ? `url(#arrow-${el.id})` : undefined}
        />
      </svg>
    </div>
  )
}
