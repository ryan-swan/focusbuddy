import { useState } from 'react'
import { createPortal } from 'react-dom'
import { useOnboarding } from '../stores/onboarding'
import { useNodeStore } from '../stores/nodes'
import { useViewStore } from '../stores/view'
import Icon from './Icon'

// First-run onboarding — shown once to a genuinely fresh install (see the
// onboarding store, which grandfathers existing users). Three steps: a short
// welcome, a guided API-key paste that actually tests the key, and an optional
// starter workspace so the canvas isn't a blank void. Every step is skippable;
// the goal is to get a new person to "I can see it working" fast.

const ANTHROPIC_KEYS_URL = 'https://console.anthropic.com/settings/keys'

type KeyStatus =
  | { kind: 'idle' }
  | { kind: 'saving' }
  | { kind: 'testing' }
  | { kind: 'ok'; model?: string }
  | { kind: 'error'; message: string }

export default function FirstRunOnboarding(): JSX.Element | null {
  const status = useOnboarding((s) => s.status)
  const complete = useOnboarding((s) => s.complete)
  const refreshNodes = useNodeStore((s) => s.refresh)
  const goTask = useViewStore((s) => s.goTask)

  const [step, setStep] = useState(0)
  const [key, setKey] = useState('')
  const [keyStatus, setKeyStatus] = useState<KeyStatus>({ kind: 'idle' })
  const [seeding, setSeeding] = useState(false)

  if (status !== 'active') return null

  async function testAndSaveKey(): Promise<void> {
    const pasted = key.trim()
    if (!pasted) return
    setKeyStatus({ kind: 'saving' })
    const saved = await window.api.settings.saveAnthropicKey(pasted)
    if (!saved.ok) {
      setKeyStatus({ kind: 'error', message: saved.error ?? 'Could not save that key.' })
      return
    }
    setKeyStatus({ kind: 'testing' })
    const test = await window.api.settings.testAnthropicKey()
    if (test.ok) {
      setKeyStatus({ kind: 'ok', model: test.model })
    } else {
      setKeyStatus({
        kind: 'error',
        message: test.error ?? 'That key was saved but a test call failed.'
      })
    }
  }

  // Seed a small, real starter so the sidebar and canvas aren't empty. Not fake
  // data — a genuinely useful first task with an orientation note on its canvas.
  async function createStarter(): Promise<void> {
    setSeeding(true)
    try {
      const folder = await window.api.nodes.create({
        parentId: null,
        kind: 'folder',
        title: 'Getting started'
      })
      const firstTask = await window.api.nodes.create({
        parentId: folder.id,
        kind: 'task',
        title: 'Your first focus session'
      })
      await window.api.nodes.create({
        parentId: folder.id,
        kind: 'task',
        title: 'Try Build with AI — describe a workspace and let it build'
      })
      await window.api.widgets.create({
        taskId: firstTask.id,
        kind: 'sticky',
        title: '',
        content:
          'Welcome.\n\nThis is your desk. Add tools with + Widget, or press Build (⌘⇧K) and describe what you want — it builds the widgets for you. For help thinking through a task, use the Assistant panel on the right.\n\nPress the play button on a task to start a 5-minute focus session.',
        x: 160,
        y: 160,
        width: 280,
        height: 200
      })
      await refreshNodes()
      finish(() => goTask(firstTask.id))
    } finally {
      setSeeding(false)
    }
  }

  function finish(after?: () => void): void {
    complete()
    after?.()
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[240] flex items-center justify-center bg-stone-950/55 backdrop-blur-md"
      role="dialog"
      aria-label="Welcome to PlexiDesk"
      aria-modal="true"
    >
      <div className="w-[560px] max-w-[92vw] rounded-2xl bg-[rgba(16,24,39,0.96)] border border-white/10 shadow-2xl overflow-hidden text-stone-100">
        {/* Progress dots */}
        <div className="flex items-center gap-1.5 px-6 pt-5">
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className={`h-1 rounded-full transition-all ${
                i === step ? 'w-6 bg-accent' : i < step ? 'w-3 bg-accent/50' : 'w-3 bg-white/15'
              }`}
            />
          ))}
        </div>

        {step === 0 && (
          <div className="px-6 py-6">
            <div
              className="h-12 w-12 rounded-xl inline-flex items-center justify-center mb-4"
              style={{ background: 'linear-gradient(135deg, rgba(139,92,246,0.3), rgba(99,102,241,0.2))' }}
            >
              <Icon name="auto_awesome" size={24} className="text-white" />
            </div>
            <h1 className="text-2xl font-semibold mb-2">Welcome to PlexiDesk</h1>
            <p className="text-[14px] text-stone-300 leading-relaxed mb-1">
              A glass-canvas workspace where notes, pages, tables, browsers and timers live side by
              side. Describe what you need and the AI builds it onto your desk.
            </p>
            <p className="text-[13px] text-stone-400 leading-relaxed">
              A key, a quick tour, and you are working. You can skip any step.
            </p>
            <div className="flex justify-end mt-6">
              <button onClick={() => setStep(1)} className="btn-primary">
                <span>Get started</span>
                <Icon name="arrow_forward" size={14} />
              </button>
            </div>
          </div>
        )}

        {step === 1 && (
          <div className="px-6 py-6">
            <h2 className="text-xl font-semibold mb-2">Connect AI</h2>
            <p className="text-[13px] text-stone-300 leading-relaxed mb-3">
              The build-with-AI features use your own Anthropic key, so you stay in control of cost
              and data. Paste a key to switch them on. You can also do this later in Settings.
            </p>
            <button
              onClick={() => void window.api.files.openExternal(ANTHROPIC_KEYS_URL)}
              className="text-[12px] text-accent hover:underline underline-offset-2 mb-3 inline-flex items-center gap-1"
            >
              <Icon name="open_in_new" size={12} />
              <span>Get a key from the Anthropic console</span>
            </button>
            <input
              type="password"
              value={key}
              onChange={(e) => {
                setKey(e.target.value)
                if (keyStatus.kind !== 'idle') setKeyStatus({ kind: 'idle' })
              }}
              placeholder="sk-ant-api03-…"
              data-testid="onboarding-key-input"
              className="w-full bg-stone-800 border border-stone-600 rounded-md px-3 py-2 text-sm font-mono focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/30"
            />
            {keyStatus.kind === 'ok' && (
              <div className="mt-2 text-[12px] text-emerald-400 inline-flex items-center gap-1.5">
                <Icon name="check_circle" size={13} />
                <span>Key works{keyStatus.model ? ` · ${keyStatus.model}` : ''}. AI is on.</span>
              </div>
            )}
            {keyStatus.kind === 'error' && (
              <div className="mt-2 text-[12px] text-red-400 inline-flex items-center gap-1.5">
                <Icon name="error_outline" size={13} />
                <span>{keyStatus.message}</span>
              </div>
            )}

            <div className="flex items-center justify-between mt-6">
              <button
                onClick={() => setStep(2)}
                className="text-[13px] text-stone-400 hover:text-stone-200"
              >
                Skip for now
              </button>
              <div className="flex items-center gap-2">
                {keyStatus.kind === 'ok' ? (
                  <button onClick={() => setStep(2)} className="btn-primary">
                    <span>Continue</span>
                    <Icon name="arrow_forward" size={14} />
                  </button>
                ) : (
                  <button
                    onClick={() => void testAndSaveKey()}
                    disabled={!key.trim() || keyStatus.kind === 'saving' || keyStatus.kind === 'testing'}
                    className="btn-primary"
                    data-testid="onboarding-key-test"
                  >
                    <Icon name="bolt" size={14} />
                    <span>
                      {keyStatus.kind === 'saving'
                        ? 'Saving…'
                        : keyStatus.kind === 'testing'
                          ? 'Testing…'
                          : 'Test & save'}
                    </span>
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="px-6 py-6">
            <h2 className="text-xl font-semibold mb-2">What is inside</h2>
            <p className="text-[13px] text-stone-300 leading-relaxed mb-4">
              Everything lives in the left sidebar. Here is the quick map so you know where to reach
              for each thing.
            </p>
            <div className="grid grid-cols-2 gap-2.5" data-testid="onboarding-tour">
              {[
                { icon: 'dashboard', name: 'Home & Tasks', blurb: 'Your desks and to-dos, each with its own glass canvas.' },
                { icon: 'description', name: 'Documents', blurb: 'Word, Excel and PowerPoint-class docs, sheets and slides.' },
                { icon: 'folder', name: 'Files', blurb: 'A folder library for any file, with views and sorting.' },
                { icon: 'calendar_month', name: 'Calendar', blurb: 'Time-block your day and plan focus sessions.' },
                { icon: 'mail', name: 'Mail', blurb: 'Read and reply to email, and turn any message into a task.' },
                { icon: 'lock', name: 'Vault', blurb: 'Encrypted passwords and secrets, with auto-fill.' }
              ].map((s) => (
                <div key={s.name} className="flex gap-2.5 rounded-lg bg-white/5 border border-white/10 px-3 py-2.5">
                  <Icon name={s.icon} size={18} className="text-accent shrink-0 mt-0.5" />
                  <div className="min-w-0">
                    <div className="text-[13px] font-medium text-stone-100">{s.name}</div>
                    <div className="text-[11px] text-stone-400 leading-snug">{s.blurb}</div>
                  </div>
                </div>
              ))}
            </div>
            <div className="flex items-center justify-between mt-6">
              <button onClick={() => setStep(3)} className="text-[13px] text-stone-400 hover:text-stone-200">
                Skip
              </button>
              <button onClick={() => setStep(3)} className="btn-primary" data-testid="onboarding-tour-continue">
                <span>Continue</span>
                <Icon name="arrow_forward" size={14} />
              </button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="px-6 py-6">
            <h2 className="text-xl font-semibold mb-2">A place to start</h2>
            <p className="text-[13px] text-stone-300 leading-relaxed mb-4">
              Want a small starter workspace so your desk isn&apos;t empty? It adds a “Getting
              started” folder with a first task and a short note on its canvas. You can delete it any
              time.
            </p>
            <div className="flex flex-col gap-2">
              <button
                onClick={() => void createStarter()}
                disabled={seeding}
                className="btn-primary justify-center"
                data-testid="onboarding-create-starter"
              >
                <Icon name="auto_awesome" size={14} />
                <span>{seeding ? 'Setting up…' : 'Create a starter workspace'}</span>
              </button>
              <button
                onClick={() => finish()}
                disabled={seeding}
                className="btn-ghost justify-center"
                data-testid="onboarding-start-blank"
              >
                <span>Start blank</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body
  )
}
