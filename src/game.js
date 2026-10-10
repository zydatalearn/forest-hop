// Physics use seconds so movement is consistent across refresh rates.
const gameVersion = "1.4.0";
document.getElementById("game-version").textContent = "v" + gameVersion;
const board = document.getElementById("board");
const context = board.getContext("2d");
const width = 360, height = 576;
function resizeCanvas() {
    const ratio = window.devicePixelRatio || 1;
    const bounds = board.getBoundingClientRect();
    board.width = Math.round((bounds.width || width) * ratio);
    board.height = Math.round(board.width * height / width);
    context.setTransform(board.width / width, 0, 0, board.height / height, 0, 0);
    context.imageSmoothingQuality = "high";
}
let assetsReady = false;
const squirrelImage = new Image();
const squirrelFrames = [
    [21, 234, 285, 311], [341, 283, 296, 261], [641, 233, 297, 312], [961, 214, 272, 297],
    [19, 676, 317, 309], [349, 682, 275, 345], [650, 787, 296, 237], [957, 723, 284, 305]
];
const platformImage = new Image();
const springImage = new Image();
const brokenImage = new Image();
const backgroundImage = new Image();
const diamondImage = new Image(), pineconeImage = new Image(), bombImage = new Image();
const skillImages = Object.fromEntries(["dash", "shield", "glide", "magnet", "feather", "spring-boots"].map(kind => [kind, new Image()]));
const assets = [
    [squirrelImage, "runtime/squirrel-jump-sheet.webp"], [platformImage, "platform-wood.webp"],
    [springImage, "spring.webp"], [brokenImage, "platform-broken-wood.webp"],
    [backgroundImage, "runtime/forest-warm.webp"], [diamondImage, "runtime/diamond.webp"],
    [pineconeImage, "runtime/pinecone.webp"], [bombImage, "runtime/bomb.webp"],
    ...Object.entries(skillImages).map(([kind, image]) => [image, "runtime/" + kind + ".webp"])
];

const gravity = 1440, jumpSpeed = -480, springSpeed = -900;
const FEATURES = { dash: true, shield: true, glide: true, magnet: true, feather: true, "spring-boots": true, chains: true,
    pressure: true, waves: true, satiety: true, blinking: true };
const itemNames = { dash: "冲刺", shield: "护心果", glide: "滑翔", magnet: "磁石", feather: "二段跳", "spring-boots": "弹簧靴" };
const effectTimers = ["dashRemaining", "dashCooldown", "invulnerable", "glideRemaining", "magnetRemaining", "slowRemaining"];
let hardMode = false, gameTime = 0, combo = 0, collectionChain = null;
let bombWaves = [], bombWave = null, nextWaveAt = null, satiety = null, deathReason = "";
const keys = new Set();
const pointers = new Map();
let player, platforms, camera, highest, gameOver, lastTime;
let accumulator = 0;
let fragments = [];
let bonusScore = 0;
let pickupEffects = [];
const result = document.getElementById("result");
const uploadConfirm = document.getElementById("upload-confirm");
const scoresUrl = "https://forest-hop-d2g5ydn2ydb209f8a-1466119337.ap-shanghai.app.tcloudbase.com/forest-hop-api/scores";
let completedRun, uploaded = false, uploading = false, rankingRequest = 0;
const profile = document.getElementById("profile");
const currentScore = document.getElementById("current-score");
const bestScore = document.getElementById("best-score");
let nickname = "森林旅人";
let hasNickname = false;
try {
    const savedName = localStorage.getItem("forest-hop-name")?.trim().slice(0, 12);
    if (savedName) { nickname = savedName; hasNickname = true; }
} catch {}
document.getElementById("player-name").textContent = nickname;
let bestHeight = 0, startHeight = 0;
try {
    bestHeight = Math.max(0, Number(localStorage.getItem("forest-hop-height")) || 0);
    startHeight = bestHeight >= 5000 && localStorage.getItem("forest-hop-start") === "2000" ? 2000 : 0;
} catch {}
let records = [];
try {
    const saved = JSON.parse(localStorage.getItem("forest-hop-scores") || "[]");
    if (Array.isArray(saved)) records = saved.map(value => typeof value === "number" ?
        { name: nickname, score: value } : value)
        .filter(value => value && Number.isInteger(value.score) && value.score >= 0 && typeof value.name === "string")
        .map(value => ({ name: value.name.trim().slice(0, 12) || "森林旅人", score: value.score }))
        .sort((a, b) => b.score - a.score).slice(0, 3);
    localStorage.setItem("forest-hop-scores", JSON.stringify(records));
} catch { /* Storage may be unavailable; keep scores for this session. */ }

function altitude() {
    return Math.max(0, Math.floor((458 - highest) / 10));
}

function heightMultiplier() {
    const meters = altitude();
    return meters >= 8000 ? 1.75 : meters >= 5000 ? 1.5 : meters >= 2000 ? 1.25 : 1;
}

function score() {
    const meters = altitude();
    return Math.floor(meters + Math.max(0, meters - 2000) * 0.25 +
        Math.max(0, meters - 5000) * 0.25 + Math.max(0, meters - 8000) * 0.25) + bonusScore;
}

function clearControls() {
    keys.clear();
    pointers.clear();
    for (const id of ["left", "right"]) document.getElementById(id).classList.remove("pressed");
    lastTime = undefined;
    accumulator = 0;
}

function renderRanking(values) {
    const list = document.getElementById("rank-list");
    list.replaceChildren();
    if (!values.length) {
        const item = document.createElement("li");
        item.textContent = "还没有记录，开始第一场挑战吧";
        list.append(item);
    }
    values.forEach((value, index) => {
        const item = document.createElement("li");
        const rank = document.createElement("span");
        rank.textContent = (index + 1) + ".";
        const name = document.createElement("span");
        name.className = "rank-name";
        name.textContent = value.name;
        const points = document.createElement("span");
        points.textContent = value.score + " 分";
        item.append(rank, name, points);
        list.append(item);
    });
}

