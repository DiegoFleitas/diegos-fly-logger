import morgan from "morgan";
import uaParser from "ua-parser-js";
import { config as dotenvConfig } from "dotenv";
dotenvConfig();

const DEFAULT_MAX_BYTES = 4096;
const requestBodyEnabled = process.env.LOG_REQUEST_BODY === "1";
const sentry5xxEnabled = process.env.SENTRY_CAPTURE_HTTP_5XX === "true";
const legacyFormatEnabled = process.env.LOG_LEGACY_FORMAT === "true";

const parseMaxBytes = (value) => {
    const parsed = Number.parseInt(value || "", 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_MAX_BYTES;
};

const requestBodyMaxBytes = parseMaxBytes(process.env.LOG_REQUEST_BODY_MAX_BYTES);
const extraMaxBytes = parseMaxBytes(process.env.LOG_EXTRA_MAX_BYTES);

let sentryCaptureMessage = null;
let sentryInitialized = false;

const tryInitSentry = () => {
    if (sentryInitialized || !sentry5xxEnabled) return;
    sentryInitialized = true;

    import("@sentry/node")
        .then((sentryModule) => {
            if (typeof sentryModule.captureMessage === "function") {
                sentryCaptureMessage = sentryModule.captureMessage.bind(sentryModule);
            }
        })
        .catch(() => {
            sentryCaptureMessage = null;
        });
};

const safeParseUserAgent = (userAgent) => {
    if (!userAgent) {
        return uaParser();
    }
    return uaParser(userAgent);
};

morgan.token("requestId", function (req) {
    return req?.headers?.["x-request-id"] || req?.headers?.["fly-request-id"] || null;
});

morgan.token("browser", function (req) {
    const userAgent = req?.headers?.["user-agent"] || "";
    const ua = safeParseUserAgent(userAgent);
    const browserName = ua.browser?.name || "Unknown";
    const browserVersion = ua.browser?.version || "";
    return `${browserName}${browserVersion ? ` ${browserVersion}` : ""}`;
});

morgan.token("os", function (req) {
    const userAgent = req?.headers?.["user-agent"] || "";
    const ua = safeParseUserAgent(userAgent);
    const osName = ua.os?.name || "Unknown";
    const osVersion = ua.os?.version || "";
    return `${osName}${osVersion ? ` ${osVersion}` : ""}`;
});

morgan.token("bot", function (req) {
    const userAgent = req?.headers?.["user-agent"] || "";
    const ua = safeParseUserAgent(userAgent);
    return ua.device?.type === "bot" ? "yes" : "no";
});

const safeSerialize = (value, maxBytes) => {
    const seen = new WeakSet();
    const json = JSON.stringify(value, (_key, val) => {
        if (typeof val === "object" && val !== null) {
            if (seen.has(val)) return "[Circular]";
            seen.add(val);
        }
        if (typeof val === "bigint") return val.toString();
        if (val instanceof Error) {
            return {
                name: val.name,
                message: val.message,
                stack: val.stack,
            };
        }
        return val;
    });

    const sizeBytes = Buffer.byteLength(json || "", "utf8");
    if (sizeBytes <= maxBytes) {
        return {
            value: json ? JSON.parse(json) : null,
            truncated: false,
            sizeBytes,
        };
    }

    return {
        value: {
            truncated: true,
            sizeBytes,
            maxBytes,
        },
        truncated: true,
        sizeBytes,
    };
};

const getPayloadFields = (payload) => {
    if (payload == null) return {};

    const serializedPayload = safeSerialize(payload, requestBodyMaxBytes);
    const fields = {
        payload_size: serializedPayload.sizeBytes,
        payload_truncated: serializedPayload.truncated,
    };

    if (typeof payload === "object" && payload !== null && !Array.isArray(payload)) {
        fields.payload_keys = Object.keys(payload);
    }

    if (requestBodyEnabled) {
        fields.payload = serializedPayload.value;
    }

    return fields;
};

morgan.format("json", function (tokens, req, res) {
    const PRETTIFY_LOGS = process.env.PRETTIFY_LOGS === "true";

    // If we don't have a request or headers, skip logging instead of throwing.
    const userAgent = req?.headers?.["user-agent"];
    if (!req || !req.headers) {
        return;
    }

    // Skip noisy health checks explicitly identified by user agent.
    if (userAgent === "Consul Health Check") {
        return;
    }

    const statusCode = res?.statusCode ?? 0;
    const logLevel = statusCode >= 500 ? "error" : statusCode >= 400 ? "warn" : "info";

    const ip = tokens["remote-addr"] ? tokens["remote-addr"](req, res) : null;
    const browser = tokens.browser ? tokens.browser(req, res) : null;
    const os = tokens.os ? tokens.os(req, res) : null;
    const isBot = tokens.bot ? tokens.bot(req, res) : null;
    const method = tokens.method ? tokens.method(req, res) : req.method;
    const url = tokens.url ? tokens.url(req, res) : req.url;
    const status = tokens.status ? tokens.status(req, res) : res?.statusCode;
    const responseTime = tokens["response-time"]
        ? tokens["response-time"](req, res)
        : null;
    const requestId = tokens.requestId ? tokens.requestId(req, res) : null;

    const sessionId = req?.session?.id ?? null;
    const payload = req?.body ?? null;
    const contentType = req?.headers?.["content-type"] ?? null;
    const extra = safeSerialize(req?.diegosFlyLoggerExtra ?? null, extraMaxBytes).value;
    const serviceName = process.env.LOG_SERVICE_NAME || process.env.FLY_APP_NAME || null;
    const environment = process.env.LOG_ENVIRONMENT || process.env.NODE_ENV || null;

    const payloadFields = getPayloadFields(payload);
    const logEntry = {
        time: new Date().toISOString(),
        level: logLevel,
        msg: `${method || "UNKNOWN"} ${url || ""} -> ${status || statusCode} (${responseTime || "0"}ms)`,
        ip,
        user_agent: userAgent,
        browser,
        os,
        is_bot: isBot,
        method,
        url,
        status,
        content_type: contentType,
        response_time: responseTime,
        session_id: sessionId,
        request_id: requestId,
        service_name: serviceName,
        environment,
        ...payloadFields,
        extra,
    };

    const serializedEntry = JSON.stringify(logEntry, null, PRETTIFY_LOGS ? 2 : 0);

    if (sentry5xxEnabled && statusCode >= 500) {
        tryInitSentry();
        if (typeof sentryCaptureMessage === "function") {
            try {
                sentryCaptureMessage(logEntry.msg, {
                    level: "error",
                    tags: {
                        method: method || "UNKNOWN",
                        service_name: serviceName || "unknown",
                        environment: environment || "unknown",
                    },
                    extra: {
                        status: status || statusCode,
                        url,
                        request_id: requestId,
                        response_time: responseTime,
                    },
                });
            } catch {
                // Keep logging path non-fatal even if Sentry capture fails.
            }
        }
    }

    if (legacyFormatEnabled) {
        return `[${logLevel}] ${serializedEntry}`;
    }

    return serializedEntry;
});

export const logging = morgan("json");
