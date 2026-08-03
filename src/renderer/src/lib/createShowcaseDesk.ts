import type { WidgetKind, WireType, Widget } from '@shared/types'
import { useNodeStore } from '../stores/nodes'
import { useWidgetStore } from '../stores/widgets'
import { useLinksStore } from '../stores/links'
import { useViewStore } from '../stores/view'
import { serializeAgent, DEFAULT_AGENT } from './deskAgent'

// One-click "Wire & Agent Showcase" desk. Builds a real desk with ten worked
// examples of connections + desk agents pulling from one widget, transforming or
// running AI over it, and writing to another. Everything is real: real widgets,
// real widget_links, real agent configs — nothing mocked.
//
// The AI cases (transforms + agents) only PRODUCE output once a personal Anthropic
// key is set in Settings → AI · API keys (the shared credits proxy has none). The
// non-AI cases (mirror, inbound/outbound webhooks) work immediately. Each cluster
// carries a Card explaining what it does and whether it needs a key.

const COL = [40, 700]
const ROW = [40, 430, 820, 1210, 1600]

interface Placed {
  header: string
  desc: string
  needsKey: boolean
}

async function makeWidget(
  taskId: string,
  kind: WidgetKind,
  title: string,
  content: string,
  x: number,
  y: number,
  width: number,
  height: number,
  color?: string | null
): Promise<Widget> {
  const w = await useWidgetStore.getState().create({ taskId, kind, title, content, x, y, width, height, color })
  return w
}

async function wire(
  sourceId: string,
  targetId: string,
  taskId: string,
  type: WireType,
  verb?: string
): Promise<void> {
  const link = await useLinksStore.getState().create(sourceId, targetId, taskId, type)
  if (link && verb) await useLinksStore.getState().update(link.id, { verb })
}

function agentBody(instruction: string): string {
  return serializeAgent({ ...DEFAULT_AGENT, instruction, trigger: 'onChange', enabled: true })
}

// A labelled header card for a cluster, so the desk reads as a self-explanatory
// tour rather than a pile of widgets.
async function header(taskId: string, x: number, y: number, p: Placed): Promise<void> {
  const body = `${p.desc}\n\n${p.needsKey ? 'Needs a personal Anthropic key (Settings → AI · API keys).' : 'Works now — no AI key needed.'}`
  await makeWidget(
    taskId,
    'card',
    p.header,
    JSON.stringify({ title: p.header, body, accent: p.needsKey ? '#6366f1' : '#10b981' }),
    x,
    y,
    560,
    72
  )
}