function showLocalRanking() {
    document.getElementById("local-ranking").setAttribute("aria-pressed", "true");
    document.getElementById("online-ranking").setAttribute("aria-pressed", "false");
    rankingRequest++;
    document.getElementById("ranking-title").textContent = "本机 · 前 3";
    document.getElementById("ranking-status").textContent = "";
    document.getElementById("ranking-self").textContent = "";
    renderRanking(records);
}

async function requestScores(options = {}) {
    const url = options.method === "POST" ? scoresUrl : scoresUrl + "?name=" + encodeURIComponent(nickname);
    const response = await fetch(url, { ...options, signal: AbortSignal.timeout(25000) });
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || "排行服务暂时不可用");
    return data;
}

async function showOnlineRanking() {
    document.getElementById("local-ranking").setAttribute("aria-pressed", "false");
    document.getElementById("online-ranking").setAttribute("aria-pressed", "true");
    const request = ++rankingRequest;
    document.getElementById("ranking-title").textContent = "联机 · 前 10";
    document.getElementById("rank-list").replaceChildren();
    document.getElementById("ranking-self").textContent = "";
    const status = document.getElementById("ranking-status");
    status.textContent = "正在读取…";
    try {
        const data = await requestScores();
        if (request !== rankingRequest) return;
        renderRanking(data.records);
        status.textContent = "";
        document.getElementById("ranking-self").textContent = data.self ?
            "我 · 第 " + data.self.rank + " 名 · " + data.self.score + " 分" : "我 · 暂无成绩";
    } catch (error) {
        if (request === rankingRequest) status.textContent = error.name === "TimeoutError" ?
            "读取超时，请稍后重试；本机成绩仍保留" : "连接失败，请稍后重试；本机成绩仍保留";
    }
}

function showUploadConfirm() {
    if (!completedRun || uploaded || uploading) return;
    document.getElementById("upload-summary").textContent = completedRun.name + " · " + completedRun.score + " 分";
    document.getElementById("upload-status").textContent = "";
    uploadConfirm.showModal();
}

async function uploadScore() {
    if (!completedRun || uploaded || uploading) return;
    const run = completedRun;
    uploading = true;
    document.getElementById("confirm-upload").disabled = true;
    document.getElementById("cancel-upload").disabled = true;
    const status = document.getElementById("upload-status");
    status.textContent = "正在上传…";
    try {
        await requestScores({ method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify(run) });
        if (completedRun !== run) return;
        uploaded = true;
        document.getElementById("submit-score").hidden = true;
        uploadConfirm.close();
        showOnlineRanking();
    } catch (error) {
        if (completedRun !== run) return;
        status.textContent = error.name === "TimeoutError" ? "请求超时，可以重试；同名记录只保留最高分" :
            error instanceof TypeError ? "连接失败，请检查网络后重试；本机成绩已保存" : error.message;
    } finally {
        uploading = false;
        document.getElementById("confirm-upload").disabled = false;
        document.getElementById("cancel-upload").disabled = false;
    }
}

function showResult(ended) {
    keys.clear();
    pointers.clear();
    for (const id of ["left", "right"]) document.getElementById(id).classList.remove("pressed");
    document.getElementById("result-title").textContent = ended ? deathReason || "游戏结束" : "排行榜";
    document.getElementById("result-summary").innerHTML =
        "<span>本次 <strong>" + score() + "</strong></span><span>最佳 <b>" + (records[0]?.score || 0) + "</b></span>";
    showLocalRanking();
    document.getElementById("close-result").textContent = ended ? "查看场景" : "继续游戏";
    document.getElementById("play-again").hidden = !gameOver;
    document.getElementById("submit-score").hidden = !gameOver || uploaded;
    if (!result.open) result.showModal();
}

function finish(reason = "") {
    gameOver = true;
    bestHeight = Math.max(bestHeight, altitude());
    try { localStorage.setItem("forest-hop-height", String(bestHeight)); } catch {}
    deathReason = reason;
    completedRun = Object.freeze({ name: nickname, score: score() });
    records.push(completedRun);
    records.sort((a, b) => b.score - a.score);
    records = records.slice(0, 3);
    try { localStorage.setItem("forest-hop-scores", JSON.stringify(records)); } catch {}
    showResult(true);
    showUploadConfirm();
}

function makePlatform(y, x, spring = false, fragile = false) {
    return { x, y, width: altitude() >= 6000 ? 30 : 60, height: 18, spring, fragile: fragile || altitude() >= 5000, broken: false, compressedUntil: 0, requiredSpring: false };
}

function placeFood(platform) {
    platform.foodGuaranteed = true;
    platform.foodChecked = true;
    platform.item = { kind: platform.item?.kind === "diamond" ? "diamond" : "pinecone",
        x: platform.x + platform.width / 2, y: platform.y - (platform.spring ? 38 : 18), radius: 10, collected: false };
}

function platformPhase(platform) {
    return platform.blinkPhase === undefined ? 0 : (gameTime + platform.blinkPhase) % 4;
}

function platformOpacity(platform) {
    if (platform.broken) return 0;
    if (platform.blinkPhase === undefined) return 1;
    const phase = platformPhase(platform);
    if (phase < 2.4) return 1;
    if (phase < 3) return 1 - (phase - 2.4) / 0.6 * 0.85;
    return phase < 3.7 ? 0 : (phase - 3.7) / 0.3 * 0.15;
}

function ordinaryBombChance() {
    if (!FEATURES.pressure) return 0.6;
    if (FEATURES.waves && altitude() >= 2000) return bombWave ? 0 : 0.18;
    return 0.45 + Math.min(1, altitude() / 1000) * 0.35;
}

