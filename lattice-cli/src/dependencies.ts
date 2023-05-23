import fs from 'node:fs'
import path from 'node:path'
import { LatticePackage, LatticeState } from './state'

/**
 * Calculates the include paths for this state's dependencies.
 */
export async function dependencyIncludePathsForState(state: LatticeState) {
  const paths = [] as string[]

  const dep = async (pkgname: string) => {
    let realpkgpath
    if (pkgname.startsWith('@')) {
      const [pkgorg, realname] = pkgname.split('/')
      realpkgpath = path.join(state.root, 'node_modules', pkgorg, realname)
    } else {
      realpkgpath = path.join(state.root, 'node_modules', pkgname)
    }

    const depinfopath = path.join(realpkgpath, 'package.json')
    if (!fs.existsSync(depinfopath)) {
      throw new Error(
        `Project depends on "${pkgname}", which lacks a package.json (malformed dependency?)`
      )
    }

    const depinfo = JSON.parse(
      await fs.promises.readFile(depinfopath, 'utf-8')
    ) as LatticePackage
    if (
      depinfo.main === undefined ||
      !depinfo.main.endsWith('.c') ||
      !depinfo.lattice ||
      depinfo.lattice.buildOptions?.type !== 'lib'
    ) {
      throw new Error(
        `Project depends on "${pkgname}", which isn't a C library. If your project depends on JavaScript libraries, install them as devDependencies.`
      )
    }

    const latticeInfo = depinfo.lattice
    if (!latticeInfo.exports || latticeInfo.exports.length === 0) {
      console.warn(`Dependency "${pkgname}" does not export any headers.`)
      return
    }

    // TODO: Make sure header paths can't leave the pkg's directory.
    for (const exportedheaderdir of latticeInfo.exports) {
      paths.push(path.resolve(realpkgpath, exportedheaderdir))
    }
  }

  // TODO: Workspace resolution
  if (state.pkg.dependencies) {
    for (const [pkgname, _] of Object.entries(state.pkg.dependencies)) {
      await dep(pkgname)
    }
  }

  return paths as readonly string[]
}
