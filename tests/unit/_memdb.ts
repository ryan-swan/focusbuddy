import { DatabaseSync } from 'node:sqlite'
import type { SqlDb } from '../../src/main/db/eventStore'

// Shared in-memory SqlDb for unit tests. Production runs better-sqlite3 (Electron
// ABI, which the test runner cannot load); this drives the same store code
// through Node's built-in node:sqlite via the store's minimal SqlDb interface.
export function memSqlDb(): SqlDb {
  const d = new DatabaseSync(':memory:')
  return {
    exec: (sql) => d.exec(sql),
    prepare: (sql) => {
      const s = d.prepare(sql)
      return {
        run: (...a) => s.run(...(a as never[])),
        get: (...a) => s.get(...(a as never[])),
        all: (...a) => s.all(...(a as never[])) as unknown[]
      }
    },
    transaction: (fn) => () => {
      d.exec('BEGIN')
      try {
        const r = fn()
        d.exec('COMMIT')
        return r
      } catch (e) {
        d.exec('ROLLBACK')
        throw e
      }
    }
  }
}