function nextPlatform(previous) {
    // Use route height so difficulty stays consistent even when platforms are generated ahead.
    const routeScore = Math.max(0, (526 - previous.y) / 10);
    const difficulty = Math.min(1, routeScore / 300);
    const springGap = previous.spring && routeScore >= 120;
    const spring = !previous.spring && !previous.motion && !springGap && Math.random() < 0.18 + difficulty * 0.08;
    // A spring target is 20px above its board; reserve that height on ordinary jumps.
    const gap = springGap ? 150 + difficulty * 60 + Math.random() * 10 :
        50 + difficulty * 18 - (spring ? 20 : 0);
    const rise = gap + (spring ? 20 : 0) - (previous.spring ? 20 : 0);
    const speed = previous.spring ? -springSpeed : -jumpSpeed;
    const landingTime = (speed + Math.sqrt(speed * speed - 2 * gravity * rise)) / gravity;
    // Leave reaction time and do not require screen wrapping to reach the next center.
    const moving = altitude() >= 2000 && !previous.motion && !previous.spring &&
        !spring && !springGap && Math.random() < 0.3;
    const amplitude = moving ? 18 : 0;
    const boardWidth = altitude() >= 6000 ? 30 : 60;
    const sourceX = (previous.motion ? previous.motion.baseX : previous.x) + (previous.width - boardWidth) / 2;
    // Reserve the full motion range at both ends, so every phase still has a reachable jump.
    const maxShift = Math.max(0, Math.min(65 + difficulty * 35, landingTime * 240 * 0.55) -
        amplitude - (previous.motion?.amplitude || 0));
    const x = Math.max(amplitude, Math.min(width - boardWidth - amplitude, sourceX + (Math.random() * 2 - 1) * maxShift));
    if (springGap) {
        previous.requiredSpring = true;
        previous.fragile = altitude() >= 5000;
    }
    const fragile = !moving && !spring && !springGap && !previous.spring && !previous.fragile &&
        Math.random() < 0.12 + difficulty * 0.18;
    const platform = makePlatform(previous.y - gap, x, spring, fragile);
    platform.routeIndex = (previous.routeIndex || 0) + 1;
    if (moving) {
        platform.motion = { baseX: x, amplitude, phase: Math.random() * Math.PI * 2 };
        platform.x = x + Math.sin(platform.motion.phase) * amplitude;
    }
    if (Math.random() < 0.26) platform.item = { kind: Math.random() < 0.25 ? "diamond" : "pinecone",
        x: platform.x + platform.width / 2, y: platform.y - (spring ? 38 : 18), radius: 10, collected: false };
    if (platform.item && routeScore >= 40) {
        const roll = Math.random();
        const kind = roll < 0.62 ? platform.item.kind : roll < 0.80 ? "shield" :
            roll < 0.88 ? "dash" : roll < 0.92 ? "spring-boots" : roll < 0.95 ? "glide" : roll < 0.98 ? "magnet" : "feather";
        const threshold = { shield: 40, dash: 60, "spring-boots": 120, glide: 180, magnet: 200, feather: 250 };
        if (FEATURES[kind] && routeScore >= threshold[kind] &&
            (!["dash", "spring-boots", "feather"].includes(kind) || (!spring && !springGap && !previous.spring))) platform.item.kind = kind;
    }
    if (FEATURES.satiety && altitude() >= 8000 && platform.routeIndex % 3 === 0) placeFood(platform);
    if (hardMode && routeScore >= 300 && !spring && !springGap && Math.random() < 0.12) {
        platform.wind = Math.random() < 0.5 ? -60 : 60;
    }
    // Extra boards offer choices; the main route remains clear at every motion phase.
    platform.extras = [];
    const candidates = [];
    for (let extraX = 0; extraX <= width - boardWidth; extraX += 15) {
        if (Math.abs(extraX - x) >= 90 + amplitude) candidates.push(extraX);
    }
    const count = Math.floor(Math.random() * 2);
    for (let i = 0; i < count && candidates.length; i++) {
        const extraX = candidates[Math.floor(Math.random() * candidates.length)];
        const extra = makePlatform(platform.y, extraX);
        const center = extraX + extra.width / 2;
        const left = Math.min(sourceX - (previous.motion?.amplitude || 0), x - amplitude) - 35;
        const right = Math.max(sourceX + (previous.motion?.amplitude || 0), x + amplitude) + 95;
        // Also reserve room for the next outgoing jump from this safe board.
        const outsideExit = Math.abs(center - (x + boardWidth / 2)) > 145 + amplitude;
        const normalBombs = platforms?.reduce((count, board) => count + Number(board.hazard?.kind === "bomb"), 0) || 0;
        const bombLimit = altitude() >= 2000 ? 1 : 4;
        if ((routeScore >= 180 || (FEATURES.pressure && altitude() >= 1000)) &&
            (center < left || center > right) && outsideExit && normalBombs < bombLimit && Math.random() < ordinaryBombChance()) {
            extra.hazard = { x: center, y: extra.y - 19, radius: 15, kind: "bomb" };
        }
        if (hardMode && !bombWave && routeScore >= 300 && !extra.hazard) {
            if (Math.random() < 0.3) extra.mossy = true;
            else if (Math.random() < 0.2 && (center < left || center > right) && outsideExit)
                extra.hazard = { x: center, y: extra.y - 19, radius: 15, kind: "hive", triggered: false };
        }
        if (FEATURES.blinking && altitude() >= 3000 && !extra.hazard && !extra.mossy && Math.random() < 0.25) {
            extra.blinkPhase = platform.routeIndex % 3 * (4 / 3);
        }
        platform.extras.push(extra);
        for (let j = candidates.length - 1; j >= 0; j--) {
            if (Math.abs(candidates[j] - extraX) < 90) candidates.splice(j, 1);
        }
    }
    if (previous.item) {
        const item = previous.item;
        const itemRange = previous.motion?.amplitude || 0;
        const itemX = (previous.motion?.baseX ?? previous.x) + previous.width / 2;
        for (const board of [...platform.extras, platform]) {
            const boardRange = board.motion?.amplitude || 0;
            const boardX = board.motion?.baseX ?? board.x;
            if (item.y + 14 > board.y && item.y - 14 < board.y + board.height &&
                itemX + itemRange + 14 > boardX - boardRange &&
                itemX - itemRange - 14 < boardX + boardRange + board.width) {
                delete previous.item;
                if (previous.foodGuaranteed && FEATURES.satiety) placeFood(platform);
                break;
            }
        }
    }
    return platform;
}

