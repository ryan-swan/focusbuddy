import { describe, it, expect } from 'vitest'
import { FILES, expected, vendored, canonicalAvailable } from '../../scripts/sync-contract.mjs'

// The public desk contract is vendored into src/shared because this repository
// is cloned standalone and cannot reach projects/haptyx-shared. A vendored copy
// is only honest if something enforces that it matches: the moment it drifts,
// the desktop can publish a shape the server validates against different rules.
describe('vendored public desk contract', () => {
  it.skipIf(!canonicalAvailable).each(FILES)('%s matches the canonical source', (file) => {
    expect(vendored(file), `src/shared/${file} is missing — run: npm run sync:contract`).not.toBeNull()
    expect(
      vendored(file),
      `src/shared/${file} has drifted — run: npm run sync:contract`
    ).toBe(expected(file))
  })
})
