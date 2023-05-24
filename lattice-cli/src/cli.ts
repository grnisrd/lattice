#! /usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import { format } from 'node:util'
import chalk from 'chalk'
import input from '@inquirer/input'
import select from '@inquirer/select'

import { build, initBst, execJitBst } from './index'
import { Logger } from './logsys'

const sampleEntrypoint = `#include <stdio.h>

int main(void)
{
    printf("Hello world from Lattice!\\n");
    return 0;
}`

async function createProject(cwd: string, name?: string) {
  const projectName =
    name ??
    (await input({
      message: "What is your application's name?",
      default: 'my-lattice-app',
    }))

  const projectPath = path.join(cwd, projectName)

  if (fs.existsSync(projectPath)) {
    if (
      (
        await input({
          message: `"${projectName}" already exists in current directory. Type "Yes" to delete it. Input anything else to exit.`,
          default: 'No',
        })
      ).toLowerCase() === 'yes'
    ) {
      await fs.promises.rm(projectPath, { recursive: true, force: true })
    } else {
      process.exit(0)
      return
    }
  }

  const appType = await select({
    message: 'What kind of application are you creating?',
    choices: [
      {
        name: `Application${
          process.platform === 'win32' ? ' (*.exe)' : ' (bin)'
        }`,
        value: 'bin',
        description: 'An application that can be distributed.',
      },

      {
        name: `Library${process.platform === 'win32' ? ' (*.a)' : ' (*.so)'}`,
        value: 'lib',
        description: 'A library that can be consumed by other applications.',
      },
    ],
  })

  const useBoundaryChecks = await select({
    message: 'Do you want to use boundary checks for increased memory safety?',
    choices: [
      {
        name: `Yes, for my application.`,
        value: 'app+deps',
        description:
          '⚠️ Note that boundary checking is NOT a replacement for safe programming practices.',
      },

      {
        name: `Yes, for my application and its dependencies.`,
        value: 'app',
        description:
          '⚠️ Note that boundary checking is NOT a replacement for safe programming practices.',
      },

      {
        name: `No.`,
        value: 'none',
      },
    ],
  })

  let winpe = 'console'
  if (process.platform === 'win32' && appType !== 'lib') {
    winpe = await select({
      message:
        'Is your application a console or a windowed app? (Windows only)',
      choices: [
        {
          name: `Console`,
          value: 'console',
          description: 'Your application will run in a terminal window.',
        },

        {
          name: `Windowed`,
          value: 'gui',
          description: 'Your application will run in the window it creates.',
        },

        {
          name: `Default`,
          value: 'console',
          description:
            'The compiler will use default settings. Best for cross-platform apps.',
        },
      ],
    })
  }

  const pkgVer = JSON.parse(
    await fs.promises.readFile(
      path.resolve(__dirname, '..', 'package.json'),
      'utf-8'
    )
  ).version

  const defaultPkg = {
    name: projectName,
    version: '1.0.0',
    description: 'Sample project for a lattice application.',
    private: true,
    main: './src/main.c',
    scripts: {
      run: 'lattice run',
      build: 'lattice build',
    },
    lattice: {
      outdir: './dist',
      type: appType,
      boundaryChecks: useBoundaryChecks,
      winpe,
    },
    devDependencies: {
      '@lattice/lattice': `^${pkgVer}`,
    },
  }

  await fs.promises.mkdir(projectPath)
  await fs.promises.mkdir(path.join(projectPath, 'src'))
  await fs.promises.writeFile(
    path.join(projectPath, 'src', 'main.c'),
    sampleEntrypoint,
    'utf-8'
  )
  await fs.promises.writeFile(
    path.join(projectPath, 'package.json'),
    JSON.stringify(defaultPkg, undefined, 4)
  )

  console.log(
    `Application successfully setup in "${projectName}". To get started,`
  )
  console.log(`\tcd ${projectName}`)
  console.log(`\tlattice run`)
}

function styleOutputs() {
  // Replace prints.
  const [oldLog, oldWarn, oldError] = [console.log, console.warn, console.error]
  console.log = (...args: string[]) =>
    oldLog(`${chalk.white(chalk.bgBlueBright('[i]'))} ${format(...args)}`)
  console.info = console.log
  console.warn = (...args: string[]) =>
    oldWarn(`${chalk.black(chalk.bgYellowBright('[!]'))} ${format(...args)}`)
  console.error = (...args: string[]) =>
    oldError(`${chalk.black(chalk.bgRedBright('[X]'))} ${format(...args)}`)
}

async function main() {
  styleOutputs()

  const args = process.argv.slice(2)
  const mode = args.shift()

  let cliOptions = [] as string[]
  let cliOptStart = args.indexOf('--')
  if (cliOptStart > -1) {
    cliOptions = args.slice(cliOptStart)
  }

  const cwd = process.cwd()

  try {
    if (mode === 'run') {
      const log = new Logger(true)
      const [bst, lst] = await initBst(cwd, true, args.includes('--clean'))
      await build(bst, lst, log)
      log.unstatus(log.state.errs.length === 0)
      await execJitBst(bst, log, cliOptions)
    } else if (mode === 'build') {
      const log = new Logger()
      const [bst, lst] = await initBst(cwd, false, args.includes('--clean'))
      await build(bst, lst, log)
      log.unstatus(log.state.errs.length === 0)
    } else if (mode === 'init') {
      const projectName = args.shift()
      await createProject(cwd, projectName)
    } else {
      console.error(`Unknown lattice command "${mode}".`)
    }
  } catch (e) {
    console.error('Error: ' + (e as { message: string }).message)
  }
}

main()
