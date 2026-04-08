### Requirements

- express / fastify

### Configuration

`diegos-fly-logger` emits one JSON object per line by default (v2), which is Loki/Grafana friendly.

| Environment Variable | Default | Description |
| --- | --- | --- |
| `PRETTIFY_LOGS` | `false` | Pretty-prints JSON logs (`true` recommended only for local development). |
| `LOG_LEGACY_FORMAT` | `false` | Restores legacy v1 output (`[level] {json}`) for temporary rollback. |
| `LOG_REQUEST_BODY` | `false` | When `1`, includes request body under `payload`. |
| `LOG_REQUEST_BODY_MAX_BYTES` | `4096` | Max payload size before truncation metadata is emitted. |
| `LOG_EXTRA_MAX_BYTES` | `4096` | Max size for `req.diegosFlyLoggerExtra` serialization. |
| `LOG_SERVICE_NAME` | `FLY_APP_NAME` | Service name attached to log record. |
| `LOG_ENVIRONMENT` | `NODE_ENV` | Environment attached to log record. |
| `SENTRY_CAPTURE_HTTP_5XX` | `false` | If `true`, tries to capture 5xx HTTP events via `@sentry/node` (optional dependency). |

### Log Fields

Default JSON logs include:

- `time`, `level`, `msg`
- `method`, `url`, `status`, `response_time`
- `request_id` (`x-request-id` or `fly-request-id`)
- `service_name`, `environment`
- `ip`, `user_agent`, `browser`, `os`, `is_bot`
- `session_id`, `content_type`
- `payload_size`, `payload_truncated`, `payload_keys` (and `payload` only if enabled)
- `extra` from `req.diegosFlyLoggerExtra` (safe serialized)

### Loki / Grafana Tip

Parse log lines as JSON in your collector/pipeline. `level` is emitted explicitly (`info`, `warn`, `error`) and is suitable for Grafana log-level filtering.

### Sentry (Optional)

If your app already initializes Sentry, you can enable middleware-level HTTP 5xx capture by setting `SENTRY_CAPTURE_HTTP_5XX=true`.

This package does not require `@sentry/node`; it dynamically imports it when enabled. If the package is not installed, logging continues without Sentry capture.

### v2 Migration Notes

- Breaking change: default output changed from `[level] {json}` to pure JSON lines.
- To keep v1 shape temporarily, set `LOG_LEGACY_FORMAT=true`.


### Installation

On an express app, install the package from npm:

```sh
npm install diegos-fly-logger
```

Then, use it in your application:

```js
import { logging } from 'diegos-fly-logger';

app.use(logging);
```

### Publishing a Release

1. Run the release script with the desired version:
   ```sh
   sh release.sh <version>
   ```

2. Publish the package to npm:
   ```sh
   npm publish
   ```