export async function createShowcaseDesk(): Promise<string | null> {
  const nodes = useNodeStore.getState()
  const desk = await nodes.create({ parentId: null, kind: 'task', title: 'Wire & Agent Showcase' })
  const id = desk.id
  const SW = 260
  const SH = 210

  try {
    // 1 — Extract action items: Note --transform--> Page
    await header(id, COL[0], ROW[0], {
      header: '1 · Extract action items',
      desc: 'Meeting Note → transform → Page. Edit the note; the page fills with a checklist.',
      needsKey: true
    })
    {
      const src = await makeWidget(id, 'note', 'Meeting notes',
        'Standup 10am. Ship the beta Friday. Sarah writes the release notes. Fix the login bug before launch. Follow up with design on Monday.',
        COL[0], ROW[0] + 84, SW, SH)
      const tgt = await makeWidget(id, 'page', 'Action items', '', COL[0] + 300, ROW[0] + 84, SW, SH)
      await wire(src.id, tgt.id, id, 'transform', 'Extract the action items as a checklist. Only concrete, actionable tasks.')
    }

    // 2 — Notes into a task table: Note --transform--> Table
    await header(id, COL[1], ROW[0], {
      header: '2 · Turn notes into a task table',
      desc: 'Note → transform → Table. Freeform lines become typed rows.',
      needsKey: true
    })
    {
      const src = await makeWidget(id, 'note', 'Project todos',
        'Redesign onboarding — Sarah — next week. Migrate the database — Tom — Friday. Draft the pricing page — Mia — Wednesday.',
        COL[1], ROW[0] + 84, SW, SH)
      const tgt = await makeWidget(id, 'table', 'Tasks', '', COL[1] + 300, ROW[0] + 84, SW, SH)
      await wire(src.id, tgt.id, id, 'transform', 'Turn this into a table with columns Task, Owner, and Due.')
    }

    // 3 — Summarise a web page: Browser --transform--> Note
    await header(id, COL[0], ROW[1], {
      header: '3 · Summarise a web page',
      desc: 'Browser → transform → Note. The live page text is summarised.',
      needsKey: true
    })
    {
      const src = await makeWidget(id, 'webview', 'Research', 'https://en.wikipedia.org/wiki/Knowledge_management',
        COL[0], ROW[1] + 84, SW, SH)
      const tgt = await makeWidget(id, 'note', 'Summary', '', COL[0] + 300, ROW[1] + 84, SW, SH)
      await wire(src.id, tgt.id, id, 'transform', 'Summarise the key points of this page in 5 short bullets.')
    }

    // 4 — Keep in sync (no AI): Note --mirror--> Sticky
    await header(id, COL[1], ROW[1], {
      header: '4 · Keep in sync (live mirror)',
      desc: 'Note → mirror → Sticky. Edit the note; the sticky copies instantly.',
      needsKey: false
    })
    {
      const src = await makeWidget(id, 'note', 'Source of truth', 'Edit me — this copies live to the sticky beside it.',
        COL[1], ROW[1] + 84, SW, SH)
      const tgt = await makeWidget(id, 'sticky', '', '', COL[1] + 300, ROW[1] + 84, SW, SH, '#fef08a')
      await wire(src.id, tgt.id, id, 'mirror')
    }

    // 5 — Write into a Word Document: Note --transform--> Doc
    await header(id, COL[0], ROW[2], {
      header: '5 · Write into a Document',
      desc: 'Note → transform → Word Document. The summary lands in the doc body.',
      needsKey: true
    })
    {
      const src = await makeWidget(id, 'note', 'Long update',
        'This quarter we shipped the new editor, cut load time by 40%, and onboarded 12 teams. Next quarter we focus on collaboration and mobile.',
        COL[0], ROW[2] + 84, SW, SH)
      let docId = ''
      try {
        const doc = await window.api.documents.create({ docType: 'doc', title: 'Executive summary' })
        docId = doc?.id ?? ''
      } catch {
        docId = ''
      }
      if (docId) {
        const tgt = await makeWidget(id, 'doc', 'Executive summary', docId, COL[0] + 300, ROW[2] + 84, SW, SH)
        await wire(src.id, tgt.id, id, 'transform', 'Write a 3-sentence executive summary.')
      }
    }

    // 6 — Desk agent daily digest: two Notes --context--> Agent
    await header(id, COL[1], ROW[2], {
      header: '6 · Desk agent: daily digest',
      desc: 'Two Notes wired INTO a Desk Agent. It combines them on change.',
      needsKey: true
    })
    {
      const a = await makeWidget(id, 'note', 'Sales', 'Closed 3 deals, $42k. Pipeline healthy.', COL[1], ROW[2] + 84, 170, 130)
      const b = await makeWidget(id, 'note', 'Support', '11 tickets, 2 escalations, all resolved.', COL[1], ROW[2] + 222, 170, 120)
      const agent = await makeWidget(id, 'agent', 'Daily digest',
        agentBody('Combine the wired-in notes into a short daily digest with a heading per source.'),
        COL[1] + 300, ROW[2] + 84, SW, SH)
      await wire(a.id, agent.id, id, 'context')
      await wire(b.id, agent.id, id, 'context')
    }

    // 7 — Desk agent watching a table: Table --context--> Agent
    await header(id, COL[0], ROW[3], {
      header: '7 · Desk agent: watch a table',
      desc: 'A Table wired INTO an Agent. It flags rows on change and proposes.',
      needsKey: true
    })
    {
      const src = await makeWidget(id, 'table', 'Expenses', '', COL[0], ROW[3] + 84, SW, SH)
      const agent = await makeWidget(id, 'agent', 'Budget watcher',
        agentBody('Flag any expense over $1000 in the wired-in table and list them.'),
        COL[0] + 300, ROW[3] + 84, SW, SH)
      await wire(src.id, agent.id, id, 'context')
    }

    // 8 — Receive from a URL (no AI): Inbound hook --mirror--> Note
    await header(id, COL[1], ROW[3], {
      header: '8 · Receive from a URL',
      desc: 'Inbound webhook → mirror → Note. POST to its URL; the body lands here.',
      needsKey: false
    })
    {
      const src = await makeWidget(id, 'inbound-hook', 'Incoming hook', '', COL[1], ROW[3] + 84, SW, SH)
      const tgt = await makeWidget(id, 'note', 'Last received', '', COL[1] + 300, ROW[3] + 84, SW, SH)
      await wire(src.id, tgt.id, id, 'mirror')
    }

    // 9 — Send to a URL (no AI): Note --mirror--> Webhook
    await header(id, COL[0], ROW[4], {
      header: '9 · Send to a URL',
      desc: 'Note → mirror → outbound webhook. Set its URL; edits POST out.',
      needsKey: false
    })
    {
      const src = await makeWidget(id, 'note', 'Payload', 'This text POSTs out whenever it changes.', COL[0], ROW[4] + 84, SW, SH)
      const tgt = await makeWidget(id, 'webhook', 'Send to a URL', JSON.stringify({ url: '' }), COL[0] + 300, ROW[4] + 84, SW, SH)
      await wire(src.id, tgt.id, id, 'mirror')
    }

    // 10 — Rewrite clearer: Note --transform--> Card
    await header(id, COL[1], ROW[4], {
      header: '10 · Rewrite it clearer',
      desc: 'Rough Note → transform → Card. A polished version is written out.',
      needsKey: true
    })
    {
      const src = await makeWidget(id, 'note', 'Rough draft', 'we need 2 maybe get the thing done by like friday ish if poss thx',
        COL[1], ROW[4] + 84, SW, SH)
      const tgt = await makeWidget(id, 'card', 'Polished', '', COL[1] + 300, ROW[4] + 84, SW, SH)
      await wire(src.id, tgt.id, id, 'transform', 'Rewrite this clearly and professionally in one or two sentences.')
    }
  } catch (err) {
    console.warn('[showcase] build hit an error (partial desk kept):', (err as Error).message)
  }

  // Open the desk for real: setActive marks it current, but the VIEW store is what
  // MainPane renders from, so navigate there too — otherwise the command builds the
  // desk in the background and the user sees nothing happen.
  nodes.setActive(id)
  useViewStore.getState().goTask(id)
  return id
}