function restart() {
    if (uploadConfirm.open) uploadConfirm.close();
    completedRun = undefined;
    uploaded = false;
    if (result.open) result.close();
    for (const id of ["left", "right"]) document.getElementById(id).classList.remove("pressed");
    player = { x: 157, y: 458 - startHeight * 10, width: 46, height: 46, vy: jumpSpeed, facing: 1, jumpTime: 0 };
    Object.assign(player, { dashCharges: 0, dashRemaining: 0, dashCooldown: 0, dashBombs: 0,
        shield: false, invulnerable: 0, glideRemaining: 0, magnetRemaining: 0, featherCharges: 0,
        featherUsed: false, bootsCharges: 0, bootsArmed: false, slowRemaining: 0 });
    gameTime = 0;
    combo = 0;
    collectionChain = null;
    bombWaves = [];
    bombWave = null;
    nextWaveAt = null;
    satiety = null;
    deathReason = "";
    bonusScore = 0;
    highest = player.y;
    platforms = [makePlatform(526 - startHeight * 10, 150, false)];
    platforms[0].campStart = startHeight > 0;
    for (let i = 1; i < 10; i++) {
        const next = nextPlatform(platforms[platforms.length - 1]);
        platforms.push(...next.extras, next);
    }
    fragments = [];
    pickupEffects = [];
    camera = -startHeight * 10;
    gameOver = false;
    keys.clear();
    pointers.clear();
    accumulator = 0;
    lastTime = undefined;
}

function touchesCircle(circle) {
    const nearestX = Math.max(player.x + 6, Math.min(circle.x, player.x + player.width - 6));
    const nearestY = Math.max(player.y + 6, Math.min(circle.y, player.y + player.height - 6));
    return (nearestX - circle.x) ** 2 + (nearestY - circle.y) ** 2 < circle.radius ** 2;
}

function movingSpeed() {
    return 12 + Math.min(1, Math.max(0, (altitude() - 2000) / 2000)) * 24;
}

function useSkill(kind) {
    if (!assetsReady || gameOver || result.open || profile.open || document.hidden) return;
    if (kind === "dash" && player.dashCharges > 0 && player.dashCooldown <= 0 && player.dashRemaining <= 0) {
        player.dashCharges--;
        player.dashRemaining = 0.30;
        player.dashCooldown = 0.5;
        player.dashBombs = 0;
    } else if (kind === "feather" && player.featherCharges > 0 && !player.featherUsed) {
        player.featherCharges--;
        player.featherUsed = true;
        player.vy = jumpSpeed;
        player.jumpTime = 0;
    } else if (kind === "spring-boots" && player.bootsCharges > 0 && !player.bootsArmed) {
        player.bootsCharges--;
        player.bootsArmed = true;
    }
}

function award(points, x, y) {
    bonusScore += points;
    pickupEffects.push({ x, y, points, life: 0.7 });
}

function collectItem(item) {
    item.collected = true;
    const kind = item.kind;
    if (kind === "pinecone" || kind === "diamond") {
        if (satiety !== null) satiety = Math.min(15, satiety + (kind === "diamond" ? 8 : 4));
        const multiplier = FEATURES.chains ? Math.min(2, 1 + Math.floor(combo / 5) * 0.1) : 1;
        award(Math.round((kind === "diamond" ? 30 : 10) * multiplier * heightMultiplier()), item.x, item.y);
        if (FEATURES.chains) {
            if (!collectionChain || gameTime - collectionChain.started > 4)
                collectionChain = { started: gameTime, kinds: new Set() };
            collectionChain.kinds.add(kind);
            if (collectionChain.kinds.size === 2) {
                award(20, item.x, item.y - 18);
                collectionChain = null;
            }
            if (item.x < 35 || item.x > width - 35) award(5, item.x, item.y - 32);
        }
    } else {
        if (kind === "shield") player.shield = true;
        if (kind === "dash") player.dashCharges = Math.min(2, (player.dashCharges || 0) + 1);
        if (kind === "feather") player.featherCharges = Math.min(2, (player.featherCharges || 0) + 1);
        if (kind === "spring-boots") player.bootsCharges = Math.min(2, (player.bootsCharges || 0) + 1);
        if (kind === "glide") player.glideRemaining = 2.5;
        if (kind === "magnet") player.magnetRemaining = 6;
        award(5, item.x, item.y);
        pickupEffects[pickupEffects.length - 1].label = itemNames[kind];
    }
}

function absorbHit(falling = false) {
    if (player.invulnerable > 0 && !falling) return true;
    if (!player.shield) return false;
    player.shield = false;
    player.invulnerable = 1;
    combo = 0;
    if (falling) {
        // Reconnect below a surviving main-route board, within an ordinary jump's reach.
        const extras = new Set(platforms.flatMap(platform => platform.extras || []));
        let target;
        for (const platform of platforms) {
            if (extras.has(platform) || platform.hazard || platform.y > camera + height - 100) continue;
            if (!target || platform.y > target.y) target = platform;
        }
        target.broken = false;
        target.fragile = altitude() >= 5000;
        const y = target.y + 50;
        const x = target.x;
        platforms.unshift(makePlatform(y, x));
        player.x = x + platforms[0].width / 2 - player.width / 2;
        player.y = y - player.height;
        player.vy = jumpSpeed;
        player.jumpTime = 0;
        player.featherUsed = false;
        player.dashRemaining = 0;
    }
    return true;
}

