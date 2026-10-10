const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const elements = new Map();
function element(id) {
    if (!elements.has(id)) elements.set(id, {
        open: false, handlers: {}, children: [], classList: { remove() {}, toggle() {} },
        addEventListener(type, handler) { this.handlers[type] = handler; },
        getContext() { return {}; }, showModal() { this.open = true; },
        close() { this.open = false; this.handlers.close?.(); },
        replaceChildren() { this.children = []; }, append(...items) { this.children.push(...items); }
    });
    return elements.get(id);
}
const posts = [];
let fail = false;
let finishRequest;
const context = vm.createContext({
    document: { hidden: false, getElementById: element, createElement: () => element(Math.random()), addEventListener() {} },
    window: { addEventListener() {} }, localStorage: { getItem(key) { return key === "forest-hop-name" ? "小树" : null; }, setItem() {} },
    Image: class {}, performance: { now: () => 0 }, requestAnimationFrame() {},
    FOREST_HOP_API_URL: "https://scores.example", AbortController, setTimeout, clearTimeout,
    fetch: async (url, options) => {
        if (options.method === "POST") {
            posts.push(JSON.parse(options.body));
            await new Promise(resolve => { finishRequest = resolve; });
            assert.equal(url, "https://scores.example/scores");
            assert(!options.headers.Authorization);
            return { ok: !fail, status: fail ? 502 : 201, json: async () => ({ message: "凭据不可用" }) };
        }
        return { ok: true, json: async () => [{ title: "[Forest Hop Score]", user: { login: "test" },
            body: '```json\n' + JSON.stringify({ game: "forest-hop", ...posts.at(-1) }) + '\n```' }] };
    }
});
vm.runInContext(fs.readFileSync(path.join(__dirname, "../src/game.js"), "utf8"), context);
const run = source => vm.runInContext(source, context);

(async () => {
    run("highest = 358; finish()");
    assert(element("upload-confirm").open);
    assert(element("manual-upload").hidden);
    const upload = run("uploadScore()");
    await run("uploadScore()");
    assert.equal(posts.length, 1);
    assert(element("upload-yes").disabled);
    assert(element("upload-no").disabled);
    const value = posts[0];
    assert.equal(value.name, "小树");
    assert.equal(value.score, 10);
    finishRequest();
    await upload;
    assert(!element("upload-confirm").open);
    assert(element("submit-score").disabled);
    assert.equal(element("rank-list").children[0].children[2].textContent, "10 分");
    await run("uploadScore()");
    assert.equal(posts.length, 1);

    run("restart(); finish()");
    fail = true;
    const failure = run("uploadScore()");
    finishRequest();
    await failure;
    assert(element("upload-confirm").open);
    assert(!element("upload-yes").disabled);
    assert(!run("completedRun.uploaded"));
    assert(element("upload-status").textContent.includes("凭据"));
    assert(!element("manual-upload").hidden);
    const manualBody = new URL(element("manual-upload").href).searchParams.get("body");
    assert(manualBody.includes('"name": "小树"'));
    assert(manualBody.includes('"score": 0'));
    fail = false;
    const retry = run("uploadScore()");
    finishRequest();
    await retry;
    assert(run("completedRun.uploaded"));
    console.log("Passed: fixed score/name, duplicate prevention, successful ranking refresh, permission failure and retry.");
})().catch(error => { console.error(error); process.exitCode = 1; });
