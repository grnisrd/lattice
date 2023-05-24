import { build, initBst, Logger } from 'lattice-cli'
import { project, binary, loghopper } from './testutils'

describe('BuildState unit', () => {
  test.fails('Non-existent project', async () => {
    await initBst('./😡')
  })

  test.fails('Malformed project', async () => {
    await initBst(project('malformed'))
  })

  test.fails('Missing entrypoint', async () => {
    await initBst(project('no-entrypoint'))
  })

  test.fails('Bad entrypoint', async () => {
    await initBst(project('bad-entrypoint'))
  })

  // NOTE: If using loghopper with 2nd argument set to "true", do
  // NOT use test.fails, as loghopper will filter out expected errors
  // from unexpected errors automatically and assert accordingly.
  test('Bad dependency import', async () => {
    const [bst, lst] = await initBst(
      project('bad-dependency-import'),
      false,
      true
    )
    await loghopper(async (log) => void (await build(bst, lst, log)), true)
  })
})
