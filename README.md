# diegos-fly-logger

Express/Fastify middleware that emits one JSON log line per request, compatible with Loki/Grafana.

## Installation

```bash
npm install diegos-fly-logger
```

```js
import { logging } from 'diegos-fly-logger';
app.use(logging);
```

## Configuration

| Variable | Default | Description |
| --- | --- | --- |
| `PRETTIFY_LOGS` | `false` | Pretty-print JSON (local dev only) |
| `LOG_LEGACY_FORMAT` | `false` | Restore v1 `[level] {json}` format |
| `LOG_REQUEST_BODY` | `false` | Include request body under `payload` |
| `LOG_REQUEST_BODY_MAX_BYTES` | `4096` | Max payload before truncation metadata |
| `LOG_EXTRA_MAX_BYTES` | `4096` | Max size for `req.diegosFlyLoggerExtra` |
| `LOG_SERVICE_NAME` | `FLY_APP_NAME` | Service name in log record |
| `LOG_ENVIRONMENT` | `NODE_ENV` | Environment in log record |
| `SENTRY_CAPTURE_HTTP_5XX` | `false` | Capture 5xx events via `@sentry/node` |

## Log fields

Each line includes: `time`, `level`, `msg`, `method`, `url`, `status`, `response_time`, `request_id`, `service_name`, `environment`, `ip`, `user_agent`, `browser`, `os`, `is_bot`, `session_id`, `content_type`, `payload_size`. Set `LOG_REQUEST_BODY=1` to also include `payload`.

`level` is explicit (`info`/`warn`/`error`) — use it for Grafana log-level filtering.

## Sentry (optional)

Set `SENTRY_CAPTURE_HTTP_5XX=true` if your app already initializes Sentry. The package dynamically imports `@sentry/node` when enabled and continues without it if not installed.

## Publishing a release

```bash
sh release.sh <version>
npm publish
```

## v2 migration

Default output changed from `[level] {json}` to pure JSON lines. Set `LOG_LEGACY_FORMAT=true` to keep v1 shape temporarily.
