import { test as base, expect } from '@playwright/test'
import { STATE_FILE } from './global-setup'

/** `test` autenticado (sessão criada no global-setup); `anon` sem sessão */
export const test = base.extend({})
test.use({ storageState: STATE_FILE })
export const anon = base.extend({})
anon.use({ storageState: { cookies: [], origins: [] } })
export { expect }
