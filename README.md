<p>
    <img align="left" src="https://i.imgur.com/0n6ZKo2.png">
    <h1>lattice</h1>
</p>

**lattice** is an incredibly lightweight C development environment that integrates well into the node ecosystem.

## Features
- **Build cross-platform applications with C.**  
  Everything you need to start building apps in C is included in lattice. Just create a project through the lattice CLI and get to writing code without worrying about configuration.
- **Publish your applications to npm.**  
  Instead of distributing binaries to your application, simply publish it to npm and let lattice handle execution (through JIT compilation!) with `lattice run`.
- **Use npm for dependency management.**  
  Dependencies can be easily managed through the same protocols used for node development: `npm install`, `npm uninstall`, `npm publish`.
- **Support for some GNU/MSVC extensions.**  
  Some GNU and MSVC extensions to the language are supported, such as case ranges, `__attribute__`, `typeof`, `#pragma pack`, computed gotos, and inline assembly.

## Getting started
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

## State of project
lattice is currently in **alpha**. There's a lot of features yet to add. A roadmap will be provided here later. This project will **not** get published to npm until its initial feature set is in.

## Internals
Under the hood, lattice uses [`tcc`](https://bellard.org/tcc/tcc-doc.html) for compilation, an incredibly tiny C compiler _with_ full support for ANSI C and a number of ISOC99 extensions. Without `tcc`, lattice wouldn't be a thing, as packing _any_ other compiler would have been too big.


### Footnotes

[^1]: list from [tcc](https://bellard.org/tcc/tcc-doc.html#Invoke) docs