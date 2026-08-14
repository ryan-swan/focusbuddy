import type { DemoScenario } from './demoEngine'

// ─────────────────────────────────────────────────────────────────────────────
// "One Week, One Desk" — the flagship demo.
//
// Shaped around the one claim no competitor can make: you leave, you come back,
// and nothing has to be rebuilt. Acts I and II earn that; Act III spends it.
// If you cut for time, cut inside Act II — never cut Act III.
//
// PACING: `durationMs` is the hold AFTER a step's action finishes, so a typing
// step's real length is (typing time + hold). Holds are set so a viewer can
// finish reading the caption AND look at what changed on screen before the next
// beat. When in doubt, longer — a demo that breathes reads as confidence.
//
// EDITING: every line the viewer reads is a `caption`. Every piece of content is
// a plain string constant. Rewrite freely; the engine doesn't care.
// ─────────────────────────────────────────────────────────────────────────────

// Existing tools deployed INTO the project. Real webviews — whatever the app
// shows is what appears, including a login wall if the session isn't signed in.
// Sign in inside Plexii before recording, or swap for pages that look good cold.
const SLACK = 'https://app.slack.com'
const NOTION = 'https://www.notion.so'
const CLAUDE = 'https://claude.ai/new'
const FIGMA = 'https://www.figma.com'

// Ids the script threads between steps. Reset on the first step of every run so
// a second run never inherits the previous run's desk.
let roomId: string | null = null
let secondDeskId: string | null = null
// Widget ids captured at creation. Looking widgets up by title was unreliable:
// a webview rewrites its own content/title as the page navigates (claude.ai/new
// redirects to a chat URL), so the lookup missed and Focus Mode never opened.
let claudeWidgetId: string | null = null
let checklistWidgetId: string | null = null

const BUILD_NOTE = `Site build
[ ] Wire homepage
[ ] Port copy from positioning doc
[ ] Handoff to dev Friday`

// App windows are sized to show a genuinely usable page, not a thumbnail — the
// whole point is that these are real, working tools rather than screenshots.
const APP_W = 660
const APP_H = 480

const BRIEF = `Northwind — full rebrand, live by Q3.
Logo, website copy (6 pages), social kit.
Kickoff call Friday 10am. Budget ceiling $8,500.`

const CHECKLIST = `[ ] Send intro deck
[ ] Book discovery call
[ ] Review existing brand assets`

const CHECKLIST_DONE = `[x] Send intro deck
[ ] Book discovery call
[ ] Review existing brand assets`

const ASSISTANT_ANSWER = `Three things are open on this desk.

"Review existing brand assets" hasn't moved in 6 days — it's blocking the copy work.
Your brief says 6 pages of website copy; the Notion scope still says 4.
Nobody owns booking the discovery call.

Friday's call is the deadline for all three.`

// What gets carried out of the Claude thread into the native document.
const POSITIONING = [
  'Northwind — positioning, v1',
  '',
  'Northwind is the utility company that answers on the first ring.',
  '',
  'Not the cheapest. Not the biggest. The one that picks up — and the one that tells you what went wrong before you have to ask.',
  '',
  'Proof points: 4-minute average response, published outage log, no call trees.'
]

const WHATS_CHANGED = `Since you were last here (Monday):

• Dana replied — brand assets are in the shared folder
• Notion scope corrected to 6 pages
• Discovery call booked, Thursday 2pm

Nothing else moved.`

// The closing beat: the assistant reads the WHOLE desk, not one widget.
const CANVAS_SUMMARY = `Northwind — Brand Refresh, as it stands.

On this desk: the signed brief, your checklist, Slack and Notion,
two Claude threads, the budget sheet, the approval flow,
and the positioning doc you wrote on Wednesday.

Done: intro deck sent. Logo direction approved in Slack.
Open: copy review (unowned), 6-page scope now correct in Notion.
Next: discovery call Thursday 2pm.

Nothing here needed filing. It was all just left where it happened.`

