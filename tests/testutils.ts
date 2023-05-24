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
 * Fail a test if the lattice logger has errors.
 */
export async function loghopper(fn: (log: Logger) => Promise<void>) {
  const log = new Logger(true)
  await fn(log)
  expect(log.state.errs.length, log.state.errs.join('\n')).toBe(0)
}
