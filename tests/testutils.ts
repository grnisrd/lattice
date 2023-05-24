import fs from 'node:fs'
import path from 'node:path'
import { BuildState, LatticeState, Logger } from 'lattice-cli'

const testroot = __dirname

/**
 * Return root directory for project in `/projects`.
 */
export function project(name: string) {
  return path.resolve(testroot, 'projects', name)
}

/**
 * Retrieve destination binary depending on platform.
 */
export function binary(lst: LatticeState) {
  return path.resolve(
    lst.root,
    lst.options.outdir ?? '/dist',
    lst.pkg.name + (process.platform === 'win32' ? '.exe' : '')
  )
}

/**
 * Fail a test if the lattice logger has errors. If `invert` is true, it will
 * fail if there are NO errors.
 */
export async function loghopper(
  fn: (log: Logger) => Promise<void>,
  invert?: boolean
) {
  const log = new Logger(true, true)
  await fn(log)
  log.unstatus()

  let reportedErrors: string[] = []
  for (const state of log.states) {
    if (state.errs.length > 0) {
      reportedErrors.push(...state.errs)
    }
  }

  invert
    ? expect(reportedErrors.length, reportedErrors.join('\n')).toBeGreaterThan(
        0
      )
    : expect(reportedErrors.length, reportedErrors.join('\n')).toBe(0)
}