function updatePressure(dt) {
    if (FEATURES.satiety && altitude() >= 8000) {
        satiety = satiety === null ? 15 : Math.max(0, satiety - dt);
        // Upgrade boards already generated before the threshold; never regenerate eaten snacks.
        let pendingFood = false;
        for (const platform of platforms) {
            if (!platform.extras || platform.foodChecked || platform.broken) continue;
            platform.foodChecked = true;
            if (platform.routeIndex % 3 === 0) pendingFood = true;
            if (!pendingFood || platform.item?.collected) continue;
            const itemY = platform.y - (platform.spring ? 38 : 18);
            const itemX = (platform.motion?.baseX ?? platform.x) + platform.width / 2;
            const itemRange = platform.motion?.amplitude || 0;
            const overlaps = platforms.some(upper => upper.y < platform.y &&
                itemY + 14 > upper.y && itemY - 14 < upper.y + upper.height &&
                itemX + itemRange + 14 > (upper.motion?.baseX ?? upper.x) - (upper.motion?.amplitude || 0) &&
                itemX - itemRange - 14 < (upper.motion?.baseX ?? upper.x) + (upper.motion?.amplitude || 0) + upper.width);
            if (!overlaps) { placeFood(platform); pendingFood = false; }
        }
    }
    if (!FEATURES.waves || altitude() < 2000) return;
    if (nextWaveAt === null) nextWaveAt = Math.max(gameTime, startHeight > 0 ? 3 : 0) + 5;
    bombWaves = bombWaves.filter(wave => wave.y - camera <= height + 30);
    bombWave = bombWaves[bombWaves.length - 1] || null;
    if (gameTime < nextWaveAt) return;
    nextWaveAt = gameTime + 5;
    const target = platforms[platforms.length - 1];
    const center = (target.motion?.baseX ?? target.x) + target.width / 2;
    const y = target.y - (target.spring ? 20 : 0) + 24;
    // Four missing 24px bomb slots leave about two 46px player widths.
    const gapWidth = 96;
    const gapLeft = Math.max(0, Math.min(width - gapWidth, Math.round((center - gapWidth / 2) / 24) * 24));
    const bombs = [];
    for (let x = 12; x < width; x += 24) {
        if (x > gapLeft && x < gapLeft + gapWidth) continue;
        bombs.push({ x, y, radius: 12, destroyed: false });
    }
    bombWave = { y, gapLeft, gapWidth, bombs, warningUntil: gameTime + 1.2 };
    bombWaves.push(bombWave);
    // One wave replaces ordinary dangers, rather than adding another layer of density.
    for (const platform of platforms) delete platform.hazard;
}

function step(dt) {
    if (gameOver || result.open || profile.open || document.hidden) return;
    gameTime += dt;
    updatePressure(dt);
    let dashing = player.dashRemaining > 1e-9;
    for (const field of effectTimers)
        player[field] = Math.max(0, (player[field] || 0) - dt);
    pickupEffects = pickupEffects.filter(effect => effect.life > 0);
    for (const effect of pickupEffects) { effect.life -= dt; effect.y -= 24 * dt; }
    for (const platform of platforms) {
        if (altitude() >= 5000) platform.fragile = true;
        if (altitude() >= 6000 && platform.width === 60) {
            platform.width = 30; platform.x += 15;
            if (platform.motion) platform.motion.baseX += 15;
        }
        if (platform.campStart && gameTime < 3) platform.fragile = false;
        if (platform.motion && altitude() >= 2000) {
            const motion = platform.motion;
            motion.phase += movingSpeed() / motion.amplitude * dt;
            platform.x = motion.baseX + Math.sin(motion.phase) * motion.amplitude;
            if (platform.item && !platform.item.attracted) platform.item.x = platform.x + platform.width / 2;
        }
    }
    fragments = fragments.filter(piece => piece.life > 0);
    for (const piece of fragments) {
        piece.life -= dt;
        piece.vy += gravity * dt;
        piece.x += piece.vx * dt;
        piece.y += piece.vy * dt;
    }
    const left = keys.has("ArrowLeft") || keys.has("KeyA") || [...pointers.values()].includes(-1);
    const right = keys.has("ArrowRight") || keys.has("KeyD") || [...pointers.values()].includes(1);
    const direction = Number(right) - Number(left);
    const moveSpeed = player.slowRemaining > 0 ? 120 : player.glideRemaining > 0 ? 300 : 240;
    player.x += direction * moveSpeed * dt;
    if (direction) player.facing = direction;
    player.jumpTime = (player.jumpTime || 0) + dt;
    if (player.x > width) player.x = -player.width;
    if (player.x + player.width < 0) player.x = width;

    const previousBottom = player.y + player.height;
    if (dashing) player.vy = -780;
    else player.vy += gravity * dt;
    if (player.glideRemaining > 0) player.vy = Math.min(player.vy, 220);
    if (hardMode && !dashing) {
        for (const platform of platforms) {
            if (platform.wind && Math.abs(player.y + player.height - platform.y) < 90 &&
                player.x + player.width > platform.x && player.x < platform.x + platform.width) {
                player.vy += platform.wind * dt;
                break;
            }
        }
    }
    player.y += player.vy * dt;
    if (player.vy >= 0) {
        for (const platform of platforms) {
            if (platform.broken || platformPhase(platform) >= 3) continue;
            const overlaps = player.x + player.width > platform.x &&
                player.x < platform.x + platform.width;
            const hitsSpring = platform.spring && player.x + player.width > platform.x + platform.width / 2 - 13 &&
                player.x < platform.x + platform.width / 2 + 13;
            const bottom = player.y + player.height;
            const crossesSpring = hitsSpring && previousBottom <= platform.y - 20 &&
                bottom >= platform.y - 20;
            const crossesPlatform = overlaps && previousBottom <= platform.y && bottom >= platform.y;
            if (crossesSpring || crossesPlatform) {
                player.y = (crossesSpring ? platform.y - 20 : platform.y) - player.height;
                player.vy = hitsSpring || player.bootsArmed ? springSpeed : jumpSpeed;
                player.bootsArmed = false;
                player.featherUsed = false;
                if (hitsSpring) { player.dashRemaining = 0; dashing = false; }
                if (platform.mossy) player.slowRemaining = 0.4;
                if (platform.fragile) combo = 0;
                else if (!platform.comboVisited) combo++;
                platform.comboVisited = true;
                player.jumpTime = 0;
                if (platform.fragile) {
                    platform.broken = true;
                    for (const side of [-1, 1]) {
                        fragments.push({ x: platform.x + (side === 1 ? platform.width / 2 : 0), y: platform.y,
                            vx: side * 55, vy: -50, life: 0.4, width: platform.width / 2, sourceX: side === 1 ? 120 : 0 });
                    }
                }
                if (hitsSpring) platform.compressedUntil = performance.now() + 160;
                break;
            }
        }
    }

    for (const platform of platforms) {
        const hazard = platform.hazard;
        if (hazard?.kind === "hive" && !hazard.triggered && Math.abs(player.y - hazard.y) < 160) {
            hazard.triggered = true;
            hazard.releaseAt = gameTime + 2;
        }
        if (hazard?.kind === "hive" && hazard.triggered && gameTime >= hazard.releaseAt) {
            hazard.kind = "bug";
            hazard.direction = hazard.x < player.x + player.width / 2 ? 1 : -1;
        }
        if (hazard?.kind === "bug") {
            hazard.x += hazard.direction * 70 * dt;
            if (hazard.x < -20 || hazard.x > width + 20) { delete platform.hazard; continue; }
        }
        if (hazard && touchesCircle(hazard)) {
            if (dashing && player.dashBombs < 1) {
                delete platform.hazard;
                player.dashBombs++;
                award(15, hazard.x, hazard.y);
            } else if (absorbHit()) delete platform.hazard;
            else { finish(); return; }
        }
        const item = platform.item;
        if (item && !item.collected && player.magnetRemaining > 0) {
            const dx = player.x + player.width / 2 - item.x, dy = player.y + player.height / 2 - item.y;
            if (dx * dx + dy * dy < 90 * 90) {
                item.attracted = true;
                const fraction = Math.min(1, dt * 9);
                item.x += dx * fraction;
                item.y += dy * fraction;
            }
        }
        if (item && !item.collected && touchesCircle(item)) {
            collectItem(item);
        }
    }
    for (const wave of bombWaves) {
        if (gameTime < wave.warningUntil) continue;
        for (const bomb of wave.bombs) {
            if (bomb.destroyed || !touchesCircle(bomb)) continue;
            if (dashing && player.dashBombs < 1) {
                bomb.destroyed = true;
                player.dashBombs++;
                award(15, bomb.x, bomb.y);
            } else if (absorbHit()) bomb.destroyed = true;
            else { finish(); return; }
        }
    }
    highest = Math.min(highest, player.y);
    if (bestHeight < 5000 && altitude() >= 5000) {
        bestHeight = altitude();
        try { localStorage.setItem("forest-hop-height", String(bestHeight)); } catch {}
    }
    if (altitude() >= 5000) for (const platform of platforms) platform.fragile = true;
    // World coordinates stay fixed; only the camera follows new heights.
    camera = Math.min(camera, player.y - height * 0.4);
    platforms = platforms.filter(platform => platform.y - camera < height + 30);
    while (platforms[platforms.length - 1].y > camera - 80) {
        const previous = platforms[platforms.length - 1];
        const next = nextPlatform(previous);
        platforms.push(...next.extras, next);
    }
    if (satiety === 0) { finish("饱食度耗尽"); return; }
    if (player.y - camera > height && !absorbHit(true)) finish();
}

