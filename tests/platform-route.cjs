const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");

const elements = new Map();
const document = {
    hidden: false,
    getElementById(id) {
        if (!elements.has(id)) elements.set(id, {
            open: false, classList: { remove() {}, toggle() {} }, addEventListener() {},
            getContext() { return {}; }, showModal() { this.open = true; },
            replaceChildren() {}, append() {}
        });
        return elements.get(id);
    },
    createElement() { return { append() {} }; },
    addEventListener() {}
};
let seed = 1;
const randomMath = Object.create(Math);
randomMath.random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
};
const sandbox = vm.createContext({
    document, Math: randomMath, window: { addEventListener() {} },
    localStorage: { getItem(key) { return key === "forest-hop-name" ? "测试玩家" : null; }, setItem() {} },
    Image: class {}, performance: { now() { return 0; } }, requestAnimationFrame() {}
});
vm.runInContext(fs.readFileSync(path.join(__dirname, "../src/game.js"), "utf8"), sandbox);

const checked = vm.runInContext(`
    let checked = 0, mandatory = 0;
    for (let route = 0; route < 100; route++) {
        let source = makePlatform(526, 150);
        for (let index = 0; index < 160; index++) {
            const target = nextPlatform(source);
            const gap = source.y - target.y;
            if (source.requiredSpring) {
                mandatory++;
                if (!source.spring || source.fragile || target.spring || target.fragile || gap <= 100)
                    throw new Error("Unsafe mandatory spring section");
            }
            if (source.fragile && target.fragile) throw new Error("Consecutive fragile platforms");
            // Run the actual collision/physics code at 120Hz, aiming for the next center.
            const sourceBottom = source.y - (source.spring ? 20 : 0);
            player = { x: source.x + 7, y: sourceBottom - 46, width: 46, height: 46,
                vy: source.spring ? springSpeed : jumpSpeed, img: rightImage };
            platforms = [source, target, makePlatform(target.y - 10000, target.x)];
            camera = player.y - height * 0.4;
            highest = player.y;
            gameOver = false;
            let landed = false;
            for (let tick = 0; tick < 200; tick++) {
                keys.clear();
                const delta = target.x + 7 - player.x;
                if (Math.abs(delta) > 1) keys.add(delta > 0 ? "ArrowRight" : "ArrowLeft");
                const oldVelocity = player.vy;
                step(1 / 120);
                if (oldVelocity >= 0 && player.vy < 0) {
                    const targetBottom = target.y - (target.spring ? 20 : 0);
                    if (Math.abs(player.y + 46 - targetBottom) > 0.001)
                        throw new Error("Landed on wrong platform");
                    landed = true;
                    break;
                }
                if (gameOver) break;
            }
            if (!landed) throw new Error("Unreachable route at gap " + gap);
            target.broken = false;
            source = target;
            checked++;
        }
    }
    ({ checked, mandatory });
`, sandbox);
assert.equal(checked.checked, 16000);
assert(checked.mandatory > 0);
console.log(`Passed: ${checked.checked} reachable jumps, including ${checked.mandatory} mandatory spring sections.`);
