import assert from "node:assert/strict";
import worker from "../worker/index.mjs";

const env = { ALLOWED_ORIGIN: "https://zydatalearn.github.io", GITHUB_TOKEN: "test-secret",
    SCORE_LIMIT: { limit: async () => ({ success: true }) } };
const request = (body, options = {}) => new Request("https://worker.example/scores", {
    method: "POST", headers: { Origin: env.ALLOWED_ORIGIN, "Content-Type": "application/json", "CF-Connecting-IP": "127.0.0.1" },
    body: JSON.stringify(body), ...options
});
let calls = 0;
const originalFetch = globalThis.fetch;
globalThis.fetch = async (url, options) => {
    calls++;
    assert.equal(url, "https://api.github.com/repos/zydatalearn/forest-hop/issues");
    assert.equal(options.headers.Authorization, "Bearer test-secret");
    const issue = JSON.parse(options.body);
    const value = JSON.parse(issue.body.match(/```json\s*([\s\S]*?)```/)[1]);
    assert.equal(value.name, "小树");
    assert.equal(value.score, 310);
    return new Response("{}", { status: 201 });
};
try {
    let response = await worker.fetch(request({ name: "小树", score: 310 }), env);
    assert.equal(response.status, 201);
    assert.equal(response.headers.get("Access-Control-Allow-Origin"), env.ALLOWED_ORIGIN);
    assert(!(await response.text()).includes(env.GITHUB_TOKEN));
    for (const body of [{ name: "", score: 3 }, { name: "小树", score: -1 }, { name: "小树", score: 1.5 }, { name: "小树", score: "3" }, null]) {
        assert.equal((await worker.fetch(request(body), env)).status, 400);
    }
    assert.equal((await worker.fetch(request({ name: "小树", score: 310 }, { headers: { Origin: "https://other.example" } }), env)).status, 403);
    response = await worker.fetch(request(null, { method: "OPTIONS", body: undefined }), env);
    assert.equal(response.status, 204);
    assert.equal((await worker.fetch(request({ name: "小树", score: 310 }), { ...env, GITHUB_TOKEN: "" })).status, 503);
    assert.equal((await worker.fetch(request({ name: "小树", score: 310 }), { ...env, SCORE_LIMIT: { limit: async () => ({ success: false }) } })).status, 429);
    assert.equal(calls, 1);
    globalThis.fetch = async () => new Response("private upstream details", { status: 401 });
    response = await worker.fetch(request({ name: "小树", score: 310 }), env);
    assert.equal(response.status, 502);
    assert(!(await response.text()).includes("private upstream details"));
    console.log("Passed: Worker validation, CORS, preflight, throttling, GitHub submission and secret-safe errors.");
} finally { globalThis.fetch = originalFetch; }