function characterFrame() {
    if (gameOver) return Math.floor(performance.now() / 800) % 2 ? 7 : 0;
    if (player.jumpTime < 0.045) return 6;
    if (player.jumpTime < 0.085) return 1;
    if (player.jumpTime < 0.14) return 2;
    if (player.vy < -120) return 3;
    if (player.vy > 120) return 5;
    return 4;
}

function drawCharacter() {
    if (!squirrelImage.complete || !squirrelImage.naturalWidth) return;
    const [x, y, frameWidth, frameHeight] = squirrelFrames[characterFrame()];
    const scale = player.height / 345;
    context.save();
    context.translate(player.x + player.width / 2, player.y - camera + player.height);
    context.scale(player.facing < 0 ? -1 : 1, 1);
    context.drawImage(squirrelImage, x, y, frameWidth, frameHeight,
        -frameWidth * scale / 2, -frameHeight * scale, frameWidth * scale, frameHeight * scale);
    context.restore();
}

function draw() {
    context.clearRect(0, 0, width, height);
    if (backgroundImage.complete && backgroundImage.naturalWidth) {
        // Slow parallax over a quiet background; reflect at the edges without a repeat seam.
        const travel = Math.max(0, -camera) * 0.008 % (height * 0.4);
        const offset = travel <= height * 0.2 ? travel : height * 0.4 - travel;
        context.drawImage(backgroundImage, 0, -offset, width, height * 1.2);
    }
    for (const platform of platforms) {
        const opacity = platformOpacity(platform);
        if (opacity === 0) continue;
        context.globalAlpha = opacity;
        const y = platform.y - camera;
        const image = platform.fragile ? brokenImage : platformImage;
        if (image.complete && image.naturalWidth) {
            context.drawImage(image, platform.x, y, platform.width, platform.height);
        }
        if (platform.motion) {
            context.strokeStyle = "#80d4d0";
            context.lineWidth = 2;
            context.beginPath();
            context.moveTo(platform.x + platform.width * .2, y + 13);
            context.lineTo(platform.x + platform.width * .8, y + 13);
            context.stroke();
        }
        if (platform.mossy) {
            context.fillStyle = "#538346";
            context.fillRect(platform.x + 3, y, platform.width - 6, 4);
        }
        if (platform.wind) {
            context.fillStyle = "#487e9980";
            context.font = "bold 20px sans-serif";
            context.fillText(platform.wind < 0 ? "↑" : "↓", platform.x + 25, y - 35);
        }
        if (platform.spring && springImage.complete && springImage.naturalWidth) {
            const springHeight = performance.now() < platform.compressedUntil ? 12 : 20;
            context.drawImage(springImage, platform.x + platform.width / 2 - 11, y + 3 - springHeight, 22, springHeight);
        }
    }
    context.globalAlpha = 1;
    if (brokenImage.complete && brokenImage.naturalWidth) {
        for (const piece of fragments) {
            context.globalAlpha = Math.max(0, piece.life / 0.4);
            context.drawImage(brokenImage, piece.sourceX, 0, 120, 72,
                piece.x, piece.y - camera, piece.width, 18);
        }
        context.globalAlpha = 1;
    }
    // Items and hazards sit in front of every board, spring and falling fragment.
    for (const platform of platforms) {
        if (platform.hazard) {
            const hazard = platform.hazard;
            const y = hazard.y - camera;
            if (hazard.kind === "bomb") context.drawImage(bombImage, hazard.x - 19, y - 19, 38, 38);
            else {
                context.fillStyle = hazard.kind === "bug" ? "#d78f29" : "#936329";
                context.beginPath();
                context.ellipse(hazard.x, y, 15, hazard.kind === "bug" ? 8 : 18, 0, 0, Math.PI * 2);
                context.fill();
                context.fillStyle = "#51351e";
                context.font = "bold 14px sans-serif";
                context.fillText(hazard.kind === "bug" ? "≋" : "蜂", hazard.x - 7, y + 5);
            }
        }
        if (platform.item && !platform.item.collected) {
            const item = platform.item;
            context.drawImage(skillImages[item.kind] || (item.kind === "diamond" ? diamondImage : pineconeImage),
                item.x - 14, item.y - camera - 14, 28, 28);
        }
    }
    for (const wave of bombWaves) {
        const y = wave.y - camera;
        for (const bomb of wave.bombs) {
            if (!bomb.destroyed) context.drawImage(bombImage, bomb.x - 12, y - 12, 24, 24);
        }
    }
    if (player.dashRemaining > 0) {
        const originalY = player.y;
        for (let i = 3; i > 0; i--) {
            player.y = originalY + i * 12;
            context.globalAlpha = (4 - i) * 0.12;
            drawCharacter();
        }
        player.y = originalY;
        context.globalAlpha = 1;
    }
    drawCharacter();
    if (player.invulnerable > 0 && !player.shield) {
        context.fillStyle = "#fff7df";
        context.globalAlpha = 0.15 + 0.15 * Math.sin(gameTime * 30);
        context.beginPath();
        context.arc(player.x + 23, player.y - camera + 23, 25, 0, Math.PI * 2);
        context.fill();
        context.globalAlpha = 1;
    }
    if (player.shield) {
        context.strokeStyle = "#e8ae41";
        context.lineWidth = 3;
        context.beginPath();
        context.arc(player.x + 23, player.y - camera + 23, 28, 0, Math.PI * 2);
        context.stroke();
    }
    if (player.glideRemaining > 0) context.drawImage(skillImages.glide, player.x + 5, player.y - camera - 24, 36, 28);
    for (const effect of pickupEffects) {
        context.globalAlpha = Math.max(0, effect.life / 0.7);
        context.fillStyle = "#244834";
        context.font = "bold 15px sans-serif";
        context.fillText((effect.label ? effect.label + " " : "") + "+" + effect.points, effect.x - 10, effect.y - camera);
    }
    context.globalAlpha = 1;
    currentScore.textContent = score();
    document.getElementById("current-height").textContent = altitude() + " m";
    bestScore.textContent = Math.max(score(), records[0]?.score || 0);
    const satietyStatus = document.getElementById("satiety-status");
    satietyStatus.hidden = satiety === null;
    satietyStatus.classList.toggle("low", satiety !== null && satiety <= 4);
    document.getElementById("satiety-meter").value = satiety ?? 15;
    document.getElementById("satiety-time").textContent = satiety === null ? "" : Math.ceil(satiety) + "s";
    for (const [kind, charges] of [["dash", player.dashCharges], ["feather", player.featherCharges], ["spring-boots", player.bootsCharges]]) {
        const button = document.getElementById("skill-" + kind);
        button.hidden = !charges && !(kind === "spring-boots" && player.bootsArmed) && !(kind === "dash" && player.dashRemaining > 0);
        button.disabled = gameOver || !charges || (kind === "dash" && player.dashCooldown > 0) ||
            (kind === "feather" && player.featherUsed) || (kind === "spring-boots" && player.bootsArmed);
        button.querySelector("span").textContent = kind === "spring-boots" && player.bootsArmed ? "✓" : String(charges || 0);
    }
}

