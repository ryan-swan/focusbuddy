import { useEffect, useMemo, useRef, useState } from 'react'
import type { Widget } from '@shared/types'
import { useWidgetStore } from '../../stores/widgets'
import { useAccountStore } from '../../stores/account'
import { createWebhookHook, webhookUrlForToken } from '../../lib/messagingClient'
import WidgetFrame from './WidgetFrame'
import Icon from '../Icon'

// Inbound webhook (trigger) widget (Lever 3, Phase 1). On first mount it registers
// a hook with the signal server bound to THIS widget id and stores { hookId, url }
// in content. It shows the URL to POST to; when an external system hits it, the
// server relays the payload here (handled in messagingSocket) and it lands in this
// widget's content, firing any wire drawn OUT of it. Honest states: while the
// server hasn't been deployed with the /webhooks routes, registration returns null
// and we show an honest "not available yet" — never a fake URL.

interface HookConfig {
  hookId?: string
  url?: string
}

function parse(content: string): HookConfig {
  try {
    const o = JSON.parse(content || '{}')
    return { hookId: typeof o.hookId === 'string' ? o.hookId : undefined, url: typeof o.url === 'string' ? o.url : undefined }
  } catch {
    return {}
  }
}

type RegState = 'ready' | 'registering' | 'unavailable'

export default function InboundHookWidget({
  widget,
  inline = false
}: {
  widget: Widget
  inline?: boolean
}): JSX.Element {
  const cfg = useMemo(() => parse(widget.content), [widget.content])
  const [state, setState] = useState<RegState>(cfg.url ? 'ready' : 'registering')
  const [copied, setCopied] = useState(false)
  const registeringRef = useRef(false)

  // Register once, lazily, if this widget has no hook yet.
  useEffect(() => {
    if (cfg.url || registeringRef.current) return
    registeringRef.current = true
    const token = useAccountStore.getState().sessionToken
    if (!token) {
      setState('unavailable')
      registeringRef.current = false
      return
    }
    setState('registering')
    void createWebhookHook(token, { targetKind: 'widget', targetId: widget.id, label: widget.title || '' })
      .then((hook) => {
        if (!hook) {
          setState('unavailable')
          return
        }
        setState('ready')
        void useWidgetStore
          .getState()
          .update(widget.id, { content: JSON.stringify({ hookId: hook.id, url: webhookUrlForToken(hook.token) }) })
      })
      .finally(() => {
        registeringRef.current = false
      })
  }, [cfg.url, widget.id, widget.title])

  const copy = (): void => {
    if (!cfg.url) return
    void navigator.clipboard?.writeText(cfg.url)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1400)
  }

  const content = (
    <div className="h-full w-full flex flex-col gap-2 p-2.5 text-[12px] text-[var(--ink-70)]" data-testid="inbound-hook-widget">
      <div className="flex items-center gap-1.5 text-[var(--ink-60)]">
        <Icon name="call_received" size={14} className="text-accent" />
        <span className="font-medium">Receive from a URL</span>
      </div>

      {state === 'ready' && cfg.url ? (
        <>
          <div className="flex items-stretch gap-1">
            <input
              type="text"
              readOnly
              value={cfg.url}
              data-testid="inbound-hook-url"
              onFocus={(e) => e.currentTarget.select()}
              className="fb-field flex-1 min-w-0 px-2 py-1.5 text-[10px] font-mono"
            />
            <button
              onClick={copy}
              data-testid="inbound-hook-copy"
              title="Copy URL"
              className="shrink-0 inline-flex items-center gap-1 px-2 rounded bg-accent text-white text-[10px]"
            >
              <Icon name={copied ? 'check' : 'content_copy'} size={12} />
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
          <p className="text-[10px] text-[var(--ink-45)] leading-snug mt-auto">
            POST to this URL and the body lands here, firing any wire drawn out of this tool.
          </p>
        </>
      ) : state === 'registering' ? (
        <div className="flex items-center gap-1.5 text-[10px] text-[var(--ink-50)]">
          <Icon name="hourglass_empty" size={12} />
          Creating your URL…
        </div>
      ) : (
        <p className="text-[10px] text-[var(--ink-45)] leading-snug" data-testid="inbound-hook-unavailable">
          Inbound webhooks aren&apos;t available on your server yet. Once it&apos;s updated, reopen this
          desk and a URL will appear here.
        </p>
      )}
    </div>
  )

  if (inline) return content

  return (
    <WidgetFrame widget={widget} headerLabel="inbound webhook" headerAccent="bg-accent/20">
      {content}
    </WidgetFrame>
  )
}
