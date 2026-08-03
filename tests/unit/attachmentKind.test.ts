import { describe, it, expect } from 'vitest'
import { attachmentKindForMime } from '../../src/renderer/src/lib/messagingClient'

// The one piece of real logic behind chat attachments: classifying a picked file
// into an attachment kind from its MIME type. A video message must classify as
// 'video' so it sends + renders as a video, not a generic file.

describe('attachmentKindForMime', () => {
  it('classifies video files as a video message', () => {
    expect(attachmentKindForMime('video/webm')).toBe('video')
    expect(attachmentKindForMime('video/mp4')).toBe('video')
    expect(attachmentKindForMime('video/quicktime')).toBe('video')
  })
  it('keeps GIFs distinct from other images', () => {
    expect(attachmentKindForMime('image/gif')).toBe('gif')
    expect(attachmentKindForMime('image/png')).toBe('image')
    expect(attachmentKindForMime('image/jpeg')).toBe('image')
  })
  it('classifies audio as a voice note and everything else as a file', () => {
    expect(attachmentKindForMime('audio/webm')).toBe('voice')
    expect(attachmentKindForMime('application/pdf')).toBe('file')
    expect(attachmentKindForMime('')).toBe('file')
  })
})
