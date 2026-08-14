#!/usr/bin/env node
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createEngine, executeFetchContent, executeWebSearch, formatStatus } from './engine.ts'
import { getWebSearchConfigPath } from './utils.ts'

const version = readPackageVersion()

const help = `dsh-web-access ${version}

Web access for DeepSeek Harness.

Usage:
  dsh-web-access --help
  dsh-web-access --version
  dsh-web-access status
  dsh-web-access search <query>
  dsh-web-access fetch <url>

Install into a Harness profile:

  dsh plugin --profile web add dsh-web-access

Config file: ${getWebSearchConfigPath()}
`

const command = process.argv[2]

if (command === undefined || command === '-h' || command === '--help' || command === 'help') {
  process.stdout.write(help)
  process.exit(0)
}

if (command === '-v' || command === '--version' || command === 'version') {
  console.log(version)
  process.exit(0)
}

const engine = createEngine()

if (command === 'status') {
  void formatStatus(engine).then(text => {
    console.log(text)
    console.log(`config: ${getWebSearchConfigPath()}`)
  }).catch(fail)
} else if (command === 'search') {
  const query = process.argv.slice(3).join(' ').trim()
  if (!query) fail(new Error('Usage: dsh-web-access search <query>'))
  else {
    void executeWebSearch(engine, { query, workflow: 'none' }).then(result => {
      console.log(result.text)
    }).catch(fail)
  }
} else if (command === 'fetch') {
  const url = process.argv[3]
  if (!url) fail(new Error('Usage: dsh-web-access fetch <url>'))
  else {
    void executeFetchContent(engine, { url }).then(result => {
      console.log(result.text)
    }).catch(fail)
  }
} else {
  console.error(`dsh-web-access: unknown command ${JSON.stringify(command)}`)
  console.error('Run dsh-web-access --help')
  process.exit(1)
}

function fail(error: unknown): never {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
}

function readPackageVersion(): string {
  try {
    const here = dirname(fileURLToPath(import.meta.url))
    const pkg = JSON.parse(readFileSync(join(here, '..', 'package.json'), 'utf8')) as { version?: string }
    return pkg.version ?? '0.1.0'
  } catch {
    return '0.1.0'
  }
}
