const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");

const elements = new Map();
const document = {
    hidden: false,
    listeners: new Map(),
    getElementById(id) {
        if (!elements.has(id)) elements.set(id, {
            open: false, listeners: new Map(), span: {}, parentElement: {}, classList: { remove() {}, toggle() {} },
            addEventListener(type, handler) { this.listeners.set(type, handler); }, setAttribute() {},
            getContext() { return new Proxy({}, { get(target, key) { return target[key] || (() => {}); } }); },
            querySelector() { return this.span; }, showModal() { this.open = true; }, close() { this.open = false; },
            replaceChildren() {}, append() {}
        });
        return elements.get(id);
    },
    createElement() { return { append() {} }; },
    addEventListener(type, handler) { this.listeners.set(type, handler); }
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
vm.runInContext(`
    function check(condition, message) { if (!condition) throw new Error(message); }
    function stage(meters) { restart(); highest = 458 - meters * 10; }
    stage(0); gameTime = 100;
    check(ordinaryBombChance() === .45, "Waiting must not increase difficulty");
    bonusScore = 100000;
    updatePressure(.1);
    check(nextWaveAt === null && satiety === null && !makePlatform(300,140).fragile, "Bonus points must not unlock stages");
    check(score() === 100000, "Bonus score must remain included");
    stage(1000); check(ordinaryBombChance() === .8, "Height pressure ramp");
    for (const [meters, points, multiplier] of [[1999,1999,1],[2000,2000,1.25],[5000,5750,1.5],[8000,10250,1.75],[8004,10257,1.75]]) {
        stage(meters); check(score() === points && heightMultiplier() === multiplier, "Height tier accounting: " + meters);
        const before = score(); highest += 1; check(score() <= before, "No repeated height reward");
    }
    stage(2000); updatePressure(0); check(nextWaveAt === 5 && !bombWave, "First wave scheduled");
    gameTime = 5; platforms[0].hazard = {kind:"bomb"}; updatePressure(0);
    check(bombWave && bombWave.warningUntil === 6.2 && nextWaveAt === 10, "Wave warning and cadence");
    check(platforms.every(p => !p.hazard), "Wave replaces ordinary dangers");
    check(bombWave.bombs.every(b => b.x + 12 <= bombWave.gapLeft || b.x - 12 >= bombWave.gapLeft + bombWave.gapWidth), "Clear contiguous gap");
    const savedWave = bombWave; gameTime = 5.5; updatePressure(0); check(bombWave === savedWave, "No stacked waves");
    profile.open = true; const pausedTime = gameTime; step(.5); check(gameTime === pausedTime, "Pause freezes pressure"); profile.close();
    stage(8000); updatePressure(0); check(satiety === 15, "Hunger starts full");
    satiety = 5; collectItem({kind:"pinecone",x:163,y:223}); check(satiety === 9, "Pinecone restores four seconds");
    collectItem({kind:"diamond",x:163,y:223}); check(satiety === 15, "Diamond restores eight with cap");
    satiety = 4; collectItem({kind:"shield",x:163,y:223}); check(satiety === 4, "Skills do not feed");
    updatePressure(1); check(satiety === 3, "Hunger decreases with active time");
    const snack = platforms.find(p => p.foodGuaranteed);
    check(snack, "Pre-generated route gains guaranteed food");
    snack.item.collected = true; updatePressure(0); check(snack.item.collected, "Eaten food does not regenerate");
    satiety = .001; step(1/120); check(gameOver && deathReason === "饱食度耗尽", "Hunger death bypasses shield");
    restart(); check(altitude() === 0 && score() === 0 && satiety === null && bombWave === null, "Restart clears progression");
    draw(); check(document.getElementById("current-height").textContent === "0 m", "Height HUD");
`, sandbox);
console.log("Passed: height tiers, bonus isolation, pressure, wave cadence/gap, hunger, pause, restart and height HUD.");

vm.runInContext(`
    for (const kind of ["dash","shield","glide","magnet","feather","spring-boots"]) FEATURES[kind] = false;
    for (const startHeight of [2000, 5000, 8000]) {
        restart();
        const offset = startHeight * 10;
        player.y -= offset; highest -= offset; camera -= offset;
        for (const p of platforms) {
            p.y -= offset;
            if (p.item) p.item.y -= offset;
            if (p.hazard) p.hazard.y -= offset;
        }
        let source = platforms[0], target, landings = 0, waves = 0, lastWave;
        for (let tick = 0; tick < 120 * 60 && !gameOver; tick++) {
            if (!target) target = platforms.filter(p => p.extras && !p.broken && p.y < source.y).sort((a,b) => b.y-a.y)[0];
            check(target, "Continuous route needs next board");
            keys.clear(); const delta = target.x + 7 - player.x;
            if (Math.abs(delta) > 1) keys.add(delta > 0 ? "ArrowRight" : "ArrowLeft");
            const vy = player.vy, beforePlatforms = platforms.slice(); step(1/120);
            if (bombWave && bombWave !== lastWave) { waves++; lastWave = bombWave; }
            if (vy >= 0 && player.vy < 0) {
                const landed = beforePlatforms.find(p => Math.abs(player.y + player.height - p.y) < .001 || (p.spring && Math.abs(player.y + player.height - p.y + 20) < .001));
                check(landed, "Landing must correspond to board " + JSON.stringify(player)); source = landed; target = null; landings++;
            }
        }
        check(!gameOver, "Continuous route died at " + startHeight + ": " + deathReason + " time=" + gameTime);
        check(landings > 50 && waves >= 10, "Continuous simulation must cover routes and waves");
        if (startHeight === 8000) check(satiety > 0, "Food sustains continuous progress");
    }
`, sandbox);
console.log("Passed: 60 seconds of continuous main-route play at 2000/5000/8000 m with waves and hunger active.");
