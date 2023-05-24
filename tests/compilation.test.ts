import fs from 'node:fs'

import { build, initBst, Logger } from 'lattice-cli'
import { project, binary, loghopper } from './testutils'

describe('Sample application unit', () => {
  test('Compiles to binary', async () => {
    const proot = project('sample')
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
