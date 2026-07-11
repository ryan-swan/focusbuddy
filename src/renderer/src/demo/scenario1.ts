import type { DemoScenario } from './demoEngine'

export const scenario1: DemoScenario = {
  id: 1,
  title: 'Your First Desk',
  steps: [
    {
      caption: 'Start with a blank canvas.',
      durationMs: 2000,
      action: async (ctx) => {
        const desk = await ctx.createNode({
          parentId: null,
          kind: 'task',
          title: 'Rival Agency — Brand Refresh'
        })
        ctx.setDeskId(desk.id)
        ctx.setActiveTask(desk.id)
        ctx.navigate(desk.id)
        await ctx.delay(600)
      }
    },
    {
      caption: 'Capture everything you know right now.',
      durationMs: 4000,
      action: async (ctx) => {
        if (!ctx.deskId || ctx.isCancelled()) return
        let text = ''
        const widget = await ctx.createWidget({
          taskId: ctx.deskId,
          kind: 'note',
          title: 'Project brief',
          content: '',
          x: 40,
          y: 40,
          width: 380,
          height: 220
        })
        const target = 'Client wants a full rebrand by Q3. Logo, website copy, social kit. First call Friday.'
        await ctx.typeInto(
          (t) => {
            text = t
            void ctx.updateWidgetContent(widget.id, t)
          },
          target,
          28
        )
        await ctx.updateWidgetContent(widget.id, text)
      }
    },
    {
      caption: 'Drop in your tasks before you forget them.',
      durationMs: 3500,
      action: async (ctx) => {
        if (!ctx.deskId || ctx.isCancelled()) return
        await ctx.createWidget({
          taskId: ctx.deskId,
          kind: 'task-list',
          title: 'Tasks',
          content: '{}',
          x: 440,
          y: 40,
          width: 320,
          height: 320
        })
        const taskTitles = ['Send intro deck', 'Book discovery call', 'Review existing brand assets']
        for (const title of taskTitles) {
          if (ctx.isCancelled()) return
          await ctx.createNode({ parentId: ctx.deskId, kind: 'task-item', title })
          await ctx.delay(600)
        }
      }
    },
    {
      caption: 'Check one off.',
      durationMs: 2000,
      action: async (ctx) => {
        if (!ctx.deskId || ctx.isCancelled()) return
        // Find the first task-item under this desk in the node store — we look
        // via the IPC list because ctx doesn't expose the store directly.
        const all = await window.api.nodes.list()
        const first = all.find((n) => n.parentId === ctx.deskId && n.kind === 'task-item')
        if (first) {
          await ctx.updateNode(first.id, { status: 'done' })
        }
        await ctx.delay(800)
      }
    },
    {
      caption: "Add a sticky note for the thing you can't lose.",
      durationMs: 3500,
      action: async (ctx) => {
        if (!ctx.deskId || ctx.isCancelled()) return
        let text = ''
        const widget = await ctx.createWidget({
          taskId: ctx.deskId,
          kind: 'sticky',
          title: '',
          content: '',
          x: 40,
          y: 280,
          width: 260,
          height: 160
        })
        const target = "Budget: $8,500 — don't go over without approval"
        await ctx.typeInto(
          (t) => {
            text = t
            void ctx.updateWidgetContent(widget.id, t)
          },
          target,
          30
        )
        await ctx.updateWidgetContent(widget.id, text)
      }
    },
    {
      caption: 'This project is getting real. Give it a home.',
      durationMs: 2500,
      action: async (ctx) => {
        if (!ctx.deskId || ctx.isCancelled()) return
        const room = await ctx.createNode({
          parentId: null,
          kind: 'folder',
          title: 'Client Work'
        })
        await ctx.updateNode(ctx.deskId, { parentId: room.id })
        await ctx.delay(500)
      }
    },
    {
      caption: 'One desk. Everything in one place.',
      durationMs: 2500,
      action: async (ctx) => {
        await ctx.delay(2500)
      }
    },
    {
      caption: '',
      durationMs: 0,
      action: async (_ctx) => {
        // end card — handled by useDemo via demoComplete flag
      }
    }
  ]
}
