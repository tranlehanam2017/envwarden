'use strict';

const TYPES = new Set([
  'string', 'number', 'integer', 'boolean', 'port', 'url', 'email', 'path', 'enum'
]);

function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function safeSet(obj, key, value) {
  if (key === '__proto__') {
    Object.defineProperty(obj, key, {
      value,
      writable: true,
      enumerable: true,
      configurable: true
    });
  } else {
    obj[key] = value;
  }
}

function toStr(v) {
  if (typeof v === 'string') return v;
  if (v === null) return 'null';
  if (v === undefined) return '';
  return String(v);
}

function isNumberString(s) {
  return /^[+-]?(\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(s);
}

function isIntegerString(s) {
  return /^[+-]?\d+$/.test(s);
}

function isValidUrl(s) {
  try {
    const u = new URL(s);
    return Boolean(u.protocol);
  } catch (e) {
    return false;
  }
}

function isValidEmail(s) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

function validateOne(def, rawValue) {
  let value = toStr(rawValue);
  if (def.trim) value = value.trim();

  let ok = true;
  switch (def.type) {
    case 'string':
      break;
    case 'number':
      if (!isNumberString(value)) ok = false;
      break;
    case 'integer':
      if (!isIntegerString(value)) ok = false;
      break;
    case 'boolean':
      if (value !== 'true' && value !== 'false') ok = false;
      break;
    case 'port':
      if (!isIntegerString(value)) ok = false;
      else {
        const n = Number(value);
        if (n < 0 || n > 65535) ok = false;
      }
      break;
    case 'url':
      if (!isValidUrl(value)) ok = false;
      break;
    case 'email':
      if (!isValidEmail(value)) ok = false;
      break;
    case 'path':
      break;
    case 'enum': {
      const vals = Array.isArray(def.values) ? def.values.map(String) : [];
      if (!vals.includes(value)) ok = false;
      break;
    }
    default:
      ok = false;
  }

  if (ok && def.pattern !== undefined) {
    let re = null;
    if (def.pattern instanceof RegExp) {
      re = def.pattern;
    } else if (typeof def.pattern === 'string') {
      try {
        re = new RegExp(def.pattern);
      } catch (e) {
        ok = false;
      }
    } else {
      ok = false;
    }
    if (re) {
      re.lastIndex = 0;
      if (!re.test(value)) ok = false;
    }
  }

  if (ok && (def.min !== undefined || def.max !== undefined)) {
    const n = Number(value);
    if (!Number.isFinite(n)) {
      ok = false;
    } else {
      if (def.min !== undefined && n < def.min) ok = false;
      if (def.max !== undefined && n > def.max) ok = false;
    }
  }

  if (ok && (def.minLength !== undefined || def.maxLength !== undefined)) {
    if (def.minLength !== undefined && value.length < def.minLength) ok = false;
    if (def.maxLength !== undefined && value.length > def.maxLength) ok = false;
  }

  return { ok, value, reason: ok ? '' : 'invalid' };
}

function parseEnv(input) {
  if (input == null) return {};
  const text = String(input).replace(/^\uFEFF/, '');
  const result = {};
  for (const rawLine of text.split(/\r?\n/)) {
    let line = rawLine.trim();
    if (!line || line.charAt(0) === '#') continue;
    const exportMatch = line.match(/^export\s+/);
    if (exportMatch) line = line.slice(exportMatch[0].length).trim();
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    if (!key) continue;
    const rest = line.slice(eq + 1);
    let value = '';
    const trimmedRest = rest.trimStart();
    if (trimmedRest.startsWith('"') || trimmedRest.startsWith("'")) {
      const quote = trimmedRest.charAt(0);
      let i = 1;
      let buf = '';
      while (i < trimmedRest.length && trimmedRest.charAt(i) !== quote) {
        buf += trimmedRest.charAt(i);
        i++;
      }
      value = buf;
    } else {
      let v = rest.trimStart();
      let idx = -1;
      for (let i = 0; i < v.length; i++) {
        if (v.charAt(i) === '#' && (i === 0 || /\s/.test(v.charAt(i - 1)))) {
          idx = i;
          break;
        }
      }
      if (idx !== -1) v = v.slice(0, idx);
      value = v.trimEnd();
    }
    safeSet(result, key, value);
  }
  return result;
}

function parseSchema(input) {
  if (!isPlainObject(input)) throw new Error('schema must be an object');
  if (!isPlainObject(input.vars)) throw new Error('schema must have a vars object');

  const vars = {};
  for (const [name, def] of Object.entries(input.vars)) {
    if (!isPlainObject(def)) throw new Error(`variable ${name} must be an object`);
    if (typeof def.type !== 'string' || !TYPES.has(def.type)) {
      throw new Error(`unknown type: ${def.type}`);
    }

    const norm = { type: def.type };

    if (def.required === undefined) {
      norm.required = false;
    } else if (typeof def.required !== 'boolean') {
      throw new Error('required must be a boolean');
    } else {
      norm.required = def.required;
    }

    if (def.description !== undefined) {
      if (typeof def.description !== 'string') throw new Error('description must be a string');
      norm.description = def.description;
    }

    if (def.values !== undefined) {
      if (!Array.isArray(def.values)) throw new Error('values must be an array');
      norm.values = def.values.slice();
    } else if (def.type === 'enum') {
      throw new Error('enum requires a non-empty values array');
    }
    if (def.type === 'enum') {
      if (!Array.isArray(norm.values) || norm.values.length === 0) {
        throw new Error('enum requires a non-empty values array');
      }
    }

    if (def.pattern !== undefined) {
      if (def.pattern instanceof RegExp) {
        norm.pattern = new RegExp(def.pattern.source, def.pattern.flags);
      } else if (typeof def.pattern === 'string') {
        norm.pattern = new RegExp(def.pattern);
      } else {
        throw new Error('pattern must be a string or RegExp');
      }
    }

    if (def.trim === undefined) {
      norm.trim = false;
    } else if (typeof def.trim !== 'boolean') {
      throw new Error('trim must be a boolean');
    } else {
      norm.trim = def.trim;
    }

    if (def.min !== undefined) {
      if (typeof def.min !== 'number' || !Number.isFinite(def.min)) throw new Error('min must be a number');
      norm.min = def.min;
    }
    if (def.max !== undefined) {
      if (typeof def.max !== 'number' || !Number.isFinite(def.max)) throw new Error('max must be a number');
      norm.max = def.max;
    }
    if (def.minLength !== undefined) {
      if (typeof def.minLength !== 'number' || !Number.isFinite(def.minLength)) throw new Error('minLength must be a number');
      norm.minLength = def.minLength;
    }
    if (def.maxLength !== undefined) {
      if (typeof def.maxLength !== 'number' || !Number.isFinite(def.maxLength)) throw new Error('maxLength must be a number');
      norm.maxLength = def.maxLength;
    }

    if (def.default !== undefined) {
      const r = validateOne(norm, def.default);
      if (!r.ok) throw new Error('invalid default');
      norm.default = r.value;
    }

    safeSet(vars, name, norm);
  }

  return { vars };
}

function validate(schema, env) {
  const vars = (schema && isPlainObject(schema.vars)) ? schema.vars : {};
  let source = env;
  if (!isPlainObject(source)) source = {};

  const errors = [];
  const resolved = {};
  for (const [name, def] of Object.entries(vars)) {
    const has = Object.prototype.hasOwnProperty.call(source, name);
    const raw = has ? source[name] : undefined;
    if (raw === undefined) {
      if (def.default !== undefined) {
        safeSet(resolved, name, def.default);
        continue;
      }
      if (def.required) errors.push({ name, reason: 'missing' });
      continue;
    }
    const r = validateOne(def, raw);
    if (r.ok) safeSet(resolved, name, r.value);
    else errors.push({ name, reason: r.reason || 'invalid' });
  }
  return { ok: errors.length === 0, errors, resolved };
}

function formatExample(schema) {
  const vars = (schema && isPlainObject(schema.vars)) ? schema.vars : {};
  const lines = [];
  for (const [name, def] of Object.entries(vars)) {
    if (def.description) lines.push(`# ${def.description}`);
    const val = def.default !== undefined ? def.default : '';
    lines.push(`${name}=${val}`);
  }
  return lines.join('\n') + (lines.length ? '\n' : '');
}

function formatDocs(schema) {
  const vars = (schema && isPlainObject(schema.vars)) ? schema.vars : {};
  const lines = ['| Variable | Type | Required | Default |', '| --- | --- | --- | --- |'];
  for (const [name, def] of Object.entries(vars)) {
    const required = def.required ? 'yes' : 'no';
    const val = def.default !== undefined ? def.default : '';
    lines.push(`| ${name} | ${def.type} | ${required} | ${val} |`);
  }
  return lines.join('\n') + '\n';
}

module.exports = { parseEnv, parseSchema, validate, formatExample, formatDocs };
