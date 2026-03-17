import morgan from "morgan";
import uaParser from "ua-parser-js";
import { config as dotenvConfig } from "dotenv";
dotenvConfig();

const safeParseUserAgent = (userAgent) => {
    if (!userAgent) {
        return uaParser();
    }
    return uaParser(userAgent);
};

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

// Define a custom morgan format to log JSON to the client
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
    const logLevel = statusCode >= 400 ? "error" : "info";

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
    const axiosError = tokens.axiosError ? tokens.axiosError(req, res) : null;

    const sessionId = req?.session?.id ?? null;
    const payload = req?.body ?? null;
    const contentType = req?.headers?.["content-type"] ?? null;

    return `[${logLevel}] ${JSON.stringify(
        {
            ip,
            userAgent,
            browser,
            os,
            isBot,
            method,
            url,
            status,
            payload: JSON.stringify(payload),
            contentType,
            responseTime,
            session_id: sessionId,
            axiosError,
        },
        null,
        PRETTIFY_LOGS ? 2 : 0
    )}`;
});

morgan.token("axiosError", function (req) {
    const res = req?.res;
    return {
        statusCode: res?.statusCode ?? null,
        statusText: res?.statusText ?? null,
        statusMessage: res?.statusMessage ?? null,
        headers: res?._headers ?? null,
        data: res?.data ?? null,
    };
});

export const logging = morgan("json");
