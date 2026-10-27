# envwarden

`envwarden` validates environment variables against a JSON schema, reports missing
or invalid values with clear messages, and generates `.env.example` files and
Markdown documentation tables.

It is a small, dependency-free Node.js CLI intended for local development and
CI pipelines.

## Installation

Clone the repository and run directly with Node.js 18+:

```sh
node src/cli.js --help
```

You can also link it locally:

```sh
npm link
envwarden --help
```

## Schema format

Create a `.env.schema.json` file describing your variables:

```json
{
  "vars": {
    "DATABASE_URL": { "type": "url", "required": true, "description": "PostgreSQL connection string" },
    "PORT": { "type": "port", "default": 3000 },
    "NODE_ENV": { "type": "enum", "values": ["development", "production", "test"], "default": "development" },
    "DEBUG": { "type": "boolean", "default": false }
  }
}
```

Supported types: `string`, `number`, `integer`, `boolean`, `port`, `url`,
`email`, `path`, and `enum` (requires `values`).

Constraints may be added to any variable:

- `pattern`: a regular expression, as a string or RegExp, that the value must match
- `min`: inclusive lower bound for numeric values
- `max`: inclusive upper bound for numeric values
- `minLength`: inclusive minimum length for string values
- `maxLength`: inclusive maximum length for string values
- `trim`: when true, trim surrounding whitespace before validation

## Usage

Validate the current environment (reads `.env` if present, otherwise `process.env`):

```sh
node src/cli.js check
```

Validate against explicit files:

```sh
node src/cli.js check --schema config/env.schema.json --env .env.local
```

Generate an example file:

```sh
node src/cli.js example > .env.example
```

Generate a Markdown table of all variables:

```sh
node src/cli.js docs
```

Exit codes: `0` on success, `1` on validation failure, `2` on usage or file errors.

## Development

Run the test suite:

```sh
npm test
```

## License

MIT
