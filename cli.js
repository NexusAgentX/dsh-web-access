#!/usr/bin/env node

const version = '0.0.1'

const help = `dsh-web-access ${version}

Web access for DeepSeek Harness.

Usage:
  dsh-web-access --help
  dsh-web-access --version

This 0.0.1 release only reserves the npm name and ships an installable
dsh bundle stub. Search/fetch providers and extra extraction tools land later.

Install into a Harness profile:

  dsh plugin --profile web add dsh-web-access
`

const arg = process.argv[2]

if (arg === '-v' || arg === '--version' || arg === 'version') {
  console.log(version)
  process.exit(0)
}

if (arg === undefined || arg === '-h' || arg === '--help' || arg === 'help') {
  process.stdout.write(help)
  process.exit(0)
}

console.error(`dsh-web-access: unknown command ${JSON.stringify(arg)}`)
console.error('Run dsh-web-access --help')
process.exit(1)
