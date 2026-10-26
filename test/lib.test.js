const test = require('node:test');
const assert = require('node:assert/strict');
const { parseEnv, parseSchema, validate, formatExample, formatDocs } = require('../src/lib');

test('parseEnv handles comments, quotes and blanks', () => {
  const env = parseEnv('FOO=bar\n# comment\nBAZ="qux"\nEMPTY=\n\n  SPACED = value  '); // eslint-disable-line
  assert.deepEqual(env, { FOO: 'bar', BAZ: 'qux', EMPTY: '', SPACED: 'value' });
});

test('validate reports missing required variable', () => {
  const schema = parseSchema({ vars: { PORT: { type: 'port', required: true } } });
  const result = validate(schema, {});
  assert.equal(result.ok, false);
  assert.equal(result.errors.length, 1);
  assert.equal(result.errors[0].name, 'PORT');
  assert.equal(result.errors[0].reason, 'missing');
});

test('validate applies defaults', () => {
  const schema = parseSchema({ vars: { PORT: { type: 'port', default: 3000 } } });
  const result = validate(schema, {});
  assert.equal(result.ok, true);
  assert.equal(result.resolved.PORT, '3000');
});

test('validate rejects invalid types', () => {
  const schema = parseSchema({
    vars: {
      P: { type: 'port', required: true },
      E: { type: 'email', required: true },
      U: { type: 'url', required: true },
      N: { type: 'enum', values: ['a', 'b'], required: true }
    }
  });
  const result = validate(schema, { P: '99999', E: 'nope', U: 'not url', N: 'c' });
  assert.equal(result.ok, false);
  assert.equal(result.errors.length, 4);
});

test('validate accepts good values', () => {
  const schema = parseSchema({ vars: { P: { type: 'port', required: true }, E: { type: 'email', required: true } } });
  const result = validate(schema, { P: '8080', E: 'a@b.com' });
  assert.equal(result.ok, true);
  assert.equal(result.resolved.P, '8080');
  assert.equal(result.resolved.E, 'a@b.com');
});

test('parseSchema rejects bad input', () => {
  assert.throws(() => parseSchema({}), /vars/);
  assert.throws(() => parseSchema({ vars: { X: { type: 'foo' } } }), /unknown type/);
  assert.throws(() => parseSchema({ vars: { X: { type: 'enum', values: [] } } }), /enum/);
});

test('formatExample includes defaults and descriptions', () => {
  const schema = parseSchema({ vars: { PORT: { type: 'port', default: 3000, description: 'listen port' } } });
  const out = formatExample(schema);
  assert.match(out, /PORT=3000/);
  assert.match(out, /listen port/);
});

test('formatDocs emits markdown table', () => {
  const schema = parseSchema({ vars: { PORT: { type: 'port', default: 3000 } } });
  assert.match(formatDocs(schema), /\| PORT \|/);
});
