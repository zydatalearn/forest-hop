// Physics use seconds so movement is consistent across refresh rates.
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
const assets = [
    [squirrelImage, "squirrel-jump-sheet.webp"], [platformImage, "platform-wood.webp"],
    [springImage, "spring.webp"], [brokenImage, "platform-broken-wood.webp"],
    [backgroundImage, "forest-warm.webp"], [diamondImage, "diamond.webp"],
    [pineconeImage, "pinecone.webp"], [bombImage, "bomb.webp"]
];

const gravity = 1440, jumpSpeed = -480, springSpeed = -900;
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

function score() {
    return Math.max(0, Math.floor((458 - highest) / 10)) + bonusScore;
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
    rankingRequest++;
    document.getElementById("ranking-title").textContent = "本机排行榜 · 前 3 名";
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
    const request = ++rankingRequest;
    document.getElementById("ranking-title").textContent = "联机排行榜 · 同名最高分";
    document.getElementById("rank-list").replaceChildren();
    document.getElementById("ranking-self").textContent = "";
    const status = document.getElementById("ranking-status");
    status.textContent = "正在读取…";
    try {
        const data = await requestScores();
        if (request !== rankingRequest) return;
        renderRanking(data.records);
        status.textContent = "同名玩家取最高分 · 前 10 名";
        document.getElementById("ranking-self").textContent = data.self ?
            "我的名次：第 " + data.self.rank + " 名 · 最高分 " + data.self.score : "我的名次：尚未上传成绩";
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
    uploading = true;
    document.getElementById("confirm-upload").disabled = true;
    document.getElementById("cancel-upload").disabled = true;
    const status = document.getElementById("upload-status");
    status.textContent = "正在上传…";
    try {
        await requestScores({ method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify(completedRun) });
        uploaded = true;
        document.getElementById("submit-score").hidden = true;
        uploadConfirm.close();
        showOnlineRanking();
    } catch (error) {
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
    document.getElementById("result-title").textContent = ended ? "游戏结束" : "森林排行榜";
    document.getElementById("result-summary").innerHTML =
        "本次分数<br><strong>" + score() + "</strong><br>最高纪录 " + (records[0]?.score || 0);
    showLocalRanking();
    document.getElementById("close-result").textContent = ended ? "查看场景" : "继续游戏";
    document.getElementById("play-again").hidden = !gameOver;
    document.getElementById("submit-score").hidden = !gameOver || uploaded;
    if (!result.open) result.showModal();
}

function finish() {
    gameOver = true;
    completedRun = Object.freeze({ name: nickname, score: score() });
    records.push(completedRun);
    records.sort((a, b) => b.score - a.score);
    records = records.slice(0, 3);
    try { localStorage.setItem("forest-hop-scores", JSON.stringify(records)); } catch {}
    showResult(true);
    showUploadConfirm();
}

function makePlatform(y, x, spring = false, fragile = false) {
    return { x, y, width: 60, height: 18, spring, fragile, broken: false, compressedUntil: 0, requiredSpring: false };
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
    const moving = score() >= 2000 && !previous.motion && !previous.spring &&
        !spring && !springGap && Math.random() < 0.3;
    const amplitude = moving ? 18 : 0;
    const sourceX = previous.motion ? previous.motion.baseX : previous.x;
    // Reserve the full motion range at both ends, so every phase still has a reachable jump.
    const maxShift = Math.max(0, Math.min(65 + difficulty * 35, landingTime * 240 * 0.55) -
        amplitude - (previous.motion?.amplitude || 0));
    const x = Math.max(amplitude, Math.min(width - 60 - amplitude, sourceX + (Math.random() * 2 - 1) * maxShift));
    if (springGap) {
        previous.requiredSpring = true;
        previous.fragile = false;
    }
    const fragile = !moving && !spring && !springGap && !previous.spring && !previous.fragile &&
        Math.random() < 0.12 + difficulty * 0.18;
    const platform = makePlatform(previous.y - gap, x, spring, fragile);
    if (moving) {
        platform.motion = { baseX: x, amplitude, phase: Math.random() * Math.PI * 2 };
        platform.x = x + Math.sin(platform.motion.phase) * amplitude;
    }
    if (Math.random() < 0.26) platform.item = { kind: Math.random() < 0.25 ? "diamond" : "pinecone",
        x: platform.x + 30, y: platform.y - 42, radius: 10, collected: false };
    // Extra boards offer choices; the main route remains clear at every motion phase.
    platform.extras = [];
    const candidates = [];
    for (let extraX = 0; extraX <= width - 60; extraX += 15) {
        if (Math.abs(extraX - x) >= 90 + amplitude) candidates.push(extraX);
    }
    const count = Math.floor(Math.random() * 3);
    for (let i = 0; i < count && candidates.length; i++) {
        const extraX = candidates[Math.floor(Math.random() * candidates.length)];
        const extra = makePlatform(platform.y, extraX);
        const center = extraX + 30;
        const left = Math.min(sourceX - (previous.motion?.amplitude || 0), x - amplitude) - 35;
        const right = Math.max(sourceX + (previous.motion?.amplitude || 0), x + amplitude) + 95;
        // Also reserve room for the next outgoing jump from this safe board.
        const outsideExit = Math.abs(center - (x + 30)) > 145 + amplitude;
        if (routeScore >= 180 && (center < left || center > right) && outsideExit && Math.random() < 0.6) {
            extra.hazard = { x: center, y: extra.y - 19, radius: 15, kind: "bomb" };
        }
        platform.extras.push(extra);
        for (let j = candidates.length - 1; j >= 0; j--) {
            if (Math.abs(candidates[j] - extraX) < 90) candidates.splice(j, 1);
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
    player = { x: 157, y: 458, width: 46, height: 46, vy: jumpSpeed, facing: 1, jumpTime: 0 };
    bonusScore = 0;
    highest = player.y;
    platforms = [makePlatform(526, 150, false)];
    for (let i = 1; i < 10; i++) {
        const next = nextPlatform(platforms[platforms.length - 1]);
        platforms.push(...next.extras, next);
    }
    fragments = [];
    pickupEffects = [];
    camera = 0;
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
    return 12 + Math.min(1, Math.max(0, (score() - 2000) / 2000)) * 24;
}

function step(dt) {
    if (gameOver || result.open || profile.open || document.hidden) return;
    pickupEffects = pickupEffects.filter(effect => effect.life > 0);
    for (const effect of pickupEffects) { effect.life -= dt; effect.y -= 24 * dt; }
    for (const platform of platforms) {
        if (platform.motion && score() >= 2000) {
            const motion = platform.motion;
            motion.phase += movingSpeed() / motion.amplitude * dt;
            platform.x = motion.baseX + Math.sin(motion.phase) * motion.amplitude;
            if (platform.item) platform.item.x = platform.x + 30;
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
    player.x += direction * 240 * dt;
    if (direction) player.facing = direction;
    player.jumpTime = (player.jumpTime || 0) + dt;
    if (player.x > width) player.x = -player.width;
    if (player.x + player.width < 0) player.x = width;

    const previousBottom = player.y + player.height;
    player.vy += gravity * dt;
    player.y += player.vy * dt;
    if (player.vy >= 0) {
        for (const platform of platforms) {
            if (platform.broken) continue;
            const overlaps = player.x + player.width > platform.x &&
                player.x < platform.x + platform.width;
            const hitsSpring = platform.spring && player.x + player.width > platform.x + 17 &&
                player.x < platform.x + 43;
            const bottom = player.y + player.height;
            const crossesSpring = hitsSpring && previousBottom <= platform.y - 20 &&
                bottom >= platform.y - 20;
            const crossesPlatform = overlaps && previousBottom <= platform.y && bottom >= platform.y;
            if (crossesSpring || crossesPlatform) {
                player.y = (crossesSpring ? platform.y - 20 : platform.y) - player.height;
                player.vy = hitsSpring ? springSpeed : jumpSpeed;
                player.jumpTime = 0;
                if (platform.fragile) {
                    platform.broken = true;
                    for (const side of [-1, 1]) {
                        fragments.push({ x: platform.x + (side === 1 ? 30 : 0), y: platform.y,
                            vx: side * 55, vy: -50, life: 0.4, sourceX: side === 1 ? 120 : 0 });
                    }
                }
                if (hitsSpring) platform.compressedUntil = performance.now() + 160;
                break;
            }
        }
    }

    for (const platform of platforms) {
        const hazard = platform.hazard;
        if (hazard && touchesCircle(hazard)) {
            finish();
            return;
        }
        const item = platform.item;
        if (item && !item.collected && touchesCircle(item)) {
            item.collected = true;
            const points = item.kind === "diamond" ? 30 : 10;
            bonusScore += points;
            pickupEffects.push({ x: item.x, y: item.y, points, life: 0.7 });
        }
    }
    highest = Math.min(highest, player.y);
    // World coordinates stay fixed; only the camera follows new heights.
    camera = Math.min(camera, player.y - height * 0.4);
    platforms = platforms.filter(platform => platform.y - camera < height + 30);
    while (platforms[platforms.length - 1].y > camera - 80) {
        const previous = platforms[platforms.length - 1];
        const next = nextPlatform(previous);
        platforms.push(...next.extras, next);
    }
    if (player.y - camera > height) finish();
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
        if (platform.hazard) {
            const hazard = platform.hazard;
            const y = hazard.y - camera;
            context.drawImage(bombImage, hazard.x - 19, y - 19, 38, 38);
        }
        if (platform.item && !platform.item.collected) {
            const item = platform.item;
            context.drawImage(item.kind === "diamond" ? diamondImage : pineconeImage,
                item.x - 14, item.y - camera - 14, 28, 28);
        }
        if (platform.broken) continue;
        const y = platform.y - camera;
        const image = platform.fragile ? brokenImage : platformImage;
        if (image.complete && image.naturalWidth) {
            context.drawImage(image, platform.x, y, platform.width, platform.height);
        }
        if (platform.motion) {
            context.strokeStyle = "#80d4d0";
            context.lineWidth = 2;
            context.beginPath();
            context.moveTo(platform.x + 12, y + 13);
            context.lineTo(platform.x + 48, y + 13);
            context.stroke();
        }
        if (platform.spring && springImage.complete && springImage.naturalWidth) {
            const springHeight = performance.now() < platform.compressedUntil ? 12 : 20;
            context.drawImage(springImage, platform.x + 19, y + 3 - springHeight, 22, springHeight);
        }
    }
    if (brokenImage.complete && brokenImage.naturalWidth) {
        for (const piece of fragments) {
            context.globalAlpha = Math.max(0, piece.life / 0.4);
            context.drawImage(brokenImage, piece.sourceX, 0, 120, 72,
                piece.x, piece.y - camera, 30, 18);
        }
        context.globalAlpha = 1;
    }
    drawCharacter();
    for (const effect of pickupEffects) {
        context.globalAlpha = Math.max(0, effect.life / 0.7);
        context.fillStyle = "#244834";
        context.font = "bold 15px sans-serif";
        context.fillText("+" + effect.points, effect.x - 10, effect.y - camera);
    }
    context.globalAlpha = 1;
    currentScore.textContent = score();
    bestScore.textContent = Math.max(score(), records[0]?.score || 0);
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
    const bounds = playfield.getBoundingClientRect();
    const direction = event.clientX < bounds.left + bounds.width / 2 ? -1 : 1;
    pointers.set(event.pointerId, direction);
    document.getElementById("left").classList.toggle("pressed", direction === -1);
    document.getElementById("right").classList.toggle("pressed", direction === 1);
}
playfield.addEventListener("pointerdown", event => {
    if (!assetsReady || gameOver || result.open || profile.open || event.target.closest(".hud, #ranking, dialog")) return;
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
document.addEventListener("keydown", event => {
    if (!assetsReady || profile.open || event.target.matches("input, textarea")) return;
    if (["ArrowLeft", "ArrowRight", "KeyA", "KeyD", "Space"].includes(event.code)) {
        event.preventDefault();
        if (event.code === "Space" && gameOver) { restart(); return; }
        if (result.open) return;
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
    document.getElementById("profile-summary").textContent = "最高分 " + (records[0]?.score || 0) + " · 已保存 " + records.length + " 条成绩";
    document.getElementById("profile-message").textContent = hasNickname ? "名称已锁定，无法修改" : "名称确认后无法修改，请慎重填写";
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
    status.textContent = "正在加载图片 · 0 / " + assets.length;
    try {
        await Promise.all(assets.map(async ([image, file]) => {
            image.src = "./assets/images/" + file;
            await image.decode();
            status.textContent = "正在加载图片 · " + (++loaded) + " / " + assets.length;
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
