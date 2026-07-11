import type { DemoScenario } from './demoEngine'

const AI_RESPONSE = `You have 3 open tasks. 'Finalize copy' has been open 6 days with no updates — likely stuck. The note about stakeholder approval appears unresolved. Recommend flagging both before Friday.`

const AI_DRAFT = `Hi team,\n\nQuick update on Q3 Product Launch:\n\n• Copy is in final review — targeting sign-off by Thursday\n• Design assets are staged and waiting on copy\n• Stakeholder deck will be ready for Friday's review\n\nOne blocker: still need approval from Sarah on the messaging framework. Will follow up directly.\n\nMore soon,\nJordan`

export const scenario2: DemoScenario = {
  id: 2,
  title: 'Unlocking the Full System',
  steps: [
    {
      caption: "You've been doing this the hard way.",
      durationMs: 2500,
      action: async (ctx) => {
        const desk = await ctx.createNode({
          parentId: null,
          kind: 'task',
          title: 'Q3 Product Launch'
        })
        ctx.setDeskId(desk.id)
        ctx.setActiveTask(desk.id)
        ctx.navigate(desk.id)
        await ctx.delay(500)
        if (ctx.isCancelled()) return

        // Pre-fill a note
        const note = await ctx.createWidget({
          taskId: desk.id,
          kind: 'note',
          title: 'Status',
          content:
            'Stakeholder approval needed\nCopy review overdue\nDesign assets waiting on feedback',
          x: 40,
          y: 40,
          width: 380,
          height: 160
        })
        await ctx.updateWidgetContent(
          note.id,
          'Stakeholder approval needed\nCopy review overdue\nDesign assets waiting on feedback'
        )

        // Pre-fill task list
        await ctx.createWidget({
          taskId: desk.id,
          kind: 'task-list',
          title: 'Tasks',
          content: '{}',
          x: 440,
          y: 40,
          width: 320,
          height: 260
        })
        const tasks = ['Finalize copy', 'Coordinate with design', 'Send stakeholder update']
        for (const title of tasks) {
          if (ctx.isCancelled()) return
          await ctx.createNode({ parentId: desk.id, kind: 'task-item', title })
          await ctx.delay(300)
        }
      }
    },
    {
      caption: "Ask the AI what's actually going on.",
      durationMs: 4500,
      action: async (ctx) => {
        if (!ctx.deskId || ctx.isCancelled()) return
        let text = ''
        const widget = await ctx.createWidget({
          taskId: ctx.deskId,
          kind: 'note',
          title: 'AI Response',
          content: '',
          x: 40,
          y: 220,
          width: 500,
          height: 200
        })
        await ctx.typeInto(
          (t) => {
            text = t
            void ctx.updateWidgetContent(widget.id, t)
          },
          AI_RESPONSE,
          22
        )
        await ctx.updateWidgetContent(widget.id, text)
      }
    },
    {
      caption: "Let AI draft the thing you've been avoiding.",
      durationMs: 6000,
      action: async (ctx) => {
        if (!ctx.deskId || ctx.isCancelled()) return
        let text = ''
        const widget = await ctx.createWidget({
          taskId: ctx.deskId,
          kind: 'note',
          title: 'AI Draft',
          content: '',
          x: 40,
          y: 440,
          width: 500,
          height: 280
        })
        await ctx.typeInto(
          (t) => {
            text = t
            void ctx.updateWidgetContent(widget.id, t)
          },
          AI_DRAFT,
          18
        )
        await ctx.updateWidgetContent(widget.id, text)
      }
    },
    {
      caption: 'Pull in your tools — right on the canvas.',
      durationMs: 2500,
      action: async (ctx) => {
        if (!ctx.deskId || ctx.isCancelled()) return
        await ctx.createWidget({
          taskId: ctx.deskId,
          kind: 'webview',
          title: 'Figma',
          content: 'https://figma.com',
          x: 560,
          y: 40,
          width: 400,
          height: 300
        })
        await ctx.delay(800)
      }
    },
    {
      caption:
        'Your tasks scattered across desks? Here they are — all in one place.',
      durationMs: 2000,
      action: async (ctx) => {
        await ctx.delay(2000)
      }
    },
    {
      caption: "You've been using 20% of this. Now you know where the other 80% lives.",
      durationMs: 3000,
      action: async (ctx) => {
        await ctx.delay(3000)
      }
    },
    {
      caption: '',
      durationMs: 0,
      action: async (_ctx) => {
        // end card
      }
    }
  ]
}
