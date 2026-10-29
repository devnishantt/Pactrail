# Pactrail

A small TypeScript library and CLI for API contract checks. Built with Zod, Ajv, YAML, and Vitest. Node.js 22.12+, 24, or 26+; ESM only.

> **History disclosure:** This original project was generated with AI assistance on **October 30, 2026**. The 173 commit dates from January 1 through October 29, 2026 are a **synthetic schedule**, not evidence of work performed on those dates. Each commit repeats that disclosure. See [`provenance.json`](./provenance.json). No code was imported from another repository.

## Features

- Structural validation of the supported OpenAPI 3.0 / 3.1 subset with Zod.
- JSON Schema payload validation with Ajv, including formats, nested constraints, and local component references.
- Zod payload adapter for application-specific refinements.
- Conservative directional request/response change detection with breaking, review, and additive findings.
- Deterministic response fixtures with useful issue paths; JSON and YAML input.
- CLI with machine-readable output and explicit exit codes.
- Vitest unit/regression tests and a GitHub Actions template for Node.js 22 and 24 (activation required).

## Setup

```sh
npm ci
npm run check
npm run test:cli
```

This package is not published to npm. Build and run locally:

```sh
npm run build
node dist/cli.js --help
node dist/cli.js validate examples/openapi.yaml
node dist/cli.js fixtures examples/openapi.yaml examples/fixtures.json
node dist/cli.js diff examples/openapi.yaml examples/breaking.yaml --format text
```

The last command intentionally exits 1 because the example removes an endpoint. `npm link` makes the local `pactrail` executable available. `npm pack` produces an installable tarball, without publishing it.

## Library API

```ts
import { parseOpenAPI, validateResponse, validateWithZod, diffContracts, runFixtures } from 'pactrail'
import { z } from 'zod'

const contract = parseOpenAPI({
  openapi: '3.1.0',
  info: { title: 'Greeting API', version: '1.0.0' },
  paths: {
    '/greetings': {
      get: {
        responses: {
          '200': {
            description: 'Greeting',
            content: { 'application/json': { schema: { type: 'string' } } },
          },
        },
      },
    },
  },
})

validateResponse(contract, {
  method: 'GET', path: '/greetings', status: 200, body: 'Hello',
}) // { valid: true, issues: [] }

validateWithZod(z.object({ email: z.string().email() }), { email: 'invalid' })
runFixtures(contract, [
  { name: 'hello', method: 'GET', path: '/greetings', status: 200, body: 'Hello' },
])
diffContracts(contract, contract) // { breaking: false, reviewRequired: false, changes: [] }
```

Additional exports: `validateSchema`, `getOperation`, `resolveSchema`, and typed model interfaces. Methods are case-insensitive; paths must be exact **OpenAPI template paths**, such as `/books/{id}`, not `/books/1`. Response selection uses exact status, then `2XX`-style wildcard, then `default`. Content types default to `application/json`; MIME parameters are stripped. Pass `undefined` for a response without a body; JSON `null` is a real body.

## Compatibility policy

Requests and responses have different compatibility directions:

| Change | Finding |
| --- | --- |
| Remove an operation, response, or existing media type | Breaking |
| Change schema type or remove a response property | Breaking |
| Narrow request enum / expand response enum | Breaking |
| Add required request property / remove guaranteed response property | Breaking |
| Add operation | Non-breaking |
| Change other schema constraints, security, parameters, components, or global metadata | Manual review |

The comparator is deliberately conservative, **not a complete proof of backward compatibility**. Unknown semantic changes trigger review. Recursive references and composition changes can require manual inspection. Every `review` result blocks the CLI, just like a breaking result; there is no silent allow-review flag. SDK callers should check **both** `breaking` and `reviewRequired`.

## CI integration

The included **inactive template** at `ci/github-actions.yml` builds, typechecks, runs tests and fixtures, and checks package contents. The connected GitHub App could push source code but lacked permission to create workflows. CI is therefore **not activated**. To enable it, add this template as `.github/workflows/ci.yml` through GitHub's web editor, or grant the app workflow permission and push it there. Local verification passed 639 tests and 13 CLI smoke checks; the dependency audit reported zero vulnerabilities at creation.

To compare your own baseline and candidate in CI:

```sh
node dist/cli.js diff contracts/baseline.yaml contracts/candidate.yaml --format json
```

Exit codes:

- `0`: checks pass.
- `1`: payload/fixture failure, breaking change, or review-required change.
- `2`: malformed input, missing file, unsupported reference, or incorrect CLI usage.

JSON output goes to stdout; input errors go to stderr. Diff supports `--format text`; validation and fixture output is JSON. No telemetry, network fetching, or automatic baseline updates.

## Fixture format

A fixture is `{ name, method, path, status, body?, contentType? }`. Fixture names must be unique, statuses are 100–599, and unknown fixture fields are rejected. `examples/fixtures.json` demonstrates both JSON and no-body responses.

## Scope and limitations

- `validate` checks supported document structure, **not full OpenAPI specification compliance**. It does not precompile all schemas; payload checks compile the selected schema when used.
- OpenAPI 3.0 payload checks use Ajv's draft-07 engine (including nullable support); 3.1/default payload checks use draft 2020-12. Ajv runs with `strict: false` to allow OpenAPI annotations, so unknown schema keywords are ignored. OpenAPI 3.0 boolean `exclusiveMinimum`/`exclusiveMaximum` forms are not translated. Use numeric exclusivity or normalize such contracts first.
- Only local `#/components/schemas/...` references are supported. External references, custom `$id`, path item references, and response/request-body reference objects are unsupported.
- Schema validation does not coerce types, insert defaults, strip properties, or mutate payloads. Direction-specific `readOnly`/`writeOnly` filtering is not implemented.
- Parameter values, request payloads, response headers, security credentials, webhooks, and callbacks are not runtime-validated. Parameter/security changes are surfaced for review by the comparator.
- This is a local library/CLI, not a live HTTP proxy or full-schema mocking engine. Fixtures are user-authored; no random payload generation or automatic network requests.
- Treat schemas as trusted input. Local files and regex schemas are not sandboxed against CPU/memory exhaustion. YAML alias expansion is bounded.

## Tests and layout

```text
src/              Library, models, comparator, CLI, file reader
examples/         Working Bookshop contract, fixtures, breaking candidate
tests/            Unit tests and independently named schema boundary cases
scripts/          Deterministic case generator and subprocess CLI smoke tests
ci/               Inactive Node.js GitHub Actions template
```

```sh
npm run test:coverage
node scripts/generate-cases.mjs 146
```

Each regression case declares a schema and explicit accepted/rejected values. The generator is deterministic and covers numeric bounds, strings, Unicode length, enums, object properties, arrays, combinators, conditions, and dependencies. It overwrites generated cases by name; use the same count to reproduce this checked-in matrix.

## Data, paths, and deployment

- Repository: https://github.com/devnishantt/contractkit (can be renamed independently of the package).
- Runtime data: in-process input documents and results only; no database, persistent service, or cloud storage is required.
- Public entry points: the package exports and `pactrail validate`, `pactrail diff`, and `pactrail fixtures` commands above. There are no HTTP URIs or hosted API endpoints.
- Deployment: GitHub source and inactive CI template; no website deployment and no npm publication. GitHub Actions activation is pending workflow permission or manual setup.
- Next steps: full OpenAPI conformance validation, richer parameter compatibility rules, direction-aware payload schemas, and sandboxed validation for untrusted inputs.

## License

MIT. See [LICENSE](./LICENSE).
