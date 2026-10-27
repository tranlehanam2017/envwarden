'use strict';

const ALLOWED_TYPES = new Set([
  'string', 'number', 'integer', 'boolean', 'port', 'url', 'email', 'path', 'enum'
]);

function unescapeQuoted(value) {
  return value.replace(/\\(n|r|t|\\|'|\")/g, (_, c) => {
    switch (c) {
      case 'n': return '\n';
      case 'r': return '\r';
      case 't': return '\t';
      default: return c;
    }
  });
}

function stripInlineComment(value) {
  if (value.length > 0 && (value[0] === '"' || value[0] === "'")) {
    const quote = value[0];
    let i = 1;
    while (i < value.length) {
      if (value[i] === '\\' && i + 1 < value.length) {
        i += 2;
        continue;
      }
      if (value[i] === quote) {
        const raw = value.slice(1, i);
        return quote === '"' ? unescapeQuoted(raw) : raw;
      }
      i += 1;
    }
  }
  const commentIdx = value.search(/\s+#/);
  if (commentIdx !== -1) return value.slice(0, commentIdx).trim();
  return value.trim();
}

function parseEnv(text) {
  const result = Object.create(null);
  const lines = String(text == null ? '' : text).split(/\r?\n/);
  for (const raw of lines) {
    let line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    if (/^export\s+/.test(line)) line = line.replace(/^export\s+/, '').trim();
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    if (!key) continue;
    const value = stripInlineComment(line.slice(eq + 1).trim());
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
    if (spec.pattern !== undefined && spec.pattern !== null) {
      if (typeof spec.pattern !== 'string' && !(spec.pattern instanceof RegExp)) {
        throw new Error(`pattern must be a string or RegExp for ${name}`);
      }
    }
    if (spec.min !== undefined && spec.min !== null && typeof spec.min !== 'number') {
      throw new Error(`min must be a number for ${name}`);
    }
    if (spec.max !== undefined && spec.max !== null && typeof spec.max !== 'number') {
      throw new Error(`max must be a number for ${name}`);
    }
    if (spec.minLength !== undefined && spec.minLength !== null) {
      if (typeof spec.minLength !== 'number') {
        throw new Error(`minLength must be a number for ${name}`);
      }
      if (!Number.isInteger(spec.minLength) || spec.minLength < 0) {
        throw new Error(`minLength must be a non-negative integer for ${name}`);
      }
    }
    if (spec.maxLength !== undefined && spec.maxLength !== null) {
      if (typeof spec.maxLength !== 'number') {
        throw new Error(`maxLength must be a number for ${name}`);
      }
      if (!Number.isInteger(spec.maxLength) || spec.maxLength < 0) {
        throw new Error(`maxLength must be a non-negative integer for ${name}`);
      }
    }
    if (spec.trim !== undefined && spec.trim !== null && typeof spec.trim !== 'boolean') {
      throw new Error(`trim must be a boolean for ${name}`);
    }
    normalized[name] = {
      type,
      required: Boolean(spec.required),
      default: spec.default,
      values: spec.values,
      description: spec.description,
      pattern: spec.pattern,
      min: spec.min,
      max: spec.max,
      minLength: spec.minLength,
      maxLength: spec.maxLength,
      trim: Boolean(spec.trim)
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

function checkConstraints(spec, value) {
  if (spec.pattern !== undefined && spec.pattern !== null) {
    const flags = spec.pattern instanceof RegExp
      ? spec.pattern.flags.replace(/[gy]/g, '')
      : '';
    const re = spec.pattern instanceof RegExp
      ? new RegExp(spec.pattern.source, flags)
      : new RegExp(spec.pattern);
    if (!re.test(value)) return 'does not match pattern';
  }
  const numeric = Number(value);
  const isNumeric = !isNaN(numeric) && value !== '';
  if (spec.min !== undefined && spec.min !== null && isNumeric) {
    if (numeric < spec.min) return `below minimum ${spec.min}`;
  }
  if (spec.max !== undefined && spec.max !== null && isNumeric) {
    if (numeric > spec.max) return `above maximum ${spec.max}`;
  }
  if (spec.minLength !== undefined && spec.minLength !== null) {
    if (value.length < spec.minLength) return `shorter than minimum length ${spec.minLength}`;
  }
  if (spec.maxLength !== undefined && spec.maxLength !== null) {
    if (value.length > spec.maxLength) return `longer than maximum length ${spec.maxLength}`;
  }
  return null;
}

function validate(schema, env) {
  const errors = [];
  const resolved = Object.create(null);
  const source = env && typeof env === 'object' ? env : {};
  for (const [name, spec] of Object.entries(schema.vars)) {
    const present = Object.prototype.hasOwnProperty.call(source, name);
    let value = present ? source[name] : undefined;
    const provided = present && value !== undefined && value !== null;

    if (!provided) {
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

    if (spec.trim && typeof value === 'string') {
      value = value.trim();
    }

    const typeReason = checkType(spec, value);
    if (typeReason) {
      errors.push({ name, reason: typeReason });
      continue;
    }
    const constraintReason = checkConstraints(spec, value);
    if (constraintReason) {
      errors.push({ name, reason: constraintReason });
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
    if (spec.pattern) bits.push(`pattern: ${spec.pattern}`);
    if (spec.min !== undefined && spec.min !== null) bits.push(`min: ${spec.min}`);
    if (spec.max !== undefined && spec.max !== null) bits.push(`max: ${spec.max}`);
    if (spec.minLength !== undefined && spec.minLength !== null) bits.push(`minLength: ${spec.minLength}`);
    if (spec.maxLength !== undefined && spec.maxLength !== null) bits.push(`maxLength: ${spec.maxLength}`);
    if (spec.trim) bits.push('trim');
    lines.push(`# ${name} (${bits.join(', ')})${spec.description ? ' - ' + spec.description : ''}`);
    const def = (spec.default !== undefined && spec.default !== null) ? String(spec.default) : '';
    lines.push(`${name}=${def}`);
  }
  return lines.join('\n') + '\n';
}

function formatDocs(schema) {
  const rows = [
    '| Variable | Type | Required | Default | Constraints | Description |',
    '|---|---|---|---|---|---|'
  ];
  for (const [name, spec] of Object.entries(schema.vars)) {
    const constraints = [];
    if (spec.pattern) constraints.push(`pattern:${spec.pattern}`);
    if (spec.min !== undefined && spec.min !== null) constraints.push(`min:${spec.min}`);
    if (spec.max !== undefined && spec.max !== null) constraints.push(`max:${spec.max}`);
    if (spec.minLength !== undefined && spec.minLength !== null) constraints.push(`minLength:${spec.minLength}`);
    if (spec.maxLength !== undefined && spec.maxLength !== null) constraints.push(`maxLength:${spec.maxLength}`);
    if (spec.trim) constraints.push('trim');
    rows.push(
      `| ${name} | ${spec.type} | ${spec.required ? 'yes' : 'no'} | ` +
      `${spec.default !== undefined && spec.default !== null ? spec.default : ''} | ${constraints.join(' ')} | ${spec.description || ''} |`
    );
  }
  return rows.join('\n') + '\n';
}

module.exports = { parseEnv, parseSchema, validate, formatExample, formatDocs };