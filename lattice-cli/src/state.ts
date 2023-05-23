import fs from 'node:fs'
import path from 'node:path'

/**
 * Lattice compilation options.
 */
export interface LatticeCompilerOptions {
  /**
   * Signedness of the `char` type. Defaults to `signed`.
   */
  charSignedness?: 'signed' | 'unsigned'

  /**
   * Whether identifiers can include dollar signs ($).
   */
  dollarsInNames?: boolean

  /**
   * Additional commandline arguments to pass to the compiler. Preferably
   * avoid as lattice knows best when it comes to configuring builds.
   */
  additionalArguments?: string[]
}

export interface LatticeBuildOptions {
  /**
   * Type of file to produce. Defaults to `bin`. All generated libraries are static by nature.
   */
  type?: 'bin' | 'lib'

  /**
   * Windows-specific parameter to specify the subsystem used. Defaults to `console`.
   * This option is ignored if `type` is `lib`.
   */
  winpe?: 'console' | 'gui'

  /**
   * Whether boundary checking should be enabled.
   */
  boundaryChecks?: 'app+deps' | 'app' | 'none'

  /**
   * Whether this program can only be executed through `lattice run`.
   * Defaults to `false` - all programs can either be jit'd or built ahead of time.
   * This option is ignored if `type` is `lib`.
   */
  jitOnly?: boolean
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
   * List of dependencies.
   */
  dependencies?: Record<string, string>

  /**
   * List of devDependencies.
   */
  devDependencies?: Record<string, string>

  /**
   * Lattice configuration namespace.
   */
  lattice?: {
    /**
     * Output directory for binaries, relative
     * to project root. Defaults to `/dist`.
     */
    outdir?: string

    /**
     * Additional include directories. Include paths are searched in the order they are specified.
     */
    imports?: string[]

    /**
     * List of exported header directories.
     */
    exports?: string[]

    /**
     * Options configuring the linker.
     */
    buildOptions?: LatticeBuildOptions

    /**
     * Options configuring the compiler.
     */
    compilerOptions?: LatticeCompilerOptions
  }
}

export type LatticeNamespace = Exclude<LatticePackage['lattice'], undefined>

export interface LatticeState {
  /**
   * Root of package.
   */
  readonly root: string

  /**
   * Options.
   */
  readonly options: LatticeNamespace

  /**
   * Package file. Options are first extracted
   * from this.
   */
  readonly pkg: LatticePackage
}

/**
 * Create a state for this package.
 */
export async function createState(root: string): Promise<LatticeState> {
  const pkginfopath = path.join(root, 'package.json')
  if (!fs.existsSync(pkginfopath)) {
    throw new Error(`Package file missing at "${pkginfopath}".`)
  }

  const pkg = JSON.parse(
    await fs.promises.readFile(pkginfopath, 'utf-8')
  ) as LatticePackage

  // Error if no entrypoint is defined, or if entrypoint isn't C.
  if (!pkg.main) {
    throw new Error(`Package configuration doesn't specify an entrypoint.`)
  } else if (!pkg.main.endsWith('.c')) {
    throw new Error(`Package entrypoint must be a C code file. (*.c)`)
  }

  // Build options, use defaults.
  const options = pkg.lattice ?? {}
  if (!options.outdir) {
    options.outdir = './dist'
  }

  if (!options.compilerOptions) {
    options.compilerOptions = {
      charSignedness: 'signed',
      dollarsInNames: false,
    }
  }

  if (!options.buildOptions) {
    options.buildOptions = {
      type: 'bin',
      winpe: 'console',
      boundaryChecks: 'none',
      jitOnly: false,
    }
  }

  // Issue warning if you're compiling a library and have no exports.
  if (
    options.buildOptions.type === 'lib' &&
    (!options.exports || options.exports.length === 0)
  ) {
    console.warn(
      'This library is not exporting any include paths. Use "lattice exports add [path/to/dir]" to add an exported include path.'
    )
  }

  // Issue warning if you're importing absolute paths.
  if (options.imports) {
    for (const importpath of options.imports) {
      if (path.isAbsolute(importpath)) {
        console.warn(
          'This package is importing absolute include paths. Please use relative include paths that points to inside the package filesystem.'
        )
      }
      break
    }
  }

  return { root, options, pkg }
}

export default createState
