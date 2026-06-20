// Zero-dependency Rules-of-Hooks linter (uses the already-installed `typescript`).
//
// React requires hooks to run in the same order on every render. Two mistakes
// break that and crash the component at runtime, and neither is caught by tsc:
//   (A) a hook call AFTER a conditional early return in the same function body, and
//   (B) a hook call nested inside an if / loop / &&,||,?: whose nearest enclosing
//       function is the component or custom hook.
//
// This catches both, scoped to the nearest enclosing function so hooks inside
// event handlers / callbacks are not false-flagged. Exits non-zero on any finding
// so it can gate CI or a pre-commit hook. Run with `npm run lint:hooks`.

import ts from 'typescript'
import { readFileSync } from 'fs'
import { execSync } from 'child_process'

const ROOT = process.cwd()
const rels = execSync('find src -name "*.tsx" -o -name "*.ts"', { cwd: ROOT, encoding: 'utf8' })
  .trim()
  .split('\n')
  .filter(Boolean)

const isHookName = (n) => /^use[A-Z0-9]/.test(n)

function hookCalleeName(node) {
  if (!ts.isCallExpression(node)) return null
  const e = node.expression
  if (ts.isIdentifier(e) && isHookName(e.text)) return e.text
  if (ts.isPropertyAccessExpression(e) && ts.isIdentifier(e.name) && isHookName(e.name.text)) return e.name.text
  return null
}

const isFn = (n) =>
  ts.isFunctionDeclaration(n) ||
  ts.isFunctionExpression(n) ||
  ts.isArrowFunction(n) ||
  ts.isMethodDeclaration(n)

const findings = []

for (const rel of rels) {
  const file = `${ROOT}/${rel}`
  const src = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const lineOf = (node) => src.getLineAndCharacterOfPosition(node.getStart()).line + 1

  function analyzeFunction(fn) {
    const body = fn.body
    if (!body || !ts.isBlock(body)) return

    // (A) Conditional early return, then a top-level hook call.
    let guardLine = null
    for (const stmt of body.statements) {
      if (ts.isIfStatement(stmt) && containsDirectReturn(stmt)) {
        if (guardLine === null) guardLine = lineOf(stmt)
        continue
      }
      if (guardLine !== null) {
        const hook = topLevelHookOf(stmt)
        if (hook)
          findings.push({ rel, line: lineOf(stmt), kind: 'hook after early return', hook, guard: guardLine })
      }
    }

    // (B) Hooks inside a conditional/loop within this function.
    walkConditional(body, fn)
  }

  function containsDirectReturn(ifStmt) {
    const has = (s) =>
      !!s && (ts.isReturnStatement(s) || (ts.isBlock(s) && s.statements.some((x) => ts.isReturnStatement(x))))
    return has(ifStmt.thenStatement) || has(ifStmt.elseStatement)
  }

  function topLevelHookOf(stmt) {
    if (ts.isExpressionStatement(stmt)) {
      const n = hookCalleeName(stmt.expression)
      if (n) return n
    }
    if (ts.isVariableStatement(stmt)) {
      for (const d of stmt.declarationList.declarations) {
        if (d.initializer) {
          const n = hookCalleeName(d.initializer)
          if (n) return n
        }
      }
    }
    return null
  }

  function walkConditional(node, ownerFn) {
    const visit = (n, depth) => {
      if (n !== ownerFn && isFn(n)) return
      const hook = hookCalleeName(n)
      if (hook && depth > 0) findings.push({ rel, line: lineOf(n), kind: 'conditional hook', hook })
      n.forEachChild((child) => {
        let inc = 0
        if (ts.isIfStatement(n)) {
          if (child === n.thenStatement || child === n.elseStatement) inc = 1
        } else if (
          ts.isForStatement(n) ||
          ts.isForInStatement(n) ||
          ts.isForOfStatement(n) ||
          ts.isWhileStatement(n) ||
          ts.isDoStatement(n)
        ) {
          if (child === n.statement) inc = 1
        } else if (ts.isConditionalExpression(n)) {
          if (child === n.whenTrue || child === n.whenFalse) inc = 1
        } else if (ts.isBinaryExpression(n)) {
          const op = n.operatorToken.kind
          if (
            (op === ts.SyntaxKind.AmpersandAmpersandToken ||
              op === ts.SyntaxKind.BarBarToken ||
              op === ts.SyntaxKind.QuestionQuestionToken) &&
            child === n.right
          )
            inc = 1
        }
        visit(child, depth + inc)
      })
    }
    visit(node, 0)
  }

  const walk = (node) => {
    if (isFn(node)) analyzeFunction(node)
    node.forEachChild(walk)
  }
  walk(src)
}

const seen = new Set()
const out = findings.filter((f) => {
  const k = `${f.rel}:${f.line}:${f.kind}:${f.hook}`
  if (seen.has(k)) return false
  seen.add(k)
  return true
})
out.sort((a, b) => (a.rel === b.rel ? a.line - b.line : a.rel.localeCompare(b.rel)))

for (const f of out) {
  console.error(`${f.rel}:${f.line}  [${f.kind}] ${f.hook}${f.guard ? ` (guard@${f.guard})` : ''}`)
}
if (out.length) {
  console.error(`\nRules-of-Hooks check FAILED: ${out.length} violation(s). Move hooks above any early return; never call a hook conditionally.`)
  process.exit(1)
}
console.log(`Rules-of-Hooks check passed (${rels.length} files, 0 violations).`)
