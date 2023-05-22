import fs from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'

const packageroot = path.resolve(__dirname, '..')

interface LatticePackageConfig {
  /**
   * Output directory for binaries, relative
   * to project root.
   */
  outdir: string

  /**
   * Name of project. Defaults to package name.
   */
  name?: string

  /**
   * Type of file to produce. Defaults to `bin`. All generated libraries are static by nature.
   */
  type?: 'bin' | 'lib'

  /**
   * Windows-specific parameter to specify the subsystem used. Defaults to `console`.
   */
  winpe?: 'console' | 'gui'

  /**
   * Signedness of the `char` type. Defaults to `signed`.
   */
  charSignedness?: 'signed' | 'unsigned'

  /**
   * Whether identifiers can include dollar signs ($).
   */
  dollarsInNames?: boolean

  /**
   * Whether boundary checking should be enabled.
   */
  boundaryChecks?: 'app+deps' | 'app' | 'none'

  /**
   * Additional include directories. Include paths are searched in the order they are specified.
   */
  includePaths?: string[]
}

export interface LatticePackage {
  /**
   * Name of package, used to generate the binary.
   */
  name: string

  /**
   * Entrypoint.
   */
  main: string

  /**
   * Lattice configuration.
   */
  lattice?: LatticePackageConfig
}

export interface LatticeProcessOptions {
  /**
   * Root of the project.
   */
  root: string

  /**
   * Whether to build the project or run it directly (JIT). Defaults to build.
   */
  mode?: 'build' | 'run'

  /**
   * Additonal options to pass to the compiler.
   */
  cliOptions?: string[]

  /**
   * Overrides for the lattice package configuration.
   */
  overrides?: Partial<LatticePackageConfig>
}

async function processAsync(command: string, args: string[]) {
  const childProcess = spawn(command, args, {
    stdio: 'inherit',
    cwd: path.dirname(command),
  })

  return new Promise<void>((resolve, reject) => {
    childProcess.on('close', (code) => {
      if (code === 0) {
        resolve()
      } else {
        reject(new Error(`Process exited with code ${code}`))
      }
    })

    childProcess.on('error', (err) => {
      reject(err)
    })
  })
}

export async function prepareLatticeProject(
  options: LatticeProcessOptions,
  platform: string
) {
  const pkgpath = path.join(options.root, 'package.json')
  if (!fs.existsSync(pkgpath)) {
    throw new Error(`Package file missing at "${pkgpath}".`)
  }

  let pkg: LatticePackage
  const pkgjson = await fs.promises.readFile(pkgpath, 'utf-8')
  try {
    pkg = JSON.parse(pkgjson)
  } catch (e) {
    throw new Error(`Error while parsing package file. ${e}`)
  }

  if (!pkg.main.endsWith('.c')) {
    throw new Error('Entrypoint must end in .c')
  }

  let latticeConf = pkg.lattice
  let defaultLatticeConf = {
    name: pkg.name,
    type: 'bin',
    winpe: platform === 'win32' ? 'console' : undefined,
    charSignedness: 'signed',
    dollarsInNames: false,
  } as LatticePackageConfig

  if (latticeConf === undefined) {
    latticeConf = defaultLatticeConf
  } else {
    latticeConf = Object.assign(defaultLatticeConf, latticeConf)
  }

  if (latticeConf.outdir === undefined) {
    latticeConf.outdir = path.join(options.root, 'dist')
  }

  return [latticeConf, pkg] as const
}

export async function processLatticeProject(options: LatticeProcessOptions) {
  const platform = process.platform
  const tccpaths = {
    win32: path.resolve(packageroot, 'tcc/win64/tcc.exe'),
    linux: path.resolve(packageroot, 'tcc/linux/tcc'),
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

  // Prepare the lattice project for compilation.
  const [latticeConf, pkg] = await prepareLatticeProject(options, platform)
  if (!fs.existsSync(latticeConf.outdir)) {
    await fs.promises.mkdir(latticeConf.outdir, { recursive: true })
  }

  // Build arguments.
  const tccargs = [] as string[]

  // Setup output binary.
  tccargs.push(
    '-o',
    path.join(
      path.resolve(options.root),
      latticeConf.outdir,
      latticeConf.name!
    ) + (platform === 'win32' ? '.exe' : '')
  )

  // Setup include paths.
  if (latticeConf.includePaths !== undefined) {
    for (const inclpath of latticeConf.includePaths) {
      let finclpath = path.isAbsolute(inclpath)
        ? inclpath
        : path.resolve(options.root, inclpath)
      tccargs.push(`-I${finclpath}`)
    }
  }

  // Setup output options.
  if (latticeConf.type === 'lib') {
    tccargs.push('-static', '-shared')
  }

  // Setup compilation flags.
  tccargs.push(
    latticeConf.charSignedness === 'unsigned'
      ? '-funsigned-char'
      : '-fsigned-char'
  )

  if (latticeConf.dollarsInNames) {
    tccargs.push('-fdollars-in-identifiers')
  }

  // TODO: Deps.
  if (
    latticeConf.boundaryChecks === 'app+deps' ||
    latticeConf.boundaryChecks === 'app'
  ) {
    tccargs.push('-b')
  }

  // Subsystem set. Windows only.
  if (platform === 'win32') {
    tccargs.push(
      `-Wl,-subsystem=${latticeConf.winpe === 'gui' ? 'gui' : 'console'}`,
      '-mms-bitfields'
    )
  }

  // Push rest of CLI options
  tccargs.push(...(options.cliOptions ?? []))

  // Build or run depending on mode provided.
  const entrypoint = path.resolve(options.root, pkg.main)
  if (options.mode === 'run') {
    tccargs.unshift('-run', entrypoint)
  } else {
    tccargs.push(entrypoint)
  }

  // Process is ready. Errors will be thrown accordingly.
  await processAsync(tccpath, tccargs)
}
