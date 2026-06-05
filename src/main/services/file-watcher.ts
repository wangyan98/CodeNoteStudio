import fs from 'node:fs'
import path from 'node:path'

type ChangeCallback = () => void

const DEBOUNCE_MS = 300

let watcher: fs.FSWatcher | null = null
let debounceTimer: ReturnType<typeof setTimeout> | null = null
let onChange: ChangeCallback | null = null

function scheduleNotify(): void {
  if (debounceTimer) {
    clearTimeout(debounceTimer)
  }
  debounceTimer = setTimeout(() => {
    onChange?.()
  }, DEBOUNCE_MS)
}

export function startWatching(notesPath: string, callback: ChangeCallback): void {
  stopWatching()

  // Ensure directory exists before watching
  if (!fs.existsSync(notesPath)) {
    try {
      fs.mkdirSync(notesPath, { recursive: true })
    } catch {
      return
    }
  }

  onChange = callback

  try {
    watcher = fs.watch(notesPath, { recursive: true }, (_event, filename) => {
      if (!filename) {
        scheduleNotify()
        return
      }

      // Directories and hidden files trigger refresh to handle folder changes
      const basename = path.basename(filename as string)
      if (basename.startsWith('.')) return

      // .tmp files and other non-note files are ignored
      // But we don't filter strictly here because we also need to detect
      // directory creation/deletion and the full path isn't available
      scheduleNotify()
    })

    watcher.on('error', (err) => {
      console.error('[file-watcher] Watch error:', err)
    })
  } catch (err) {
    console.error('[file-watcher] Failed to start watching:', err)
  }
}

export function stopWatching(): void {
  if (debounceTimer) {
    clearTimeout(debounceTimer)
    debounceTimer = null
  }
  if (watcher) {
    watcher.close()
    watcher = null
  }
  onChange = null
}
