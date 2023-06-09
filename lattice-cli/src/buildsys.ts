import fs from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'

import { ILogger } from './logsys'
import createState, { LatticeState, LatticePackage } from './state'
import { MalformedDependencyError } from './exception'

/**
 * Root of lattice-cli's source code.
 */
let sourceroot: string

// HACK: Adjust vitest dependency configuration to avoid this problem in the future.
if (process.env.VITEST) {
  sourceroot = path.resolve(__dirname, 'lattice-cli')
} else {
  sourceroot = path.resolve(__dirname, '..')
}

export interface BuildState {
  /**
   * Prepare this bst for JIT execution.
   */
  jit?: boolean

  /**
   * Set by `build(...)` after main project is compiled. If `true`, this bst can be
   * passed to `execJitBst` to run the package.
   */
  readonly jitReady?: boolean

  /**
   * List of built projects (including dependencies).
   */
  built: Record<string, boolean>

  /**
   * Main state.
   */
  rootState: LatticeState

  /**
   * All built dependencies.
   */
  rootDeps: DependencyInfo[]

  /**
   * Path to compiler binary.
   */
  compilerPath: string

  /**
   * Folder into which library output files are moved into.
   */
  libraryContainer: string

  /**
   * Force boundary check compilation if root project as `app+deps` -b setting.
   */
  forceBoundaryChkForDeps?: boolean
}

interface DependencyInfo {
  /**
   * State associated with dependency.
   */
  state: LatticeState

  /**
   * Resolved exported include dirs.
   */
  includeDirs: string[]
}

function ptemp(state: LatticeState, ...args: string[]) {
  return path.join(state.root, '.lattice', ...args)
}

/**
 * Execute a process asynchronously.
 */
async function processAsync(command: string, args: string[]) {
  const childProcess = spawn(command, args, {
    cwd: path.dirname(command),
  })

  let childOutput = ''
  childProcess.stdout.on('data', (data) => {
    childOutput += data.toString()
  })
  childProcess.stderr.on('data', (data) => {
    childOutput += data.toString()
  })

  return new Promise<void>((resolve, reject) => {
    childProcess.on('close', (code) => {
      if (code === 0) {
        resolve()
      } else {
        reject(new Error(childOutput))
      }
    })

    childProcess.on('error', (err) => {
      reject(new Error(childOutput))
    })
  })
}

/**
 * Prepare package env for build. If `clean` is defined, the `.lattice` work directory
 * will be cleaned before preparation.
 */
async function prepareEnvironment(state: LatticeState, clean?: boolean) {
  const temp = ptemp(state)
  if (fs.existsSync(temp)) {
    if (clean) {
      await fs.promises.rm(temp, { recursive: true })
      await fs.promises.mkdir(temp)
    }
  } else {
    await fs.promises.mkdir(temp)
  }
}

// TODO: Add configuration for 3rd party compilers?
// TODO: macOS support
/**
 * Retrieve the current compiler path for platform.
 */
function retrieveCompilerPath(platform: NodeJS.Platform) {
  const tccpaths = {
    win32: path.resolve(sourceroot, 'tcc/win64/tcc.exe'),
    linux: path.resolve(sourceroot, 'tcc/linux/tcc'),
  } as Partial<Record<NodeJS.Platform, string>>

  // Retrieve the tcc executable path.
  const tccpath = tccpaths[platform]
  if (tccpath !== undefined) {
    if (!fs.existsSync(tccpath)) {
      throw new Error(`Unable to find compiler at "${tccpath}".`)
    }
  } else {
    throw new Error(`Unsupported platform "${platform}".`)
  }

  return tccpath
}

// TODO: Recursive dependency checks.
/**
 * Retrieve dependency information for lst.
 */
