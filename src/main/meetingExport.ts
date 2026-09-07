// M2c (SPEC-003 Part V §6) — export, the non-negotiable. "Transcript, Record
// and audio must all leave in open formats. Granola's missing export is a
// stated reason people distrust it." Markdown for humans, JSON for machines;
// audio is already open files on disk (meetingAudio) and is revealed rather
// than re-encoded.

import { BrowserWindow, dialog } from 'electron'
import { writeFile } from 'fs/promises'
import { getMeeting } from './db/meetings'
import { listTranscriptSegments } from './db/transcripts'
import { audioInfo } from './meetingAudio'

const fmtMs = (ms: number): string => {
  const s = Math.floor(ms / 1000)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

function toMarkdown(meetingId: string): string | null {
  const m = getMeeting(meetingId)
  if (!m) return null
  const segments = listTranscriptSegments(meetingId)
  const lines: string[] = [`# ${m.title}`, '']
  lines.push(`_${new Date(m.createdAt).toLocaleString()} · ${m.durationSec ? `${Math.round(m.durationSec / 60)} min` : 'duration unknown'}_`, '')
  const yours = (m.record?.spans ?? []).filter((s) => s.tier === 'yours')
  if (yours.length) {
    lines.push('## Your notes', '')
    for (const s of yours) lines.push(s.text)
    lines.push('')
  }
  if (m.actionItems.length) {
    lines.push('## Commitments', '')
    for (const a of m.actionItems) lines.push(`- [ ] ${a}`)
    lines.push('')
  }
  const rest = (m.record?.spans ?? []).filter((s) => s.tier !== 'yours')
  if (rest.length) {
    lines.push('## Brief', '')
    const sections = [...new Set(rest.map((s) => s.section ?? 'Notes'))]
    for (const sec of sections) {
      lines.push(`### ${sec}`, '')
      for (const s of rest.filter((x) => (x.section ?? 'Notes') === sec)) {
        // Provenance survives the export: heard is a quote with its clock
        // position; inferred is marked as the machine's synthesis.
        if (s.tier === 'heard' && s.startMs != null) lines.push(`> [${fmtMs(s.startMs)}] ${s.text}`)
        else lines.push(`${s.text} _(inferred)_`)
      }
      lines.push('')
    }
  } else if (m.summary) {
    lines.push('## Summary', '', m.summary, '')
  }
  if (segments.length) {
    lines.push('## Transcript', '')
    for (const s of segments) lines.push(`**[${fmtMs(s.startMs)}] ${s.speakerName || 'Speaker'}:** ${s.text}`)
    lines.push('')
  } else if (m.transcript) {
    lines.push('## Transcript', '', m.transcript, '')
  }
  const audio = audioInfo(meetingId)
  if (audio.present) lines.push('', `_Audio: ${audio.files} track(s) on this machine at ${audio.path}_`)
  return lines.join('\n')
}

export async function exportMeeting(
  meetingId: string,
  format: 'markdown' | 'json'
): Promise<{ ok: boolean; path?: string; error?: string }> {
  const m = getMeeting(meetingId)
  if (!m) return { ok: false, error: 'Meeting not found.' }
  const win = BrowserWindow.getAllWindows()[0]
  const safe = m.title.replace(/[^\w\s-]+/g, '').trim().replace(/\s+/g, '-').slice(0, 60) || 'meeting'
  const ext = format === 'markdown' ? 'md' : 'json'
  const res = await dialog.showSaveDialog(win, {
    title: 'Export meeting',
    defaultPath: `${safe}.${ext}`,
    filters: [format === 'markdown' ? { name: 'Markdown', extensions: ['md'] } : { name: 'JSON', extensions: ['json'] }]
  })
  if (res.canceled || !res.filePath) return { ok: false, error: 'cancelled' }
  try {
    if (format === 'markdown') {
      const md = toMarkdown(meetingId)
      if (!md) return { ok: false, error: 'Meeting not found.' }
      await writeFile(res.filePath, md, 'utf-8')
    } else {
      const payload = {
        meeting: m,
        segments: listTranscriptSegments(meetingId),
        audio: audioInfo(meetingId)
      }
      await writeFile(res.filePath, JSON.stringify(payload, null, 2), 'utf-8')
    }
    return { ok: true, path: res.filePath }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}
