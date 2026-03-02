#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'

const cwd = process.cwd()
const migrationsDir = path.join(cwd, 'supabase', 'migrations')

if (!fs.existsSync(migrationsDir)) {
  console.error(`Directory not found: ${migrationsDir}`)
  process.exit(2)
}

const files = fs
  .readdirSync(migrationsDir, { withFileTypes: true })
  .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.sql'))
  .map((entry) => entry.name)
  .sort((a, b) => a.localeCompare(b))

const rows = []
for (const name of files) {
  const match = name.match(/^(\d+)/)
  if (!match) continue
  rows.push({ version: match[1], file: name })
}

const byVersion = new Map()
for (const row of rows) {
  const list = byVersion.get(row.version) ?? []
  list.push(row.file)
  byVersion.set(row.version, list)
}

const duplicated = Array.from(byVersion.entries())
  .filter(([, list]) => list.length > 1)
  .sort((a, b) => a[0].localeCompare(b[0]))

if (duplicated.length === 0) {
  console.log('No duplicate migration versions found.')
  process.exit(0)
}

console.log('Duplicate migration versions found:')
for (const [version, list] of duplicated) {
  console.log(`\nVersion ${version} (${list.length} files)`)
  for (const file of list) {
    console.log(` - ${file}`)
  }
}

process.exit(1)
