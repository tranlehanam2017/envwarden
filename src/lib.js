'use strict';

const ALLOWED_TYPES = new Set([
  'string', 'number', 'integer', 'boolean', 'port', 'url', 'email', 'path', 'enum'
]);

function parseEnv(text) {
  const result = Object.create(null);
  const lines = String(text == null ? '' : text).split(/\r?\n/);
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    if (!key) continue;
    let value = line.slice(eq + 1).trim();
    if (value.length >= 2 &&
        ((value[0] === '"' && value[value.length - 1] === '"') ||
         (value[0] === "'" && value[value.length - 1] === "'"))) {
      value = value.slice(1, -1);
    }
    result[key] = value;
  }
  return result;
}

function parseSchema(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('schema must be an object');
  }
  const vars = input.vars;
  if (!vars || typeof vars !== 'object' || Array.isArray(vars)) {
    throw new Error('schema.vars must be an object');
  }
  const normalized = {};
  for (const [name, spec] of Object.entries(vars)) {
    if (!spec || typeof spec !== 'object' || Array.isArray(spec)) {
      throw new Error(`invalid spec for ${name}`);
    }
    const type = spec.type || 'string';
    if (!ALLOWED_TYPES.has(type)) {
      throw new Error(`unknown type ${type} for ${name}`);
    }
    if (type === 'enum') {
      if (!Array.isArray(spec.values) || spec.values.length === 0) {
        throw new Error(`enum ${name} requires non-empty values`);
      }
    }
    normalized[name] = {
      type,
      required: Boolean(spec.required),
      default: spec.default,
      values: spec.values,
      description: spec.description
    };
  }
  return { vars: normalized };
}

function checkType(spec, value) {
  switch (spec.type) {
    case 'string':
    case 'path':
      return null;
    case 'number':
      if (value === '' || isNaN(Number(value))) return 'not a number';
      return null;
    case 'integer':
      if (!/^-?\d+$/.test(value)) return 'not an integer';
      return null;
    case 'boolean':
      if (!/^(true|false|1|0|yes|no)$/i.test(value)) return 'not a boolean';
      return null;
    case 'port':
      if (!/^\d+$/.test(value)) return 'not a port';
      {
        const n = Number(value);
        if (n < 1 || n > 65535) return 'port out of range';
      }
      return null;
    case 'url':
      try { new URL(value); } catch (e) { return 'not a URL'; }
      return null;
    case 'email':
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return 'not an email';
      return null;
    case 'enum':
      if (!spec.values.includes(value)) return `not one of ${spec.values.join(', ')}`;
      return null;
    default:
      return null;
  }
}

function validate(schema, env) {
  const errors = [];
  const resolved = Object.create(null);
  const source = env && typeof env === 'object' ? env : {};
  for (const [name, spec] of Object.entries(schema.vars)) {
    const present = Object.prototype.hasOwnProperty.call(source, name);
    let value = present ? source[name] : undefined;

    if (!present) {
      if (spec.default !== undefined && spec.default !== null) {
        value = String(spec.default);
      } else if (spec.required) {
        errors.push({ name, reason: 'missing' });
        continue;
      } else {
        continue;
      }
    }

    if (value === '' && spec.required && spec.default === undefined) {
      errors.push({ name, reason: 'missing' });
      continue;
    }
    if (value === '' && spec.default !== undefined && spec.default !== null && spec.required) {
      value = String(spec.default);
    }

    const reason = checkType(spec, value);
    if (reason) {
      errors.push({ name, reason });
      continue;
    }
    resolved[name] = value;
  }
  return { ok: errors.length === 0, errors, resolved };
}

function formatExample(schema) {
  const lines = [];
  for (const [name, spec] of Object.entries(schema.vars)) {
    const bits = [spec.type || 'string'];
    if (spec.required) bits.push('required');
    if (spec.default !== undefined && spec.default !== null) {
      bits.push(`default: ${spec.default}`);
    }
    if (spec.type === 'enum') {
      bits.push(`one of: ${spec.values.join('|')}`);
    }
    lines.push(`# ${name} (${bits.join(', ')})${spec.description ? ' - ' + spec.description : ''}`);
    const def = (spec.default !== undefined && spec.default !== null) ? String(spec.default) : '';
    lines.push(`${name}=${def}`);
  }
  return lines.join('\n') + '\n';
}

function formatDocs(schema) {
  const rows = [
    '| Variable | Type | Required | Default | Description |',
    '|---|---|---|---|---|'
  ];
  for (const [name, spec] of Object.entries(schema.vars)) {
    rows.push(
      `| ${name} | ${spec.type} | ${spec.required ? 'yes' : 'no'} | ` +
      `${spec.default !== undefined && spec.default !== null ? spec.default : ''} | ${spec.description || ''} |`
    );
  }
  return rows.join('\n') + '\n';
}

module.exports = { parseEnv, parseSchema, validate, formatExample, formatDocs };
