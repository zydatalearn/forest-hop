const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");

const elements = new Map();
const storage = new Map([["forest-hop-name", "测试玩家"]]);
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
    setTimeout() {},
    document, Math: randomMath, window: { addEventListener() {} },
    localStorage: { getItem(key) { return storage.get(key) ?? null; }, setItem(key, value) { storage.set(key, String(value)); } },
    Image: class { decode() { return new Promise(() => {}); } }, performance: { now() { return 0; } }, requestAnimationFrame() {}
});
vm.runInContext(fs.readFileSync(path.join(__dirname, "../src/game.js"), "utf8"), sandbox);
vm.runInContext(`
    assetsReady = true;
    function check(condition, message) { if (!condition) throw new Error(message); }
    function setup() {
        restart();
        player.x = 140; player.y = 200; player.vy = 0;
        platforms = [makePlatform(400, 140), makePlatform(-10000, 140)];
        camera = 0; highest = 200;
    }
    function pickup(kind) { collectItem({kind, x: 163, y: 223, collected: false}); }
    setup();
    pickup("dash"); useSkill("dash"); keys.add("ArrowRight");
    const verticalStartY = player.y;
    for (let i = 0; i < 20; i++) {
        step(1 / 120);
    }
    check(Math.abs(player.y - verticalStartY + 130) < 0.001, "Dash must move vertically upward");
    check(Math.abs(player.x - 180) < 0.001, "Dash must preserve ordinary horizontal steering");
    setup(); pickup("dash"); player.vy = 500;
    const dashTarget = makePlatform(100, 140, false, true);
    platforms = [platforms[0], dashTarget, platforms[1]];
    useSkill("dash"); step(1 / 120);
    check(player.vy === -780, "Dash must reverse a fall immediately");
    for (let i = 0; i < 35; i++) step(1 / 120);
    check(!dashTarget.broken && player.y + player.height < dashTarget.y, "Upward dash must pass through boards without landing");
    let landedAfterDash = false;
    for (let i = 0; i < 160 && !gameOver; i++) {
        const oldVy = player.vy;
        step(1 / 120);
        if (oldVy >= 0 && player.vy < 0 && dashTarget.broken) { landedAfterDash = true; break; }
    }
    check(landedAfterDash, "Normal landing must resume after vertical dash");
    setup(); pickup("dash");
    document.getElementById("skill-dash").listeners.get("pointerdown")({preventDefault() {}, stopPropagation() {}});
    check(player.dashCharges === 0 && pointers.size === 0, "Touch skill steered player");
    setup(); pickup("dash");
    document.listeners.get("keydown")({code:"KeyK", repeat:true, target:{matches(){return false;}}, preventDefault(){}});
    check(player.dashCharges === 1, "Keyboard repeat consumed skill");
    document.listeners.get("keydown")({code:"KeyK", repeat:false, target:{matches(){return false;}}, preventDefault(){}});
    check(player.dashCharges === 0, "Keyboard skill did not trigger");
    setup(); pickup("dash"); draw();
    check(!document.getElementById("skill-dash").disabled && !document.getElementById("skill-dash").hidden && document.getElementById("skill-dash").span.textContent === "1", "HUD charges");
    check(document.getElementById("skill-feather").hidden, "Unowned skill should not obstruct view");
    player.shield = true; player.glideRemaining = 1; draw();
    check(player.shield && player.glideRemaining === 1, "Removing status bar preserves active effects");
    player.shield = false; player.invulnerable = 1; context.strokeStyle = "shield-consumed"; draw();
    check(context.strokeStyle === "shield-consumed", "Invulnerability must not redraw the shield ring");
    setup();
    pickup("dash"); pickup("dash"); pickup("dash");
    check(player.dashCharges === 2, "Dash cap");
    useSkill("dash");
    player.x = 0;
    const startX = player.x;
    const startY = player.y;
    for (let i = 0; i < 36; i++) step(1 / 120);
    check(player.x === startX && Math.abs(player.y - startY + 234) < 0.001, "Vertical dash distance must use simulation time");
    step(1 / 120);
    check(player.vy > -780 && player.vy < 0, "Gravity must resume after dash");
    const charges = player.dashCharges;
    useSkill("dash");
    check(player.dashCharges === charges, "Cooldown must block reuse");
    setup(); pickup("dash"); useSkill("dash");
    const remaining = player.dashRemaining;
    result.open = true; step(1); result.open = false;
    check(player.dashRemaining === remaining, "Pause consumed dash");
    document.hidden = true; step(1); document.hidden = false;
    check(player.dashRemaining === remaining, "Background consumed dash");
    setup(); pickup("dash"); useSkill("dash");
    const beforeBomb = bonusScore;
    platforms[0].hazard = {kind: "bomb", x: 169, y: 223, radius: 15};
    step(1 / 120);
    check(!gameOver && !platforms[0].hazard && bonusScore === beforeBomb + 15, "Dash bomb reward");
    platforms[0].hazard = {kind: "bomb", x: 176, y: 223, radius: 15};
    step(1 / 120);
    check(gameOver, "Only one bomb per dash");
    setup(); pickup("shield");
    platforms[0].hazard = {kind: "bomb", x: 163, y: 223, radius: 15}; step(1 / 120);
    check(!gameOver && !player.shield && !platforms[0].hazard, "Shield must remove contacted bomb");
    player.invulnerable = 0;
    platforms[0].hazard = {kind: "bomb", x: 163, y: 223, radius: 15}; step(1 / 120);
    check(gameOver, "Second unprotected hit must kill");
    setup(); pickup("shield"); player.y = height + 1; step(1 / 120);
    check(!gameOver && !player.shield && player.y < height && player.vy < 0, "Fall rescue");
    check(platforms.some(board => Math.abs(board.y - player.y - player.height) < 0.001), "Rescue board missing");
    setup(); pickup("shield"); player.y = height + 1;
    platforms = [makePlatform(200, 150), makePlatform(-10000, 150)];
    step(1 / 120);
    let reachedRoute = false;
    for (let i = 0; i < 120 && !gameOver; i++) {
        const oldVy = player.vy;
        step(1 / 120);
        if (oldVy >= 0 && player.vy < 0 && Math.abs(player.y + player.height - 200) < 0.001) reachedRoute = true;
    }
    check(reachedRoute, "Rescue must reconnect to the surviving route");
    for (const mode of ["spring", "broken", "moving"]) {
        setup(); pickup("shield"); player.y = height + 1; player.featherUsed = true;
        const target = makePlatform(200, 150, mode === "spring", mode === "broken");
        target.extras = [makePlatform(250, 20)];
        if (mode === "broken") target.broken = true;
        if (mode === "moving") { target.motion = {baseX:150, amplitude:18, phase:0}; highest = -21000; }
        platforms = [...target.extras, target, makePlatform(-10000, 150)];
        step(1 / 120);
        check(!player.featherUsed && !target.broken && !target.fragile, "Rescue landing state");
        let reconnected = false;
        for (let i = 0; i < 120 && !gameOver; i++) {
            keys.clear();
            const delta = target.x + 7 - player.x;
            if (Math.abs(delta) > 1) keys.add(delta > 0 ? "ArrowRight" : "ArrowLeft");
            const oldVy = player.vy;
            step(1 / 120);
            if (oldVy >= 0 && player.vy < 0 && Math.abs(player.y + 46 - target.y + (target.spring ? 20 : 0)) < 0.001)
                reconnected = true;
        }
        check(reconnected, "Rescue did not reconnect: " + mode);
    }
    setup(); pickup("dash"); pickup("feather");
    let preventedButtonSpace = false;
    document.listeners.get("keydown")({code:"Space",repeat:false,target:{matches(selector){return selector.includes("button");}},preventDefault(){preventedButtonSpace=true;}});
    check(!preventedButtonSpace && player.dashCharges === 1, "Space must preserve focused button activation");
    document.getElementById("skill-feather").listeners.get("click")({detail:0});
    check(player.featherCharges === 0 && player.dashCharges === 1, "Keyboard click must activate feather only");
    setup(); pickup("glide"); player.vy = 500; keys.add("ArrowRight"); step(1 / 120);
    check(player.vy === 220 && Math.abs(player.x - 142.5) < 0.001, "Glide fall/move speed");
    setup(); pickup("magnet");
    platforms[0].motion = {baseX: 140, amplitude: 18, phase: 0}; highest = -21000;
    platforms[0].item = {kind: "pinecone", x: 218, y: 280, radius: 10, collected: false};
    step(1 / 120);
    const attractedX = platforms[0].item.x; step(1 / 120);
    check(platforms[0].item.attracted && platforms[0].item.x < attractedX, "Moving board reset attracted item");
    setup(); pickup("feather"); pickup("feather"); useSkill("feather");
    check(player.vy === jumpSpeed && player.featherUsed, "Air jump missing");
    useSkill("feather"); check(player.featherCharges === 1, "Repeated air jump");
    player.x = 147; player.y = 350; player.vy = 300;
    for (let i = 0; i < 5; i++) step(1 / 120);
    check(!player.featherUsed, "Landing must reset feather eligibility");
    setup(); pickup("spring-boots"); useSkill("spring-boots");
    player.x = 147; player.y = 350; player.vy = 300;
    for (let i = 0; i < 5; i++) step(1 / 120);
    check(player.vy < -800 && !player.bootsArmed, "Boots must affect next landing once");
    setup(); combo = 10; pickup("pinecone"); pickup("diamond");
    check(bonusScore === 12 + 36 + 20, "Combo/collection chain accounting");
    setup(); player.dashCharges = 2; player.shield = true; player.glideRemaining = 2;
    restart(); check(player.dashCharges === 0 && !player.shield && player.glideRemaining === 0 && combo === 0, "Restart state leak");
    setup();
    for (let i = 0; i < 1000; i++) {
        const source = makePlatform(526 - 30 * 10, 150);
        const target = nextPlatform(source);
        check(!target.item || ["pinecone", "diamond"].includes(target.item.kind), "Early functional pickup");
    }
    setup(); highest = 458 - 4999 * 10;
    const solidBoard = platforms[0];
    step(1 / 120);
    check(!solidBoard.fragile, "All-fragile threshold must not start before 5000");
    collectItem({kind:"pinecone", x:163, y:223});
    step(1 / 120);
    check(!solidBoard.fragile, "Pickup score must not advance height difficulty");
    highest = 458 - 5000 * 10; step(1 / 120);
    check(platforms.every(board => board.fragile), "Existing boards must become fragile at 5000");
    for (const spring of [false, true]) {
        const highBoard = makePlatform(400,140,spring);
        platforms = [highBoard, makePlatform(-10000,140)];
        player.x=147; player.y=(spring ? 380 : 400)-46-1; player.vy=300;
        step(1/120);
        check(highBoard.broken && player.vy === (spring ? springSpeed : jumpSpeed), "High-score board must bounce then break, including springs");
        const next = nextPlatform(highBoard);
        check(highBoard.fragile && next.fragile && next.extras.every(board=>board.fragile), "Generation must preserve all-fragile rule");
    }
    restart(); check(score()===0 && !platforms[0].fragile, "Restart must reset 5000-point mode");
    hardMode = true;
    let source = makePlatform(-5000, 150), moss = 0, hives = 0, wind = 0;
    for (let i = 0; i < 2000; i++) {
        const target = nextPlatform(source);
        check(!target.hazard, "Hard mode hazard on main route");
        if (target.wind) wind++;
        for (const extra of target.extras) { if (extra.mossy) moss++; if (extra.hazard?.kind === "hive") hives++; }
        source = target;
    }
    check(moss && hives && wind, "Hard-mode elements not generated");
    setup(); hardMode = true;
    platforms[0].hazard = {kind: "hive", x: 300, y: 223, radius: 15, triggered: false};
    step(1 / 120); check(platforms[0].hazard.triggered, "Hive trigger");
    for (let i = 0; i < 241; i++) step(1 / 120);
    check(platforms[0].hazard.kind === "bug", "Hive did not release bug");
    setup(); hardMode = false;
    lifetimeStats.bestCombo = 0;
    unlockedAchievements = unlockedAchievements.filter(id => id !== "combo-master");
    combo = 19;
    player.x = 147; player.y = 350; player.vy = 300;
    for (let i = 0; i < 5; i++) step(1 / 120);
    check(lifetimeStats.bestCombo === 20 && unlockedAchievements.includes("combo-master"), "Landing must save peak combo and unlock achievement immediately");
    combo = 0; finish();
    check(lifetimeStats.bestCombo === 20, "Reset combo erased peak achievement");
    setup(); startStage("tutorial-1");
    highest = 458 - (startHeight + 300) * 10;
    draw();
    check(!gameOver && !stageComplete, "Rendering must not complete stages");
    step(1 / 120);
    check(gameOver && stageComplete && result.open && completedRun && !uploadConfirm.open, "Completion must open results and record run without covering stage controls");
    check(!document.getElementById("stage-result").hidden, "Stage controls missing");
    const completedRuns = lifetimeStats.runs;
    finish(); draw(); step(1 / 120);
    check(lifetimeStats.runs === completedRuns, "Completion counted twice");
    document.getElementById("retry-stage").listeners.get("click")();
    check(stageMode.id === "tutorial-1" && !gameOver && !stageComplete && !result.open, "Stage retry failed");
    stageMode = null; setup();
    const enabledBefore = musicEnabled;
    document.getElementById("music-button").listeners.get("click")();
    check(musicEnabled !== enabledBefore && document.getElementById("music-enabled").checked === musicEnabled, "Music button did not synchronize setting");
    document.getElementById("music-enabled").listeners.get("change")({target:{checked:enabledBefore}});
    check(musicEnabled === enabledBefore, "Pause music setting failed");
    dailyChallenge = {day:"2000-01-01",height:99999};
    updateDailyChallenge(0);
    check(dailyChallenge.height === 0, "Daily progress did not reset at date change");
    updateDailyChallenge(1500);
    check(document.getElementById("daily-progress").textContent === "已完成 ✓", "Daily completion missing");
    renderAchievements(); restart();
    check(dailyChallenge.height === 1500 && document.getElementById("daily-name").textContent.includes("今日目标"), "Daily progress erased by rendering or restart");
    dailyChallenge = JSON.parse(localStorage.getItem("forest-hop-daily"));
    updateDailyChallenge();
    check(dailyChallenge.height === 1500 && document.getElementById("daily-progress").textContent === "已完成 ✓", "Daily completion was not persisted");
`, sandbox);
console.log("Passed: skill charges, timers, pause, bomb/shield collisions, rescue, glide, magnet, air jump, boots, chains and hard-mode generation.");

