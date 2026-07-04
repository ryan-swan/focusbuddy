import Icon from '../Icon'

interface Props {
  icon: string
  title: string
  blurb: string
  cta?: { label: string; onClick: () => void }
}

// Shared placeholder for views that are part of the OS skeleton but whose
// detailed implementation lands in a later phase.
export default function PlaceholderView({ icon, title, blurb, cta }: Props): JSX.Element {
  return (
    <div className="h-full flex flex-col items-center justify-center text-center px-6 desk-paper no-tod">
      <div className="max-w-md">
        <div className="inline-flex items-center justify-center h-14 w-14 rounded-2xl bg-[var(--surface-sunken)] border border-[var(--edge-soft)] mb-4">
          <Icon name={icon} size={28} className="text-accent" />
        </div>
        <h2 className="text-xl font-semibold text-[var(--ink-100)] mb-2">
          {title}
        </h2>
        <p className="text-sm text-[var(--ink-70)] leading-relaxed mb-5">
          {blurb}
        </p>
        {cta && (
          <button onClick={cta.onClick} className="btn-primary">
            <Icon name="arrow_forward" size={14} />
            <span>{cta.label}</span>
          </button>
        )}
      </div>
    </div>
  )
}
