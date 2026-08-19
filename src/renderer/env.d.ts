import type { OpiaApi } from '../shared/ipc-contract'

declare global {
  interface Window {
    opia: OpiaApi
  }
}

export {}
