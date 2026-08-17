import 'fake-indexeddb/auto'
import '@testing-library/jest-dom/vitest'
import { configure } from '@testing-library/dom'

// findBy*/waitFor default to 1 s, which flakes under full-suite CPU load
// (22 files in parallel + Dexie liveQuery settling). 5 s keeps them honest.
configure({ asyncUtilTimeout: 5000 })
