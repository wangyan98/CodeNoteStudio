let clipboardFile: { sourcePath: string } | null = null

export function getClipboardFile() {
  return clipboardFile
}

export function setClipboardFile(sourcePath: string) {
  clipboardFile = { sourcePath }
}

export function clearClipboardFile() {
  clipboardFile = null
}
