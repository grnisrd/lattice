<p>
    <img align="left" src="https://i.imgur.com/0n6ZKo2.png">
    <h1>lattice</h1>
</p>

**lattice** is an incredibly lightweight C development environment that integrates well into the node ecosystem.

<p align="center">
  <img src="./coverage-badge.svg">
</p>

## Features
- **Build cross-platform applications with C.**  
  Everything you need to start building apps in C is included in lattice. Just create a project through the lattice CLI and get to writing code without worrying about configuration.
- **Publish your applications to npm.**  
  Instead of distributing binaries to your application, simply publish it to npm and let lattice handle execution (through JIT compilation!) with `lattice run`.
- **Use npm for dependency management.**  
  Dependencies can be easily managed through the same protocols used for node development: `npm install`, `npm uninstall`, `npm publish`.
- **Support for some GNU/MSVC extensions.**  
  Some GNU and MSVC extensions to the language are supported, such as case ranges, `__attribute__`, `typeof`, `#pragma pack`, computed gotos, and inline assembly.

## Usage
```sh
# Install the lattice CLI.
npm i @lattice/lattice-cli -g

# Create a new project.
lattice init my-project

# Navigate to the project's directory, then run!
cd my-project
lattice run

# Or, alternatively, build a binary and execute it.
lattice build
./dist/my-project.exe
```

The lattice CLI tool handles project and compiler configuration for you. There is no need to setup a compiler as lattice includes its own, but it is possible to use another with specialized configuration (even though it somewhat defeats the point of the project).

### Configuration
This is the default configuration used for `package.json`. Note that comments are not supported in json and they are added here for documentation purposes.
```jsonc
// This is in "package.json".
{
  // Entrypoint of the program. Must absolutely end in .c.
  "main": "./src/main.c",

  // ALL DEPENDENCIES MUST BE C LIBRARIES. If you need a
  // JavaScript library, include them in "devDependencies".
  "dependencies": {},

  // JavaScript dependencies go in here.
  "devDependencies": {},

  // This entire object and its properties can be omitted.
  "lattice": {
    // Relative output directory for binaries.
    "outdir": "./dist",

    // Additional include directories. 
    // Include paths are searched in the order they are specified.
    "imports": [],

    // List of exported header directories for libraries.
    "exports": [],

    // Options configuring the linker.
    "buildOptions": {
      // Type of file to produce. Defaults to `bin`. 
      // All generated libraries are static by nature.
      // Possible values: "bin" | "lib".
      "type": "bin",

      // Windows-specific parameter to specify the subsystem used. 
      // Defaults to `console`. This option is ignored if `type` is `lib`.
      // Possible values: 'console' | 'gui'
      "winpe": "console",

      // Whether boundary checking should be enabled.
      // Possible values: 'app+deps' | 'app' | 'none'
      "boundaryChecks": "none",

      /**
      * Whether this program can only be executed through `lattice run`.
      * Defaults to `false` - all programs can either be jit'd or built ahead of time.
      * This option is ignored if `type` is `lib`.
      */
      "jitOnly": false,
    },

    // Options configuring the compiler.
    "compilerOptions": {
      /**
      * Signedness of the `char` type. Defaults to `signed`.
      * Possible values: 'signed' | 'unsigned'
      */
      "charSignedness": "signed",

      /**
      * Whether identifiers can include dollar signs ($).
      * Defaults to false.
      */
      "dollarsInNames": false,

      /**
      * Additional commandline arguments to pass to the compiler. Preferably
      * avoid as lattice knows best when it comes to configuring builds.
      */
      "additionalArguments": []
    }
  }
}
```

### Flags
>⚠️ You should generally avoid using compiler flags, as configuring the compiler (beyond the adjustments offered in the package configuration) should generally be left to be done by the CLI tool.

Compiler flags must be passed after an empty `--` flag. For example, to enable debug mode while building your executable, you must pass the `-g` flag as such: `lattice build -- -g`

#### Debug flags
| Flag | Description |
|-|-|
`-g` | Enable debug mode. Compiler will include debug information in the executable so that you get clear runtime error messages.
`-bt N` | Display `N` callers in stack traces (for use with `-g`).

