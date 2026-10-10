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
            getContext() { return {}; }, showModal() { this.open = true; }, close() { this.open = false; },
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
    Image: class { decode() { return new Promise(() => {}); } }, performance: { now() { return 0; } }, requestAnimationFrame() {}
});
vm.runInContext(fs.readFileSync(path.join(__dirname, "../src/game.js"), "utf8"), sandbox);

const checked = vm.runInContext(`
    let checked = 0, mandatory = 0, hazards = 0, moving = 0, bombs = 0;
    for (let route = 0; route < 100; route++) {
        let source = makePlatform(526, 150);
        bonusScore = 0;
        for (let index = 0; index < 600; index++) {
            const target = nextPlatform(source);
            if (target.extras.length > 1) throw new Error("Too many extra boards");
            if (target.item && (target.item.x !== target.x + 30 ||
                target.item.y !== target.y - (target.spring ? 38 : 18)))
                throw new Error("Pickup must sit above its own board");
            if (source.item) {
                for (const board of [...target.extras, target]) {
                    if (source.item.y + 14 > board.y && source.item.y - 14 < board.y + board.height &&
                        source.item.x + 14 > board.x && source.item.x - 14 < board.x + board.width)
                        throw new Error("Pickup overlaps upper board");
                }
            }
            if (target.hazard) throw new Error("Bomb on main route");
            for (const extra of target.extras) {
                if (extra.y !== target.y) throw new Error("Extra board on wrong height");
                if (extra.hazard) {
                    hazards++; bombs++;
                    if (extra.hazard.kind !== "bomb" || extra.hazard.x !== extra.x + 30 || extra.hazard.y !== extra.y - 19)
                        throw new Error("Hazard must be a bomb on a board");
                }
            }
            if (target.motion) {
                moving++;
                if (target.spring || target.fragile || source.spring || source.motion) throw new Error("Unsafe moving section");
                // Cover both motion extremes and random phases instead of only the generator's phase.
                target.motion.phase = route % 3 === 0 ? Math.PI / 2 : route % 3 === 1 ? -Math.PI / 2 : Math.random() * Math.PI * 2;
                target.x = target.motion.baseX + Math.sin(target.motion.phase) * target.motion.amplitude;
            }
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
                vy: source.spring ? springSpeed : jumpSpeed, facing: 1, jumpTime: 0 };
            platforms = [...(source.extras || []), source, ...target.extras, target, makePlatform(target.y - 10000, target.x)];
            camera = player.y - height * 0.4;
            highest = player.y;
            gameOver = false;
            let landed = false;
            result.open = false;
            uploadConfirm.open = false;
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
    bonusScore = 0;
    player = { x: 140, y: 200, width: 46, height: 46, vy: 0, facing: 1, jumpTime: 0 };
    platforms = [makePlatform(300, 140), makePlatform(-10000, 140)];
    platforms[0].item = { kind: "diamond", x: 163, y: 223, radius: 10, collected: false };
    camera = 0;
    gameOver = false;
    step(1 / 120);
    if (bonusScore !== 30) throw new Error("Diamond bonus missing");
    step(1 / 120);
    if (bonusScore !== 30) throw new Error("Pickup counted twice");
    platforms[0].item = { kind: "pinecone", x: 163, y: 223, radius: 10, collected: false };
    step(1 / 120);
    if (bonusScore !== 40) throw new Error("Pinecone bonus missing");
    highest = -100000;
    if (movingSpeed() !== 36) throw new Error("Moving speed cap missing");
    player = { x: 140, y: 200, width: 46, height: 46, vy: 0, facing: 1, jumpTime: 0 };
    platforms = [makePlatform(300, 140), makePlatform(-10000, 140)];
    platforms[0].hazard = { x: 163, y: 223, radius: 15, kind: "bomb" };
    camera = 0;
    gameOver = false;
    step(1 / 120);
    if (!gameOver) throw new Error("Obstacle collision did not end game");
    bonusScore = 3000;
    restart();
    if (score() !== 0 || platforms.some(platform => platform.motion))
        throw new Error("Restart retained previous difficulty or score");
    highest = 458 - 1999 * 10;
    let lowSource = makePlatform(-30000, 150);
    for (let i = 0; i < 100; i++) {
        lowSource = nextPlatform(lowSource);
        if (lowSource.motion) throw new Error("Moving platform appeared before 2000 points");
    }
    highest = 458 - 2000 * 10;
    if (movingSpeed() !== 12) throw new Error("Moving speed should start slowly");
    ({ checked, mandatory, hazards, moving, bombs });
`, sandbox);
assert.equal(checked.checked, 60000);
assert(checked.mandatory > 0);
assert(checked.hazards > 0);
assert(checked.moving > 0);
assert(checked.bombs > 0);
console.log(`Passed: ${checked.checked} reachable jumps, ${checked.mandatory} spring sections, ${checked.moving} moving sections, ${checked.bombs} bombs; pickups, collision and speed cap.`);