async function dependencies(lst: LatticeState, log: ILogger) {
  const infos = [] as DependencyInfo[]

  const dep = async (pkgname: string) => {
    let realpkgpath
    if (pkgname.startsWith('@')) {
      const [pkgorg, realname] = pkgname.split('/')
      realpkgpath = path.join(lst.root, 'node_modules', pkgorg, realname)
    } else {
      realpkgpath = path.join(lst.root, 'node_modules', pkgname)
    }

    // Early check for malformed imports.
    const depinfopath = path.join(realpkgpath, 'package.json')
    if (!fs.existsSync(depinfopath)) {
      throw new MalformedDependencyError(
        `"${lst.pkg.name}" depends on "${pkgname}", which lacks a package.json`
      )
    }

    // Early check for accidentally imported non-C libraries/non-libraries.
    const depinfo = JSON.parse(
      await fs.promises.readFile(depinfopath, 'utf-8')
    ) as LatticePackage
    if (
      depinfo.main === undefined ||
      !depinfo.main.endsWith('.c') ||
      !depinfo.lattice ||
      depinfo.lattice.buildOptions?.type !== 'lib'
    ) {
      throw new MalformedDependencyError(
        `"${lst.pkg.name}" depends on "${pkgname}", which isn't a C library. If your project depends on JavaScript libraries, install them as devDependencies.`
      )
    }

    const dst = await createState(realpkgpath)
    if (!dst.options.exports || dst.options.exports.length === 0) {
      log.warn(`Dependency "${pkgname}" does not export any headers.`)
      return
    }

    // TODO: Make sure header paths can't leave the pkg's directory.
    let includeDirs = [] as string[]
    for (const exportedheaderdir of dst.options.exports) {
      includeDirs.push(path.resolve(realpkgpath, exportedheaderdir))
    }
    infos.push({ state: dst, includeDirs })
  }

  // TODO: Workspace resolution
  if (lst.pkg.dependencies) {
    for (const [pkgname, _] of Object.entries(lst.pkg.dependencies)) {
      await dep(pkgname)
    }
  }

  return infos as readonly DependencyInfo[]
}

/**
 * Calculate destination directory for lst.
 */
function destDirectory(bst: BuildState, lst: LatticeState, isdep?: boolean) {
  if (lst.options.buildOptions?.type === 'lib') {
    if (isdep) {
      // Output to the convenient library container.
      return path.join(bst.libraryContainer, lst.pkg.name!) + '.a'
    } else {
      // Output to provided outdir.
      return path.join(lst.root, lst.options.outdir!, lst.pkg.name!) + '.a'
    }
  } else {
    return (
      path.join(lst.root, lst.options.outdir!, lst.pkg.name!) +
      (process.platform === 'win32' ? '.exe' : '')
    )
  }
}

async function buildArgs(
  bst: BuildState,
  lst: LatticeState,
  deps: readonly DependencyInfo[],
  isdep?: boolean
) {
  // Build arguments.
  const buildargs = [] as string[]

  // Setup output directory.
  buildargs.push('-o', destDirectory(bst, lst, isdep))

  // If we're a library, use static binary output.
  if (lst.options.buildOptions?.type === 'lib') {
    buildargs.push('-static', '-shared')
  }

  // Setup imported include paths.
  if (lst.options.imports) {
    for (const inclpath of lst.options.imports) {
      // XXX: We discourage using absolute paths for imports,
      // but we do not outright ban it. A warning is issued
      // during dependency parsing.
      let finclpath = path.isAbsolute(inclpath)
        ? inclpath
        : path.resolve(lst.root, inclpath)
      buildargs.push(`-I${finclpath}`)
    }
  }

  // Setup dependencies' exported paths.
  for (const incldep of deps) {
    for (const inclpath of incldep.includeDirs) {
      buildargs.push(`-I${inclpath}`)
    }
  }

  // Setup compiler options.
  buildargs.push(
    lst.options.compilerOptions?.charSignedness === 'unsigned'
      ? '-funsigned-char'
      : '-fsigned-char'
  )

  if (lst.options.compilerOptions?.dollarsInNames) {
    buildargs.push('-fdollars-in-identifiers')
  }

  // Setup boundary checking. Root project can force deps to use boundary checks
  // by setting its bound check type to app+deps.
  if (
    (isdep && bst.forceBoundaryChkForDeps) ||
    (lst.options.buildOptions?.boundaryChecks !== undefined &&
      lst.options.buildOptions.boundaryChecks !== 'none')
  ) {
    buildargs.push('-b')
  }

  // Subsystem set. Windows executables only.
  if (
    lst.options.buildOptions?.type === 'bin' &&
    process.platform === 'win32'
  ) {
    buildargs.push(
      `-Wl,-subsystem=${
        lst.options.buildOptions?.winpe === 'gui' ? 'gui' : 'console'
      }`,
      '-mms-bitfields'
    )
  }

  // Pass additional commandline args.
  buildargs.push(...(lst.options.compilerOptions?.additionalArguments ?? []))

  // Pass entrypoint.
  buildargs.unshift(path.resolve(lst.root, lst.pkg.main))

  // Build args done!
  return buildargs
}

