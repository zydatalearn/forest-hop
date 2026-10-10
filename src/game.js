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
const assets = [
    [squirrelImage, "squirrel-jump-sheet.webp"], [platformImage, "platform-wood.webp"],
    [springImage, "spring.webp"], [brokenImage, "platform-broken-wood.webp"],
    [backgroundImage, "forest-background.webp"]
];

const gravity = 1440, jumpSpeed = -480, springSpeed = -900;
const keys = new Set();
const pointers = new Map();
let player, platforms, camera, highest, gameOver, lastTime;
let accumulator = 0;
let fragments = [];
const result = document.getElementById("result");
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
        .sort((a, b) => b.score - a.score).slice(0, 10);
} catch { /* Storage may be unavailable; keep scores for this session. */ }

function score() {
    return Math.max(0, Math.floor((458 - highest) / 10));
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
    document.getElementById("ranking-title").textContent = "本机排行榜 · 前 10 名";
    document.getElementById("ranking-status").textContent = "";
    renderRanking(records);
}

function showOnlineRanking() {
    document.getElementById("ranking-title").textContent = "联机排行 · 未开放";
    document.getElementById("rank-list").replaceChildren();
    document.getElementById("ranking-status").textContent = "联机排行暂未开放，成绩仅保存在本机";
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
    if (!result.open) result.showModal();
}

function finish() {
    gameOver = true;
    records.push({ name: nickname, score: score() });
    records.sort((a, b) => b.score - a.score);
    records = records.slice(0, 10);
    try { localStorage.setItem("forest-hop-scores", JSON.stringify(records)); } catch {}
    showResult(true);
}

function makePlatform(y, x, spring = false, fragile = false) {
    return { x, y, width: 60, height: 18, spring, fragile, broken: false, compressedUntil: 0, requiredSpring: false };
}

function nextPlatform(previous) {
    // Use route height so difficulty stays consistent even when platforms are generated ahead.
    const routeScore = Math.max(0, (526 - previous.y) / 10);
    const difficulty = Math.min(1, routeScore / 300);
    const springGap = previous.spring && routeScore >= 120;
    const spring = !previous.spring && !springGap && Math.random() < 0.18 + difficulty * 0.08;
    // A spring target is 20px above its board; reserve that height on ordinary jumps.
    const gap = springGap ? 150 + difficulty * 60 + Math.random() * 10 :
        50 + difficulty * 18 - (spring ? 20 : 0);
    const rise = gap + (spring ? 20 : 0) - (previous.spring ? 20 : 0);
    const speed = previous.spring ? -springSpeed : -jumpSpeed;
    const landingTime = (speed + Math.sqrt(speed * speed - 2 * gravity * rise)) / gravity;
    // Leave reaction time and do not require screen wrapping to reach the next center.
    const maxShift = Math.min(65 + difficulty * 35, landingTime * 240 * 0.55);
    const x = Math.max(0, Math.min(width - 60, previous.x + (Math.random() * 2 - 1) * maxShift));
    if (springGap) {
        previous.requiredSpring = true;
        previous.fragile = false;
    }
    const fragile = !spring && !springGap && !previous.spring && !previous.fragile &&
        Math.random() < 0.12 + difficulty * 0.18;
    const platform = makePlatform(previous.y - gap, x, spring, fragile);
    // Keep a corridor around the complete reachable jump, including the player's body.
    if (routeScore >= 180 && Math.random() < 0.18 + difficulty * 0.22) {
        const left = Math.min(previous.x, x) - 14;
        const right = Math.max(previous.x, x) + 74;
        const sides = [];
        if (left >= 48) sides.push(24);
        if (right <= width - 48) sides.push(width - 24);
        if (sides.length) platform.hazard = { x: sides[Math.floor(Math.random() * sides.length)],
            y: (previous.y + platform.y) / 2 - 23, radius: 15 };
    }
    return platform;
}

function restart() {
    if (result.open) result.close();
    for (const id of ["left", "right"]) document.getElementById(id).classList.remove("pressed");
    player = { x: 157, y: 458, width: 46, height: 46, vy: jumpSpeed, facing: 1, jumpTime: 0 };
    platforms = [makePlatform(526, 150, false)];
    for (let i = 1; i < 10; i++) {
        platforms.push(nextPlatform(platforms[platforms.length - 1]));
    }
    fragments = [];
    camera = 0;
    highest = player.y;
    gameOver = false;
    keys.clear();
    pointers.clear();
    accumulator = 0;
    lastTime = undefined;
}

function step(dt) {
    if (gameOver || result.open || profile.open || document.hidden) return;
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
        if (!hazard) continue;
        const nearestX = Math.max(player.x + 6, Math.min(hazard.x, player.x + player.width - 6));
        const nearestY = Math.max(player.y + 6, Math.min(hazard.y, player.y + player.height - 6));
        if ((nearestX - hazard.x) ** 2 + (nearestY - hazard.y) ** 2 < hazard.radius ** 2) {
            finish();
            return;
        }
    }
    highest = Math.min(highest, player.y);
    // World coordinates stay fixed; only the camera follows new heights.
    camera = Math.min(camera, player.y - height * 0.4);
    platforms = platforms.filter(platform => platform.y - camera < height + 30);
    while (platforms[platforms.length - 1].y > camera - 80) {
        const previous = platforms[platforms.length - 1];
        platforms.push(nextPlatform(previous));
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
    for (const platform of platforms) {
        if (platform.hazard) {
            const hazard = platform.hazard;
            const y = hazard.y - camera;
            context.fillStyle = "#813f35";
            context.strokeStyle = "#ffdf9a";
            context.lineWidth = 2;
            context.beginPath();
            for (let i = 0; i < 16; i++) {
                const angle = i * Math.PI / 8;
                const radius = i % 2 ? 10 : 19;
                const x = hazard.x + Math.cos(angle) * radius;
                const pointY = y + Math.sin(angle) * radius;
                if (i) context.lineTo(x, pointY); else context.moveTo(x, pointY);
            }
            context.closePath();
            context.fill();
            context.stroke();
        }
        if (platform.broken) continue;
        const y = platform.y - camera;
        const image = platform.fragile ? brokenImage : platformImage;
        if (image.complete && image.naturalWidth) {
            context.drawImage(image, platform.x, y, platform.width, platform.height);
        }
        if (platform.spring && springImage.complete && springImage.naturalWidth) {
            const springHeight = performance.now() < platform.compressedUntil ? 12 : 20;
            context.drawImage(springImage, platform.x + 19, y + 3 - springHeight, 22, springHeight);
        }
        if (platform.requiredSpring) {
            context.fillStyle = "#343e24";
            context.fillRect(platform.x - 4, y + 20, 68, 19);
            context.fillStyle = "#ffe18a";
            context.font = "bold 11px sans-serif";
            context.textAlign = "center";
            context.fillText("必踩弹簧 ↑", platform.x + 30, y + 33);
            context.textAlign = "left";
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
