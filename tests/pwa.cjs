const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const { version } = require("../package.json");
const handlers = {}, stored = new Map();
let network = 0, deleted = [];
const origin = "https://example.test/game/";
const cache = { async addAll(files) { for (const file of files) stored.set(new URL(file, origin).href, { cached: true }); },
    async match(key) { return stored.get(key); }, async put(key, response) { stored.set(key, response); } };
const sandbox = vm.createContext({ URL, self: { location: new URL("sw.js", origin), clients: { async claim() {} },
    addEventListener(type, handler) { handlers[type] = handler; } },
    caches: { async open() { return cache; }, async keys() { return ["forest-hop-old", "other-app", "forest-hop-" + version]; }, async delete(key) { deleted.push(key); } },
    async fetch() { network++; throw Error("offline"); }
});
vm.runInContext(fs.readFileSync("sw.js", "utf8"), sandbox);
(async () => {
    let pending;
    handlers.install({ waitUntil(promise) { pending = promise; } }); await pending;
    for (const file of vm.runInContext("FILES", sandbox)) if (file !== "./") assert.ok(fs.existsSync(file.split("?")[0]), file);
    handlers.activate({ waitUntil(promise) { pending = promise; } }); await pending;
    assert.deepEqual(deleted, ["forest-hop-old"]);
    for (const [url, mode] of [[origin, "navigate"], [origin + "src/game.js?v=" + version, "cors"], [origin + "assets/images/runtime/dash.webp", "cors"]]) {
        handlers.fetch({ request: { method: "GET", url, mode }, respondWith(promise) { pending = promise; } });
        assert.equal((await pending).cached, true);
    }
    assert.equal(network, 0);
    let intercepted = false;
    handlers.fetch({ request: { method: "GET", url: origin + "scores", mode: "cors" }, respondWith() { intercepted = true; } });
    assert.equal(intercepted, false);
    const html = fs.readFileSync("index.html", "utf8");
    assert.ok(html.includes("game.js?v=" + version) && html.includes("style.css?v=" + version));
    const manifest = JSON.parse(fs.readFileSync("manifest.webmanifest", "utf8"));
    assert.equal(manifest.start_url, "./");
    console.log("Passed: offline app/assets, scoped cache cleanup, API bypass and generated versions.");
})().catch(error => { console.error(error); process.exitCode = 1; });
