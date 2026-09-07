// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { transcriptLooksEmpty, NO_SPEECH_MESSAGE } from '../../src/renderer/src/lib/transcriptSanity'

// DEC-130 — a transcript that is not a transcript. The operator's own record
// (2026-09-07): 177 seconds of digital silence came back as "you you you you
// you you", was summarised, and filed as a meeting.

describe('transcriptLooksEmpty', () => {
  it('the operator\'s own case: "you you you you you you" over 177 s', () => {
    expect(transcriptLooksEmpty('you you you you you you', 177.18)).toBe(true)
  })
  it('Whisper\'s stock phrases for silence, at any length', () => {
    expect(transcriptLooksEmpty('Thank you.', 60)).toBe(true)
    expect(transcriptLooksEmpty('Thanks for watching!', 8)).toBe(true)
    expect(transcriptLooksEmpty('[BLANK_AUDIO]', 30)).toBe(true)
    expect(transcriptLooksEmpty('you.', 3)).toBe(true)
  })
  it('empty and whitespace', () => {
    expect(transcriptLooksEmpty('', 10)).toBe(true)
    expect(transcriptLooksEmpty('   \n ', 10)).toBe(true)
  })
  it('a long take with almost no text is a machine filling silence; a short real answer is not', () => {
    expect(transcriptLooksEmpty('Okay so um', 120)).toBe(true) // ten characters over two minutes
    expect(transcriptLooksEmpty('Hello there everyone', 90)).toBe(false)
    expect(transcriptLooksEmpty('Yes.', 30)).toBe(false) // under a minute, the rule stays out of it
  })
  it('real speech is never refused', () => {
    const real = 'The quarterly review moves to Thursday at 10. Caleb owns the vendor follow up and the road map draft is due Friday.'
    expect(transcriptLooksEmpty(real, 7.5)).toBe(false)
    expect(transcriptLooksEmpty('Yeah, but for the sake of testing.', 9)).toBe(false)
    expect(transcriptLooksEmpty('Thank you so much for joining today, let\'s get started with the roadmap.', 12)).toBe(false)
    // a short real answer in a long recording of mostly listening is still speech
    expect(transcriptLooksEmpty('Sounds good, I will send the draft on Friday and loop in Caleb.', 200)).toBe(false)
  })
  it('the message names the likely cause and the fix', () => {
    expect(NO_SPEECH_MESSAGE).toContain('No speech was captured')
    expect(NO_SPEECH_MESSAGE).toContain('Microphone')
  })
})
