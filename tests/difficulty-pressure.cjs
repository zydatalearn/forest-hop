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
    FEATURES.waves = false;
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
            keys.clear(); const delta = target.x + target.width / 2 - 23 - player.x;
            if (Math.abs(delta) > 1) keys.add(delta > 0 ? "ArrowRight" : "ArrowLeft");
            for (const p of platforms) delete p.hazard; // Isolate route and hunger from optional bomb detours.
            const vy = player.vy, beforePlatforms = platforms.slice(); step(1/120);
            if (bombWave && bombWave !== lastWave) { waves++; lastWave = bombWave; }
            if (vy >= 0 && player.vy < 0) {
                const landed = beforePlatforms.find(p => Math.abs(player.y + player.height - p.y) < .001 || (p.spring && Math.abs(player.y + player.height - p.y + 20) < .001));
                check(landed, "Landing must correspond to board " + JSON.stringify(player)); source = landed; target = null; landings++;
            }
        }
        check(!gameOver, "Continuous route died at " + startHeight + ": " + deathReason + " time=" + gameTime);
        check(landings > 50, "Continuous simulation must cover routes");
        if (startHeight === 8000) check(satiety > 0, "Food sustains continuous progress");
    }
`, sandbox);
console.log("Passed: 60 seconds of continuous main-route play at 2000/5000/8000 m with hunger active and hazards isolated; bomb behavior tested separately.");

vm.runInContext(`
    FEATURES.blinking = true;
    function testBlinkLanding(time, fragile = false) {
        restart(); FEATURES.waves = false; FEATURES.satiety = false;
        const blink = makePlatform(320,140,false,fragile); blink.blinkPhase = 0;
        platforms = [blink, makePlatform(-10000,140)];
        player.x = 147; player.y = 273; player.vy = 180; camera = 0; gameTime = time;
        step(1/120); return blink;
    }
    check(!testBlinkLanding(1).broken && player.vy < 0, "Visible board supports landing");
    testBlinkLanding(3.2); check(player.vy > 0 && player.y > 273, "Invisible board has no collision");
    testBlinkLanding(3.8); check(player.vy > 0, "Return outline remains non-solid");
    testBlinkLanding(4.1); check(player.vy < 0, "Board returns after one second");
    const brokenBlink = testBlinkLanding(1,true);
    check(brokenBlink.broken, "Fragile blinking board breaks on landing");
    gameTime = 4.1; check(platformOpacity(brokenBlink) === 0, "Broken board never returns");
    const blink = {blinkPhase:0};
    gameTime = 2.7; check(Math.abs(platformOpacity(blink)-.575)<.0001, "Smooth disappearance");
    gameTime = 3.2; check(platformOpacity(blink)===0, "Fully hidden interval");
    gameTime = 3.85; check(Math.abs(platformOpacity(blink)-.075)<.0001, "Faint return outline");
    profile.open = true; const phase = platformPhase(blink); step(.5);
    check(platformPhase(blink) === phase, "Pause freezes visibility cycle"); profile.close();
    for (const meters of [2999,3000,5000]) {
        restart(); highest = 458 - meters * 10; let source = makePlatform(-30000,150), count = 0;
        for(let i=0;i<500;i++) {
            const next = nextPlatform(source);
            check(next.blinkPhase === undefined, "Main route stays permanent");
            for(const extra of next.extras) {
                if(extra.blinkPhase === undefined) continue;
                count++; check(!extra.hazard && !extra.spring && !extra.motion, "No stacked hazard on blinking boards");
                if(meters===5000) check(extra.fragile, "High blinking board stays fragile");
            }
            source=next;
        }
        check(meters<3000 ? count===0 : count>0, "Blinking height threshold");
    }
    check(platformPhase({blinkPhase:0}) !== platformPhase({blinkPhase:4/3}), "Adjacent cycles offset");
`, sandbox);
console.log("Passed: blinking board collision, fade/outline, pause, permanent breakage, threshold and safe main route.");

vm.runInContext(`
    FEATURES.waves = true; stage(2000); updatePressure(0); gameTime = 5; updatePressure(0);
    const first = bombWave;
    check(first.gapWidth === 96 && first.bombs.length === 11, "Exactly four empty bomb slots, eleven bombs");
    player.y = first.y - 100; camera = first.y - 200; gameTime = 7; updatePressure(0);
    check(bombWaves.includes(first), "Passing above row must not erase bombs");
    gameTime = 10; updatePressure(0);
    check(bombWaves.includes(first) && bombWaves.length === 2, "New row must not replace visible previous row");
    camera = first.y - height - 31; updatePressure(0);
    check(!bombWaves.includes(first), "Cleanup only after row leaves screen");
    restart(); check(bombWaves.length===0, "Restart clears every row");
`, sandbox);
console.log("Passed: two-body gap, dense bomb row, persistence after crossing/new wave, offscreen cleanup and restart.");

vm.runInContext(`
    FEATURES.waves = true;
    startHeight = 0; restart(); highest = 458 - 5999 * 10;
    check(makePlatform(300,100).width === 60, "Full width below 6000");
    const old = makePlatform(400,100); old.motion = {baseX:100,amplitude:18,phase:0};
    old.item = {kind:"pinecone",x:130,y:382,collected:false};
    platforms=[old,makePlatform(-10000,140)]; highest=458-6000*10;
    player.y=200; camera=0; step(1/120);
    check(old.width===30 && old.motion.baseX===115 && old.item.x===old.x+15, "Narrowing preserves center and item/motion alignment");
    check(makePlatform(300,100,true).width===30, "Generated spring boards shrink");
    bestHeight=3000;
    const chooseCamp=document.getElementById("camp-option").listeners.get("click");
    const chooseForest=document.getElementById("forest-option").listeners.get("click");
    const lockedHeight=altitude(); chooseCamp(); check(startHeight===0 && altitude()===lockedHeight, "Locked camp rejects selection without restarting");
    highest=458; bestHeight=5000; chooseCamp();
    check(startHeight===2000 && altitude()===2000 && score()===2000 && bonusScore===0, "Camp starts at height-derived score without guessed pickups");
    check(camera===-20000 && platforms[0].y===526-20000 && !platforms[0].fragile, "Camp world and stable starting board");
    updatePressure(0); check(nextWaveAt===8 && !bombWave, "Camp grants three-second grace before wave schedule");
    restart(); check(altitude()===2000, "Restart retains selected camp");
    chooseForest(); check(altitude()===0 && score()===0, "Zero start remains available");
`, sandbox);
console.log("Passed: 6000m width boundary/alignment, camp unlock, height score, world positioning, grace and restart.");

vm.runInContext(`
    FEATURES.satiety=true; useCamp=true; bestHeight=10000; highest=458; restart();
    check(startHeight===7000 && altitude()===7000 && score()===8750, "Dynamic camp uses highest minus 3000 and tier score");
    check(platforms[0].width===30 && !platforms[0].fragile && platforms[0].x+15===180, "High camp starts centered on a solid narrow board");
    highest=458-12000*10; restart(); check(startHeight===9000, "New record changes next camp");
    updatePressure(0); gameTime=2; updatePressure(1); check(satiety===15, "High camp hunger grace");
    gameTime=3; updatePressure(1); check(satiety===14, "Hunger begins after grace");
    useCamp=false; restart(); check(startHeight===0 && altitude()===0, "Forest option remains zero");
`, sandbox);
console.log("Passed: dynamic camp progression, tier score, narrow starting board and hunger grace.");
