const fs = require('node:fs')
const path = require('node:path')

const GRAMMAR_DIR = path.join(__dirname, '..', 'assets', 'tree-sitter')

const GRAMMARS = [
  'tree-sitter-javascript',
  'tree-sitter-typescript',
  'tree-sitter-python',
  'tree-sitter-rust',
  'tree-sitter-go',
  'tree-sitter-c',
  'tree-sitter-cpp'
]

fs.mkdirSync(GRAMMAR_DIR, { recursive: true })

for (const pkg of GRAMMARS) {
  const src = path.join(__dirname, '..', 'node_modules', pkg, `${pkg}.wasm`)
  const dest = path.join(GRAMMAR_DIR, `${pkg}.wasm`)

  if (fs.existsSync(src)) {
    fs.copyFileSync(src, dest)
    console.log(`  Copied ${pkg}.wasm`)
  } else {
    console.log(`  SKIP: ${pkg}.wasm not found`)
  }
}

// Also copy tsx from typescript package
const tsxSrc = path.join(__dirname, '..', 'node_modules', 'tree-sitter-typescript', 'tree-sitter-tsx.wasm')
const tsxDest = path.join(GRAMMAR_DIR, 'tree-sitter-tsx.wasm')
if (fs.existsSync(tsxSrc)) {
  fs.copyFileSync(tsxSrc, tsxDest)
  console.log('  Copied tree-sitter-tsx.wasm')
}

console.log('Grammar copy complete.')