vm.runInContext(`
    (async () => {
        setup(); finish();
        const oldRun = completedRun;
        let completeUpload;
        let rankingReads = 0;
        requestScores = options => options?.method === "POST" ? new Promise(resolve => completeUpload = resolve) :
            (rankingReads++, Promise.resolve({records: [], self: null}));
        const oldUpload = uploadScore();
        restart();
        completeUpload({});
        await oldUpload;
        check(!uploaded && !completedRun && !gameOver && rankingReads === 0, "Old upload changed a new run");
        check(!uploading, "Old upload left upload lock");
        finish();
        const currentUpload = uploadScore();
        completeUpload({});
        await currentUpload;
        check(uploaded && rankingReads === 1 && completedRun !== oldRun, "Current upload must still succeed");
        setup(); finish();
        let rejectUpload;
        requestScores = () => new Promise((resolve, reject) => rejectUpload = reject);
        const failedOldUpload = uploadScore();
        restart(); finish();
        const freshStatus = document.getElementById("upload-status").textContent;
        rejectUpload(new Error("old request failed"));
        await failedOldUpload;
        check(!uploaded && !uploading && document.getElementById("upload-status").textContent === freshStatus,
            "Old upload failure changed the new run's dialog");
    })()
`, sandbox).then(() => console.log("Passed: stale upload isolation and current-run upload success."))
    .catch(error => { console.error(error); process.exitCode = 1; });


