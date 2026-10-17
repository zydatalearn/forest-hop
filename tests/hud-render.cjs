const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
let writes = 0, paints = 0, reads = 0, now = 0, storageWrites = 0, rebuilds = 0;
const elements = new Map(), storage = new Map([["forest-hop-name", "test"]]);
const listeners = new Map();
let storageBlocked = false;
function node() {
    const value = { open: false, dataset: {}, listeners: new Map(),
        classList: { remove() {}, toggle() { writes++; } },
        addEventListener(type, handler) { this.listeners.set(type, handler); },
        setAttribute() { writes++; }, querySelector() { return this.span ||= node(); },
        showModal() { this.open = true; }, close() { this.open = false; this.listeners.get("close")?.(); },
        getContext() { return new Proxy({}, { get(target, key) { return target[key] || (() => { if (key === "clearRect") paints++; }); } }); },
        replaceChildren() { rebuilds++; }, append() {}
    };
    return new Proxy(value, { set(target, key, value) { writes++; target[key] = value; return true; } });
}
const document = { hidden: false, getElementById(id) { reads++; if (!elements.has(id)) elements.set(id, node()); return elements.get(id); },
    createElement: node, addEventListener(type, handler) { listeners.set(type, handler); } };
const sandbox = vm.createContext({ document, window: { addEventListener(type, handler) { listeners.set(type, handler); } },
    Image: class { decode() { return new Promise(() => {}); } }, setTimeout() {}, requestAnimationFrame() {},
    performance: { now: () => now }, localStorage: {
        getItem(key) { if (storageBlocked) throw Error("blocked"); return storage.get(key) ?? null; },
        setItem(key, value) { if (storageBlocked) throw Error("blocked"); storageWrites++; storage.set(key, String(value)); }
    }
});
const source = fs.readFileSync("src/game.js", "utf8");
vm.runInContext(source, sandbox);
const run = code => vm.runInContext(code, sandbox);
run("assetsReady = true; restart(); draw();");
writes = reads = 0;
run("for (let i = 0; i < 120; i++) draw();");
assert.equal(writes, 0, "Unchanged HUD must not write DOM");
assert.equal(reads, 0, "Drawing must use cached HUD nodes");
run("highest -= 10; draw();");
assert.ok(writes > 0, "Changed altitude must update HUD");
run("renderNeeded = false; pauseDialog.open = true;");
paints = writes = 0;
run("for (let i = 0; i < 120; i++) frame(i * 16);");
assert.equal(paints, 0); assert.equal(writes, 0);
run("pauseDialog.open = false; lastTime = undefined; frame(2000); frame(2016);");
assert.ok(paints > 0, "Resume must paint");
run("flushProgress(true);");
now = 1000; storageWrites = rebuilds = 0;
run("collectItem({kind:'pinecone', x:0, y:0});");
assert.equal(storageWrites, 0); assert.equal(rebuilds, 0);
run("updateDailyChallenge(10.9); bestHeight = 10; heightDirty = true; flushProgress();");
const firstBatch = storageWrites;
now = 1100;
run("updateDailyChallenge(11.9); bestHeight = 11; heightDirty = true; flushProgress();");
assert.equal(storageWrites, firstBatch, "Writes must be throttled for 250ms");
now = 1250; run("flushProgress();");
assert.ok(storageWrites > firstBatch);
run("updateDailyChallenge(12); bestHeight = 12; heightDirty = true;");
listeners.get("pagehide")();
assert.equal(storage.get("forest-hop-height"), "12");
assert.equal(JSON.parse(storage.get("forest-hop-daily")).height, 12);
run("restart(); player.shield = true; platforms = []; absorbHit(true);");
assert.equal(run("Number.isFinite(player.y) && platforms.length > 0"), true);
storageBlocked = true;
run("renderStages(); renderAchievements();");
storageBlocked = false;
run("restart(); finish('坠落了');");
assert.equal(run("uploadConfirm.open"), false);
assert.equal(elements.get("close-result").textContent, "再玩一次");
elements.get("close-result").listeners.get("click")();
assert.equal(run("gameOver || result.open"), false);
run("tutorialSeen = false; showTutorial();");
assert.equal(run("tutorial.open"), true);
const next = elements.get("tutorial-next").listeners.get("click");
next(); next(); next();
assert.equal(run("tutorial.open"), false);
assert.equal(storage.get("forest-hop-tutorial"), "1");
for (const meters of [600, 1000, 1500]) {
    run(`restart(); highest = 458 - ${meters} * 10; platforms = [makePlatform(player.y - 100, 150)]; nextGate = ${meters}; updateBonusGate();`);
    assert.equal(run("bonusGate !== null"), true);
    run("player.x = bonusGate.x; player.y = bonusGate.y - 30; updateBonusGate();");
    assert.equal(run("bonusScore"), 50);
    assert.equal(run("bonusGate"), null);
}
for (const trace of ['{}', 'null', '[null,{"x":"bad"}]']) {
    storage.set("forest-hop-trace", trace);
    const fresh = vm.createContext({ ...sandbox });
    vm.runInContext(source, fresh);
    assert.equal(vm.runInContext("bestTrace.length", fresh), 0);
}
console.log("Passed: zero repeated HUD writes/lookups, paused rendering, throttled/forced storage, hidden achievements, rescue, tutorial, gates and malformed traces.");
