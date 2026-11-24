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