function frame(time) {
    const elapsed = lastTime === undefined ? 0 : Math.min((time - lastTime) / 1000, 0.05);
    lastTime = time;
    accumulator += elapsed;
    // Small fixed steps keep collisions reliable, including spring jumps.
    while (accumulator >= 1 / 120) {
        step(1 / 120);
        accumulator -= 1 / 120;
    }
    draw();
    requestAnimationFrame(frame);
}

const playfield = document.getElementById("playfield");
function steer(event) {
    const bounds = board.getBoundingClientRect();
    const direction = event.clientX < bounds.left + bounds.width / 2 ? -1 : 1;
    pointers.set(event.pointerId, direction);
    document.getElementById("left").classList.toggle("pressed", direction === -1);
    document.getElementById("right").classList.toggle("pressed", direction === 1);
}
playfield.addEventListener("pointerdown", event => {
    if (!assetsReady || gameOver || result.open || profile.open || event.target.closest(".hud, .skill-controls, .item-button, #ranking, dialog")) return;
    event.preventDefault();
    playfield.setPointerCapture(event.pointerId);
    steer(event);
});
playfield.addEventListener("pointermove", event => {
    if (pointers.has(event.pointerId)) steer(event);
});
function release(event) {
    pointers.delete(event.pointerId);
    for (const [id, direction] of [["left", -1], ["right", 1]]) {
        document.getElementById(id).classList.toggle("pressed", [...pointers.values()].includes(direction));
    }
}
for (const type of ["pointerup", "pointercancel", "lostpointercapture"]) {
    playfield.addEventListener(type, release);
}
for (const kind of ["dash", "feather", "spring-boots"]) {
    document.getElementById("skill-" + kind).addEventListener("pointerdown", event => {
        event.preventDefault();
        event.stopPropagation();
        useSkill(kind);
    });
    document.getElementById("skill-" + kind).addEventListener("click", event => {
        if (event.detail === 0) useSkill(kind);
    });
}
document.getElementById("start-height").addEventListener("change", event => {
    startHeight = bestHeight >= 5000 && event.target.value === "2000" ? 2000 : 0;
    try { localStorage.setItem("forest-hop-start", String(startHeight)); } catch {}
    restart();
});

