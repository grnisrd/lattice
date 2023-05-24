import fs from 'node:fs'

import { build, initBst, Logger } from 'lattice-cli'
import { project, binary, loghopper } from './testutils'

describe('Sample application', () => {
  test('Compiles to binary', async () => {
    const proot = project('hello-world')
    const [bst, lst] = await initBst(proot, false, true)

    await loghopper(async (log) => {
      await build(bst, lst, log)
    })

    const destbin = binary(lst)
    expect(
      fs.existsSync(destbin),
      `Binary expected to be at "${destbin}"`
    ).toBeTruthy()
  })
})