/**
 * Build a lattice package.
 * @param bst The global BuildState retrieved from `initBst`.
 * @param lst The LatticeState of the project you want to build.
 * @param log Logger instance. (`new Logger()` from `/logsys`)
 * @param isdep Set to `true` if building a dependency.
 * @returns
 */
export async function build(
  bst: BuildState,
  lst: LatticeState,
  log: ILogger,
  isdep?: boolean
) {
  if (bst.built[lst.pkg.name]) {
    return true // Already built.
  }

  log.task(`Compiling "${lst.pkg.name}"`)

  // Retrieve and build dependencies.
  let deps: readonly DependencyInfo[]

  // Abort build if malformed deps.
  try {
    deps = await dependencies(lst, log)
  } catch (e) {
    if (e instanceof MalformedDependencyError) {
      log.error(e.toString())
    } else {
      throw e // Unrecognized error.
    }
    return
  }

  if (deps.length > 0) {
    // Create the folder for all dependencies to be built.
    if (!fs.existsSync(bst.libraryContainer)) {
      await fs.promises.mkdir(bst.libraryContainer)
    }

    for (const dep of deps) {
      await build(bst, dep.state, log, true)
      bst.rootDeps.push(dep)
    }
  }

  // Bst is JIT-ready if this is the root package.
  if (bst.jit && lst === bst.rootState) {
    ;(<{ jitReady: boolean }>bst).jitReady = true
  } else {
    // Proceed with normal compilation.
    if (
      lst.options.buildOptions?.type === 'bin' &&
      lst.options.buildOptions?.jitOnly
    ) {
      throw new Error(
        `"${lst.pkg.name}" is defined as JIT-only. Compilation has been aborted.`
      )
    }

    // Create the destination directory.
    const destdir = path.dirname(destDirectory(bst, lst, isdep))
    if (!fs.existsSync(destdir)) {
      await fs.promises.mkdir(destdir, { recursive: true })
    }

    // TODO: Individually cancel projects that depend on this dep(?)
    try {
      await processAsync(
        bst.compilerPath,
        await buildArgs(bst, lst, deps, isdep)
      )
    } catch (e) {
      log.error((e as Error).toString())
    }
  }

  // Mark this package as built in the global buildstate.
  bst.built[lst.pkg.name] = true
}

/**
 * Init a BuildState to compile a package and its dependencies.
 * Returns the init BuildState and the LatticeState to compile
 * the main package.
 * @param root Root directory of main package.
 * @param jit Prepare this BuildState for JIT execution. Use `execJitBst` to execute afterwards.
 * @param clean Whether the `.lattice` workdir should be cleaned.
 * @returns
 */
export async function initBst(root: string, jit?: boolean, clean?: boolean) {
  // Create the root package.
  const state = await createState(root)

  // Prepare environment for the root package.
  await prepareEnvironment(state, clean)

  // Create initial build state.
  const bst = {
    built: {},
    rootState: state,
    rootDeps: [],
    compilerPath: retrieveCompilerPath(process.platform),
    libraryContainer: path.join(ptemp(state), 'lib'),
    forceBoundaryChkForDeps:
      state.options.buildOptions?.boundaryChecks === 'app+deps',
    jit,
    jitReady: false,
  } as BuildState

  return [bst, state] as const
}

/**
 * Run a JIT-ready BuildState.
 * @param bst JIT-ready BuildState
 * @param args Any arguments to pass to the program.
 */
export async function execJitBst(
  bst: BuildState,
  log: ILogger,
  args?: string[]
) {
  const jitargs = [
    '-run',
    ...(await buildArgs(bst, bst.rootState, bst.rootDeps)),
    ...(args ?? []),
  ]
  try {
    await processAsync(bst.compilerPath, jitargs)
  } catch (e) {
    log.error((e as Error).toString())
  }
}