export const scenarioWeek: DemoScenario = {
  id: 1,
  title: 'One Week, One Desk',
  subtitle: 'How a client project actually runs in Plexii',
  steps: [
    // ══ ACT I — MONDAY ══════════════════════════════════════════════════════
    {
      act: 'Monday',
      caption:
        'Right now this project lives in thirty-four browser tabs you are afraid to close.',
      durationMs: 5000,
      action: async (ctx) => {
        roomId = null
        secondDeskId = null
        claudeWidgetId = null
        checklistWidgetId = null
        await ctx.delay(800)
      }
    },
    {
      caption:
        'And every tool wants you to start inside it. A record in HubSpot. A channel in Slack. A space in ClickUp. The same project, created five times, in five places.',
      durationMs: 5800,
      action: async (ctx) => {
        await ctx.delay(700)
      }
    },
    {
      caption: 'Plexii inverts that. You create the project once — then deploy the tools into it.',
      durationMs: 5000,
      action: async (ctx) => {
        const room = await ctx.createNode({ parentId: null, kind: 'folder', title: 'Client Work' })
        roomId = room.id
        const desk = await ctx.createNode({
          parentId: room.id,
          kind: 'task',
          title: 'Northwind — Brand Refresh'
        })
        ctx.setDeskId(desk.id)
        ctx.setActiveTask(desk.id)
        ctx.navigate(desk.id)
        await ctx.camera({ x: 0, y: 0, zoom: 1, ms: 0 })
        await ctx.delay(900)
      }
    },
    {
      caption: 'Everything you already know — captured once, before it scatters.',
      actor: 'you',
      durationMs: 3400,
      action: async (ctx) => {
        if (!ctx.deskId || ctx.isCancelled()) return
        const w = await ctx.createWidget({
          taskId: ctx.deskId,
          kind: 'note',
          title: 'Project brief',
          content: '',
          x: 60,
          y: 60,
          width: 460,
          height: 250
        })
        await ctx.typeInto((t) => void ctx.updateWidgetContent(w.id, t), BRIEF, 24)
      }
    },
    {
      caption: 'The work you owe, sitting next to the work itself.',
      actor: 'you',
      durationMs: 3600,
      action: async (ctx) => {
        if (!ctx.deskId || ctx.isCancelled()) return
        const w = await ctx.createWidget({
          taskId: ctx.deskId,
          kind: 'sticky',
          title: '',
          content: '',
          x: 60,
          y: 350,
          width: 400,
          height: 220
        })
        checklistWidgetId = w.id
        await ctx.typeInto((t) => void ctx.updateWidgetContent(w.id, t), CHECKLIST, 26)
      }
    },
    {
      caption: 'Then bring the tools you already use. Nothing gets replaced — Slack is still Slack.',
      durationMs: 5200,
      action: async (ctx) => {
        if (!ctx.deskId || ctx.isCancelled()) return
        await ctx.createWidget({
          taskId: ctx.deskId,
          kind: 'webview',
          title: 'Slack — #northwind',
          content: SLACK,
          x: 580,
          y: 60,
          width: APP_W,
          height: APP_H
        })
        await ctx.camera({ x: -180, y: 0, zoom: 0.9, ms: 1000 })
        await ctx.delay(1600)
        if (ctx.isCancelled()) return
        await ctx.createWidget({
          taskId: ctx.deskId,
          kind: 'webview',
          title: 'Notion — Scope',
          content: NOTION,
          x: 1300,
          y: 60,
          width: APP_W,
          height: APP_H
        })
        await ctx.camera({ x: -640, y: 0, zoom: 0.8, ms: 1200 })
      }
    },
    {
      caption:
        'Full pages, not thumbnails — these are the real tools, running here. Working in them means working on the project.',
      durationMs: 4000,
      action: async (ctx) => {
        await ctx.delay(600)
      }
    },
    {
      caption:
        'This is the desk now. The tabs, the searches, the tools — all of it saved in one place. Close the laptop; none of it is lost.',
      durationMs: 4800,
      action: async (ctx) => {
        await ctx.camera({ x: -300, y: 0, zoom: 0.68, ms: 1300 })
        await ctx.delay(900)
      }
    },

    // ══ ACT II — WEDNESDAY ══════════════════════════════════════════════════
    {
      act: 'Wednesday',
      caption: 'Two days of real work later. The desk has been collecting context the whole time.',
      durationMs: 3600,
      action: async (ctx) => {
        await ctx.delay(500)
      }
    },
    {
      caption: 'So ask about the project — not about a file you have to go and find first.',
      durationMs: 4000,
      action: async (ctx) => {
        ctx.assistant(true, 'today')
        await ctx.delay(1800)
      }
    },
    {
      caption:
        'It answers from this desk. The brief, the checklist, the threads — it already has them. Nothing was pasted in.',
      actor: 'ai',
      durationMs: 4200,
      action: async (ctx) => {
        if (!ctx.deskId || ctx.isCancelled()) return
        ctx.assistant(false)
        const w = await ctx.createWidget({
          taskId: ctx.deskId,
          kind: 'note',
          title: 'Plexii — what is open here',
          content: '',
          x: 60,
          y: 640,
          width: 460,
          height: 340
        })
        await ctx.camera({ x: -40, y: -320, zoom: 0.9, ms: 1100 })
        await ctx.typeInto((t) => void ctx.updateWidgetContent(w.id, t), ASSISTANT_ANSWER, 16)
      }
    },
    {
      caption:
        'And Plexii is not only a home for other people’s tools. It has its own — documents, spreadsheets, flowcharts, all native, all on the canvas.',
      durationMs: 5600,
      action: async (ctx) => {
        if (!ctx.deskId || ctx.isCancelled()) return
        await ctx.createDocWidget('sheet', 'Northwind — Budget', {
          x: 580,
          y: 640,
          width: 560,
          height: 380
        })
        await ctx.delay(1400)
        if (ctx.isCancelled()) return
        await ctx.createDocWidget('map', 'Approval flow', {
          x: 1200,
          y: 640,
          width: 560,
          height: 380
        })
        await ctx.camera({ x: -320, y: -300, zoom: 0.72, ms: 1200 })
      }
    },
    {
      caption: 'Two Claude threads, side by side — one drafting copy, one digging through research.',
      durationMs: 5200,
      action: async (ctx) => {
        if (!ctx.deskId || ctx.isCancelled()) return
        const first = await ctx.createWidget({
          taskId: ctx.deskId,
          kind: 'webview',
          title: 'Claude — positioning',
          content: CLAUDE,
          x: 60,
          y: 1080,
          width: APP_W,
          height: APP_H
        })
        claudeWidgetId = first.id
        await ctx.delay(1400)
        if (ctx.isCancelled()) return
        await ctx.createWidget({
          taskId: ctx.deskId,
          kind: 'webview',
          title: 'Claude — competitor scan',
          content: CLAUDE,
          x: 780,
          y: 1080,
          width: APP_W,
          height: APP_H
        })
        await ctx.camera({ x: -60, y: -760, zoom: 0.78, ms: 1200 })
      }
    },
    {
      caption: 'Getting crowded? Tidy the desk.',
      durationMs: 3200,
      action: async (ctx) => {
        await ctx.camera({ x: 0, y: 0, zoom: 0.42, ms: 1200 })
        await ctx.delay(600)
        await ctx.tidy('square')
        await ctx.delay(1200)
      }
    },
    {
      caption:
        'Everything squares up into one arrangement. It is like having six monitors — except you only need the one screen.',
      durationMs: 5200,
      action: async (ctx) => {
        await ctx.camera({ x: 0, y: 0, zoom: 0.5, ms: 1400 })
        await ctx.delay(1000)
      }
    },
    {
      caption: 'Need to concentrate on one? Open it full-screen. The desk is still there behind it.',
      durationMs: 4800,
      action: async (ctx) => {
        if (!ctx.deskId || ctx.isCancelled()) return
        if (claudeWidgetId) ctx.focus(claudeWidgetId)
        await ctx.delay(2200)
      }
    },
    {
      caption: 'Bring a PlexiiDoc up beside it — then move the good part across. It is yours now, in your document, on your desk.',
      actor: 'ai',
      durationMs: 5200,
      action: async (ctx) => {
        if (!ctx.deskId || ctx.isCancelled()) return
        const { widgetId, docId } = await ctx.createDocWidget('doc', 'Northwind — Positioning', {
          x: 60,
          y: 1640,
          width: 640,
          height: 440
        })
        ctx.splitWith(widgetId)
        await ctx.delay(1600)
        if (ctx.isCancelled()) return
        await ctx.writeDoc(docId, POSITIONING)
        await ctx.delay(900)
      }
    },
    {
      caption: 'Then step back out. Everything exactly where you left it.',
      durationMs: 4200,
      action: async (ctx) => {
        ctx.unsplit()
        ctx.focus(null)
        await ctx.delay(900)
        await ctx.camera({ x: 0, y: 0, zoom: 0.5, ms: 1300 })
      }
    },
    {
      caption: 'Check one off. The desk records what moved, so you never have to remember that it did.',
      durationMs: 4200,
      action: async (ctx) => {
        if (!ctx.deskId || ctx.isCancelled()) return
        if (checklistWidgetId) await ctx.updateWidgetContent(checklistWidgetId, CHECKLIST_DONE)
        await ctx.delay(1400)
      }
    },
    {
      caption:
        'And this is one desk. A room holds as many as you need — a new desk is just a new file in the folder.',
      durationMs: 5200,
      action: async (ctx) => {
        if (ctx.isCancelled()) return
        const second = await ctx.createNode({
          parentId: roomId,
          kind: 'task',
          title: 'Northwind — Website Build'
        })
        secondDeskId = second.id
        ctx.setActiveTask(second.id)
        ctx.navigate(second.id)
        await ctx.camera({ x: 0, y: 0, zoom: 1, ms: 0 })
        await ctx.delay(1400)
      }
    },
    {
      caption: 'Different work, so different tools — same room, same project, its own desk.',
      durationMs: 5600,
      action: async (ctx) => {
        if (!secondDeskId || ctx.isCancelled()) return
        await ctx.createWidget({
          taskId: secondDeskId,
          kind: 'webview',
          title: 'Figma — Northwind site',
          content: FIGMA,
          x: 60,
          y: 60,
          width: APP_W,
          height: APP_H
        })
        await ctx.delay(1200)
        if (ctx.isCancelled()) return
        await ctx.createWidget({
          taskId: secondDeskId,
          kind: 'sticky',
          title: '',
          content: BUILD_NOTE,
          x: 780,
          y: 60,
          width: 400,
          height: 220
        })
        await ctx.camera({ x: -60, y: 0, zoom: 0.8, ms: 1100 })
        await ctx.delay(1200)
      }
    },
    {
      caption: 'Both desks saved. Both organised in the room. Switch between them and nothing is packed away.',
      durationMs: 5600,
      action: async (ctx) => {
        if (!ctx.deskId || ctx.isCancelled()) return
        ctx.setActiveTask(ctx.deskId)
        ctx.navigate(ctx.deskId)
        await ctx.camera({ x: 0, y: 0, zoom: 0.5, ms: 1300 })
        await ctx.delay(1200)
      }
    },

    // ══ ACT III — THURSDAY · the payoff ═════════════════════════════════════
    {
      act: 'Thursday',
      caption: 'Here is the part every other tool gets wrong. You close the laptop for three days.',
      durationMs: 4800,
      action: async (ctx) => {
        await ctx.camera({ zoom: 0.34, ms: 1500 })
        await ctx.delay(1000)
      }
    },
    {
      caption: 'You come back. Nothing to reassemble. No tabs to reopen. No "where was I".',
      durationMs: 4800,
      action: async (ctx) => {
        if (!ctx.deskId) return
        ctx.navigate(ctx.deskId)
        await ctx.camera({ zoom: 0.5, ms: 1400 })
        await ctx.delay(600)
      }
    },
    {
      caption: 'And the desk tells you what changed while you were gone.',
      actor: 'ai',
      durationMs: 4400,
      action: async (ctx) => {
        if (!ctx.deskId || ctx.isCancelled()) return
        const w = await ctx.createWidget({
          taskId: ctx.deskId,
          kind: 'sticky',
          title: '',
          content: '',
          x: 60,
          y: 2160,
          width: 440,
          height: 260
        })
        await ctx.camera({ x: -20, y: -1500, zoom: 0.9, ms: 1300 })
        await ctx.typeInto((t) => void ctx.updateWidgetContent(w.id, t), WHATS_CHANGED, 20)
      }
    },
    {
      caption: 'Then ask it to read the whole desk — every tool, every document, all of it — and tell you where the project actually stands.',
      durationMs: 4600,
      action: async (ctx) => {
        await ctx.camera({ x: -20, y: -1400, zoom: 0.6, ms: 1200 })
        ctx.assistant(true, 'chat')
        await ctx.delay(2200)
      }
    },
    {
      caption: 'One answer, from everything on the canvas at once.',
      actor: 'ai',
      durationMs: 7000,
      action: async (ctx) => {
        if (ctx.isCancelled()) return
        ctx.chatSay(CANVAS_SUMMARY)
        await ctx.delay(3000)
      }
    },
    {
      caption:
        'One desk. Every tool you already use, plus the ones Plexii brings. Context that was never lost — because it never left.',
      durationMs: 5400,
      action: async (ctx) => {
        await ctx.camera({ x: 0, y: 0, zoom: 0.3, ms: 1800 })
        await ctx.delay(1400)
      }
    },
    {
      caption: '',
      durationMs: 0,
      action: async () => {
        // End card — rendered by DemoOverlay off the demoComplete flag.
      }
    }
  ]
}