document.getElementById("hard-mode").addEventListener("change", event => {
    hardMode = event.target.checked;
    restart();
});

document.addEventListener("keydown", event => {
    if (!assetsReady || profile.open || event.target.matches("input, textarea")) return;
    if (event.code === "Space" && event.target.matches("button")) return;
    if (["ArrowLeft", "ArrowRight", "KeyA", "KeyD", "Space", "ArrowUp", "KeyK", "KeyF", "KeyB"].includes(event.code)) {
        event.preventDefault();
        if (event.code === "Space" && gameOver) { restart(); return; }
        if (result.open) return;
        if (["Space", "ArrowUp", "KeyK", "KeyF", "KeyB"].includes(event.code)) {
            if (!event.repeat) useSkill(event.code === "KeyF" ? "feather" : event.code === "KeyB" ? "spring-boots" : "dash");
            return;
        }
        keys.add(event.code);
        if (event.code === "Space" && gameOver) restart();
    }
});
document.addEventListener("keyup", event => keys.delete(event.code));
window.addEventListener("blur", clearControls);
document.addEventListener("visibilitychange", clearControls);

function showProfile() {
    clearControls();
    document.getElementById("nickname").value = hasNickname ? nickname : "";
    document.getElementById("nickname").disabled = hasNickname;
    document.getElementById("save-nickname").hidden = hasNickname;
    document.getElementById("close-profile").hidden = !hasNickname;
    document.getElementById("camp-option").disabled = bestHeight < 5000;
    document.getElementById("start-height").value = String(startHeight);
    document.getElementById("camp-option").textContent = bestHeight >= 5000 ? "2000 m 营地" : "2000 m 营地（最高达到 5000 m 解锁）";
    document.getElementById("profile-best-score").textContent = records[0]?.score || 0;
    document.getElementById("profile-best-height").textContent = Math.max(bestHeight, altitude()) + " m";
    document.getElementById("profile-message").textContent = hasNickname ? "昵称已锁定" : "名称确认后无法修改，请慎重填写";
    profile.showModal();
}
document.getElementById("profile-button").addEventListener("click", showProfile);
profile.addEventListener("cancel", event => { if (!hasNickname) event.preventDefault(); });
document.getElementById("close-profile").addEventListener("click", () => profile.close());
document.getElementById("profile-form").addEventListener("submit", event => {
    event.preventDefault();
    if (hasNickname) return;
    const input = document.getElementById("nickname");
    const name = input.value.trim();
    if (!name) { input.setCustomValidity("请输入昵称，不能只填空格"); input.reportValidity(); return; }
    nickname = name;
    const firstName = !hasNickname;
    hasNickname = true;
    document.getElementById("close-profile").hidden = false;
    document.getElementById("player-name").textContent = nickname;
    try {
        localStorage.setItem("forest-hop-name", nickname);
        document.getElementById("profile-message").textContent = "昵称已保存";
    } catch { document.getElementById("profile-message").textContent = "昵称已更新，当前浏览器无法保存，下次打开会恢复默认"; }
    if (firstName) profile.close();
});
document.getElementById("nickname").addEventListener("input", event => event.target.setCustomValidity(""));
profile.addEventListener("close", clearControls);
const itemHelp = document.getElementById("item-help");
document.getElementById("open-item-help").addEventListener("click", () => itemHelp.showModal());
document.getElementById("close-item-help").addEventListener("click", () => itemHelp.close());
itemHelp.addEventListener("close", clearControls);
document.getElementById("ranking").addEventListener("click", () => showResult(false));
document.getElementById("local-ranking").addEventListener("click", showLocalRanking);
document.getElementById("online-ranking").addEventListener("click", showOnlineRanking);
document.getElementById("submit-score").addEventListener("click", showUploadConfirm);
document.getElementById("confirm-upload").addEventListener("click", uploadScore);
document.getElementById("cancel-upload").addEventListener("click", () => uploadConfirm.close());
uploadConfirm.addEventListener("cancel", event => { if (uploading) event.preventDefault(); });
document.getElementById("play-again").addEventListener("click", restart);
document.getElementById("close-result").addEventListener("click", () => result.close());
result.addEventListener("close", clearControls);
async function loadAssets() {
    const loading = document.getElementById("loading");
    const status = document.getElementById("loading-status");
    const retry = document.getElementById("retry-loading");
    retry.hidden = true;
    let loaded = 0;
    status.textContent = "正在进入游戏 · 0%";
    try {
        await Promise.all(assets.map(async ([image, file]) => {
            image.src = "./assets/images/" + file;
            await image.decode();
            status.textContent = "正在进入游戏 · " + Math.round(++loaded / assets.length * 100) + "%";
        }));
        resizeCanvas();
        assetsReady = true;
        restart();
        loading.hidden = true;
        if (!hasNickname) showProfile();
        requestAnimationFrame(frame);
    } catch {
        status.textContent = "图片加载失败，请检查网络后重试";
        retry.hidden = false;
    }
}
window.addEventListener("resize", () => { if (assetsReady) resizeCanvas(); });
document.getElementById("retry-loading").addEventListener("click", loadAssets);
loadAssets();
