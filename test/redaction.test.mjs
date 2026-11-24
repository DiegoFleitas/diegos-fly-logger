import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import morgan from "morgan";
import {
    logging,
    redactSensitiveFields,
    redactUrlQuery,
    hashSessionId,
} from "../index.mjs";

// Built with fromCharCode so the source file carries no ambiguous escapes.
const LINE_SEPARATOR = String.fromCharCode(0x2028);
const NULL_CHARACTER = String.fromCharCode(0x00);

test("redacts sensitive payload fields at any nesting depth", () => {
    const redacted = redactSensitiveFields({
        username: "diego",
        password: "hunter2",
        Authorization: "Bearer abc",
        nested: { access_token: "tok", apiKey: "k", keep: "visible" },
        list: [{ clientSecret: "s" }],
    });

    assert.equal(redacted.username, "diego");
    assert.equal(redacted.password, "[REDACTED]");
    assert.equal(redacted.Authorization, "[REDACTED]");
    assert.equal(redacted.nested.access_token, "[REDACTED]");
    assert.equal(redacted.nested.apiKey, "[REDACTED]");
    assert.equal(redacted.nested.keep, "visible");
    assert.equal(redacted.list[0].clientSecret, "[REDACTED]");
});

test("redacts sensitive URL query parameters but keeps the rest", () => {
    assert.equal(
        redactUrlQuery("/login?token=abc123&page=2"),
        "/login?token=%5BREDACTED%5D&page=2"
    );
    assert.equal(redactUrlQuery("/search?q=hola"), "/search?q=hola");
    assert.equal(redactUrlQuery("/no-query"), "/no-query");
});

test("hashes session identifiers deterministically", () => {
    const first = hashSessionId("session-abc");
    assert.equal(first, hashSessionId("session-abc"));
    assert.notEqual(first, "session-abc");
    assert.equal(first.length, 16);
    assert.equal(hashSessionId(null), null);
});

test("middleware emits one JSON line with sensitive data redacted", async () => {
    assert.equal(typeof logging, "function");

    const lines = [];
    // `index.mjs` registers the "json" morgan format globally, so a second
    // middleware over an in-memory stream exercises the real formatter.
    const middleware = morgan("json", {
        stream: { write: (line) => lines.push(String(line)) },
    });

    const req = {
        method: "POST",
        url: "/login?token=abc123&page=2",
        headers: {
            "user-agent": "node-test",
            "content-type": "application/json",
        },
        body: {
            username: "diego",
            password: "hunter2",
            nested: { access_token: "tok" },
        },
        session: { id: "session-abc" },
    };
    const res = new EventEmitter();
    res.statusCode = 200;
    res.getHeader = () => undefined;
    res.setHeader = () => {};
    res.end = () => {};

    middleware(req, res, () => {});
    res.emit("finish");
    await new Promise((resolve) => setImmediate(resolve));

    const output = lines.join("");
    assert.ok(output.includes('"level":"info"'), output);
    assert.ok(output.includes("%5BREDACTED%5D"), output);
    assert.ok(!output.includes("hunter2"), output);
    assert.ok(!output.includes('"access_token":"tok"'), output);
    assert.ok(!output.includes("session-abc"), output);
    assert.ok(output.includes(hashSessionId("session-abc")), output);
});

const captureLogLine = async (req) => {
    const lines = [];
    const logger = morgan("json", {
        stream: { write: (line) => lines.push(String(line)) },
    });
    const res = new EventEmitter();
    res.statusCode = 200;
    res.getHeader = () => undefined;
    res.setHeader = () => {};
    res.end = () => {};

    logger(req, res, () => {});
    res.emit("finish");
    await new Promise((resolve) => setImmediate(resolve));
    return lines.join("");
};

test("never emits authorization, cookie or set-cookie header values", async () => {
    const output = await captureLogLine({
        method: "GET",
        url: "/me",
        headers: {
            authorization: "Bearer super-secret-token",
            cookie: "sid=cookie-value-123",
            "set-cookie": "sid=cookie-value-123",
            "user-agent": "node-test",
        },
        body: null,
        session: null,
    });

    assert.ok(output.length > 0);
    assert.ok(!output.includes("super-secret-token"), output);
    assert.ok(!output.includes("cookie-value-123"), output);
});

test("redacts extra fields attached by the host application", async () => {
    const output = await captureLogLine({
        method: "GET",
        url: "/checkout",
        headers: { "user-agent": "node-test" },
        body: null,
        session: null,
        diegosFlyLoggerExtra: { refreshToken: "rt-value", note: "keep-me" },
    });

    assert.ok(output.includes("keep-me"), output);
    assert.ok(!output.includes("rt-value"), output);
});

test("sanitizes header-derived fields against log injection and amplification", async () => {
    const output = await captureLogLine({
        method: "GET",
        url: "/",
        headers: {
            "user-agent": `evil${LINE_SEPARATOR}injected${NULL_CHARACTER}line ${"A".repeat(400)}`,
            "x-request-id": `rid${LINE_SEPARATOR}spoofed`,
        },
        body: null,
        session: null,
    });

    const entry = JSON.parse(output);
    assert.ok(!entry.user_agent.includes(LINE_SEPARATOR), output);
    assert.ok(!entry.user_agent.includes(NULL_CHARACTER), output);
    assert.ok(entry.user_agent.endsWith("...[TRUNCATED]"), entry.user_agent);
    assert.ok(entry.user_agent.length < 300, entry.user_agent);
    // morgan escapes token output and our sanitizer strips control characters,
    // so neither a raw line separator nor a NUL can reach the record.
    assert.ok(!entry.request_id.includes(LINE_SEPARATOR), entry.request_id);
    assert.ok(!entry.request_id.includes(NULL_CHARACTER), entry.request_id);
    assert.equal(output.trimEnd().split("\n").length, 1, output);
});

test("emits a redacted payload and hides sensitive key names when body logging is on", async () => {
    const previousValue = process.env.LOG_REQUEST_BODY;
    process.env.LOG_REQUEST_BODY = "1";
    try {
        // Separate module instance so the opt-in flag is read at import time.
        await import("../index.mjs?log-request-body=1");
    } finally {
        if (previousValue === undefined) {
            delete process.env.LOG_REQUEST_BODY;
        } else {
            process.env.LOG_REQUEST_BODY = previousValue;
        }
    }

    const output = await captureLogLine({
        method: "POST",
        url: "/login?token=abc123",
        headers: { "user-agent": "node-test", "content-type": "application/json" },
        body: {
            username: "diego",
            password: "hunter2",
            access_token: "tok",
            nested: { apiKey: "key-value" },
        },
        session: { id: "session-abc" },
    });

    const entry = JSON.parse(output);
    assert.equal(entry.payload.username, "diego");
    assert.equal(entry.payload.password, "[REDACTED]");
    assert.equal(entry.payload.access_token, "[REDACTED]");
    assert.equal(entry.payload.nested.apiKey, "[REDACTED]");
    assert.deepEqual(entry.payload_keys, ["username", "nested"]);
    assert.ok(!output.includes("hunter2"), output);
    assert.ok(!output.includes("key-value"), output);
});
