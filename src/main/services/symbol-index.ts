import Database from 'better-sqlite3'
import path from 'node:path'
import type { CodeSymbol } from './code-parser'

export function initSymbolDatabase(projectPath: string): Database.Database {
  const dbPath = path.join(projectPath, '.symbols.db')
  const db = new Database(dbPath)

  db.pragma('journal_mode = WAL')

  db.exec(`
    CREATE TABLE IF NOT EXISTS symbols (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      kind TEXT NOT NULL,
      file_path TEXT NOT NULL,
      start_line INTEGER NOT NULL,
      end_line INTEGER NOT NULL,
      start_column INTEGER NOT NULL,
      end_column INTEGER NOT NULL,
      parent_name TEXT
    )
  `)

  db.exec(`CREATE INDEX IF NOT EXISTS idx_symbols_name ON symbols(name)`)
  db.exec(`CREATE INDEX IF NOT EXISTS idx_symbols_file ON symbols(file_path)`)

  return db
}

export function indexSymbols(db: Database.Database, symbols: CodeSymbol[]): void {
  const insert = db.prepare(`
    INSERT OR REPLACE INTO symbols (name, kind, file_path, start_line, end_line, start_column, end_column, parent_name)
    VALUES (@name, @kind, @file_path, @start_line, @end_line, @start_column, @end_column, @parent_name)
  `)

  const transaction = db.transaction((syms: CodeSymbol[]) => {
    for (const sym of syms) {
      insert.run({
        name: sym.name,
        kind: sym.kind,
        file_path: sym.filePath,
        start_line: sym.startLine,
        end_line: sym.endLine,
        start_column: sym.startColumn,
        end_column: sym.endColumn,
        parent_name: sym.parentName || null
      })
    }
  })

  transaction(symbols)
}

export function querySymbols(
  db: Database.Database,
  name?: string,
  filePath?: string,
  kind?: string
): CodeSymbol[] {
  let sql = 'SELECT name, kind, file_path, start_line, end_line, start_column, end_column, parent_name FROM symbols WHERE 1=1'
  const params: Record<string, string> = {}

  if (name) {
    sql += ' AND name = @name'
    params.name = name
  }
  if (filePath) {
    sql += ' AND file_path = @file_path'
    params.file_path = filePath
  }
  if (kind) {
    sql += ' AND kind = @kind'
    params.kind = kind
  }

  sql += ' ORDER BY start_line ASC'

  const rows = db.prepare(sql).all(params) as Array<{
    name: string
    kind: string
    file_path: string
    start_line: number
    end_line: number
    start_column: number
    end_column: number
    parent_name: string | null
  }>

  return rows.map((row) => ({
    name: row.name,
    kind: row.kind as CodeSymbol['kind'],
    filePath: row.file_path,
    startLine: row.start_line,
    endLine: row.end_line,
    startColumn: row.start_column,
    endColumn: row.end_column,
    parentName: row.parent_name || undefined
  }))
}

export function clearSymbols(db: Database.Database): void {
  db.exec('DELETE FROM symbols')
}
