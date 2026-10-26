#!/usr/bin/env node
'use strict';

const fs = require('fs');
const { parseEnv, parseSchema, validate, formatExample, formatDocs } = require('./lib');

function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith('--')) {
        out[key] = next;
        i++;
      } else {
        out[key] = true;
      }
    } else {
      out._.push(a);
    }
  }
  return out;
}

function readSchema(path) {
  const raw = fs.readFileSync(path, 'utf8');
  return parseSchema(JSON.parse(raw));
}

function loadEnv(args) {
  const envPath = args.env || '.env';
  if (fs.existsSync(envPath)) {
    return parseEnv(fs.readFileSync(envPath, 'utf8'));
  }
  if (!args.env) return { ...process.env };
  throw new Error(`env file not found: ${envPath}`);
}

function usage() {
  process.stdout.write(
    'Usage: envwarden <command> [options]\n\n' +
    'Commands:\n' +
    '  check     Validate environment against schema\n' +
    '  example   Print a .env.example\n' +
    '  docs      Print markdown documentation table\n\n' +
    'Options:\n' +
    '  --schema <file>  Schema file (default .env.schema.json)\n' +
    '  --env <file>     Env file (default .env)\n' +
    '  --json           Print validation result as JSON (check only)\n'
  );
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const cmd = args._[0];
  const schemaPath = args.schema || '.env.schema.json';
  if (!cmd || cmd === 'help' || args.help) {
    usage();
    process.exit(0);
  }
  let schema;
  try {
    schema = readSchema(schemaPath);
  } catch (e) {
    console.error(`error reading schema: ${e.message}`);
    process.exit(2);
  }
  if (cmd === 'example') {
    process.stdout.write(formatExample(schema));
    process.exit(0);
  }
  if (cmd === 'docs') {
    process.stdout.write(formatDocs(schema));
    process.exit(0);
  }
  if (cmd === 'check') {
    let env;
    try {
      env = loadEnv(args);
    } catch (e) {
      console.error(e.message);
      process.exit(2);
    }
    const result = validate(schema, env);
    if (args.json) {
      process.stdout.write(JSON.stringify(result, null, 2) + '\n');
      process.exit(result.ok ? 0 : 1);
    }
    if (result.ok) {
      console.log('OK: all environment variables valid');
      process.exit(0);
    }
    console.error('Validation failed:');
    for (const e of result.errors) console.error(`  ${e.name}: ${e.reason}`);
    process.exit(1);
  }
  console.error(`unknown command: ${cmd}`);
  usage();
  process.exit(2);
}

main();