#### Warnings flags
| Flag | Description |
|-|-|
`-Wall` | Activate all warnings.
`-Werror` | Abort compilation if warnings are issued.
`-Wimplicit-function-declaration` | Warn about implicit function declaration.
`-Wunsupported` | Warn about unsupported gcc features that are not supported/ignored by the `tcc` compiler.
`-Wwrite-strings` | Enforce string constants  to be of type `const char*` instead of `char*`.

#### Preprocessor flags
| Flag | Description |
|-|-|
`-Dsym[=val]` | Define preprocessor symbol `sym` to `val`. If `val` is not present, its value is `1`. Function-like macros can also be defined: `-DF(a)=a+1`
`-Usym` | Undefine preprocessor symbol `sym`.
`-E` | Preprocess to file only.

#### Codegen flags
| Flag | Description |
|-|-|
`-mfloat-abi` | **⚠️ ARM ONLY**. Select the float ABI. Possible values: `softfp` and `hard`
`-mno-sse` | Avoid using SSE registers on x86_64.

## Dependency management
Dependencies are managed in the same way you'd manage your standard node dependencies. They can be added through `npm install` (or equivalent) and lattice will automatically include them in your project, so there is no need to manually setup include paths. The CLI tool will also automatically build any dependencies as needed, and link them against your executable.

As can be expected from a standard C environment, environment variables such as `CPATH`, `C_INCLUDE_PATH`, and `LIBRARY_PATH` are respected. Bear in mind that local dependencies and configured paths are searched first.

## Memory safety
Developers may optionally opt into the compiler's memory/bound checking system through the `boundaryChecks` configuration option. When enabled, the compiler will generate additional code to verify the integrity of memory allocations, array bounds, and pointer bounds. Certain errors are guaranteed to be caught, such as[^1]:
- Invalid range with standard string functions (e.g. `memset`)
- Out of bounds access in global and/or local arrays
- Out of bounds access in `malloc`'ed data
- Use-after-frees and double-frees

This is obviously not a catch-all, and can only reliably prevent a subset of mistakes often committed by C programmers. Enabling the checks should **not** be used as a replacement for safe programming practices.

## JIT execution
Your C application can be ran [just-in-time](https://en.wikipedia.org/wiki/Just-in-time_compilation) with the `lattice run` command. Essentially, rather than going through the pain of producing a binary for each platform you want to target, users can simply download the source code themselves (including through `npm install -g`) and use `lattice run` to execute the application on their system. It has many advantages, including:
- Not needing to run separate (virtual) machines to compile binaries, saving time.
  - Fun fact: cross-compilation is actually offered in lattice (pending switch to grischka's `tcc` branch), so you can even do AOT _without_ multiple machines.
- Executed programs are fine-tuned for the user's system, increasing compatibility.
- Programs written yesterday will receive the improvements implemented today.
  - That is, programs compiled ahead-of-time will permanently have the idiosyncrasies of the compiler used at the time, whereas programs executed just-in-time will always enjoy the improvements delivered to lattice.

>💡 However, there are some limitations. For instance, until the `lattice-libjit` project becomes functional, only executables can be JIT-compiled, not libraries. If you run a program that's JIT-compiled but depends on libraries, the libraries will be compiled AOT first, and only the program will run just-in-time.

If desired, you can enforce JIT compilation of your program by setting the `jitOnly` configuration option in `buildOptions` to true. Any attempts to compile the program ahead-of-time will throw an error. By default `jitOnly` is set to false.


## State of project
lattice is currently in **alpha**. There's a lot of features yet to add. A roadmap will be provided here later. This project will **not** get published to npm until its initial feature set is in.

## Internals
Under the hood, lattice uses [`tcc`](https://bellard.org/tcc/tcc-doc.html) for compilation, an incredibly tiny C compiler _with_ full support for ANSI C and a number of ISOC99 extensions. Without `tcc`, lattice wouldn't be a thing, as packing _any_ other compiler would have been too big.


### Footnotes

[^1]: list from [tcc](https://bellard.org/tcc/tcc-doc.html#Invoke) docs