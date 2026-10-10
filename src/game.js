// Physics use seconds so movement is consistent across refresh rates.
const board = document.getElementById("board");
const context = board.getContext("2d");
const width = 360, height = 576;
board.width = width;
board.height = height;
const rightImage = new Image();
const leftImage = new Image();
const platformImage = new Image();
const springImage = new Image();
const brokenImage = new Image();
rightImage.src = "./assets/images/doodler-right.png";
leftImage.src = "./assets/images/doodler-left.png";
platformImage.src = "./assets/images/platform-wood.webp";
springImage.src = "./assets/images/spring.webp";
brokenImage.src = "./assets/images/platform-broken-wood.webp";

const gravity = 1440, jumpSpeed = -480, springSpeed = -900;
const keys = new Set();
const pointers = new Map();
let player, platforms, camera, highest, gameOver, lastTime;
let accumulator = 0;
let fragments = [];
const result = document.getElementById("result");
const profile = document.getElementById("profile");
const uploadConfirm = document.getElementById("upload-confirm");
let completedRun;
let uploading = false;
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

let rankingRequest;
function showLocalRanking() {
    rankingRequest?.abort();
    document.getElementById("ranking-title").textContent = "本机排行榜 · 前 10 名";
    document.getElementById("ranking-status").textContent = "";
    renderRanking(records);
}

async function showOnlineRanking() {
    rankingRequest?.abort();
    const request = new AbortController();
    rankingRequest = request;
    const timeout = setTimeout(() => request.abort(), 15000);
    document.getElementById("ranking-title").textContent = "联机排行榜 · 前 10 名";
    document.getElementById("rank-list").replaceChildren();
    document.getElementById("ranking-status").textContent = "正在读取 GitHub 成绩…";
    try {
        const best = new Map();
        for (let page = 1; ; page++) {
            const response = await fetch("https://api.github.com/repos/zydatalearn/forest-hop/issues?state=open&per_page=100&page=" + page,
                { signal: request.signal, headers: { Accept: "application/vnd.github+json" } });
            if (!response.ok) throw new Error("GitHub 暂时不可用或请求次数已达上限");
            const issues = await response.json();
            for (const issue of issues) {
                if (issue.pull_request || issue.title !== "[Forest Hop Score]" || !issue.user?.login) continue;
                try {
                    const match = issue.body?.match(/```json\s*([\s\S]*?)```/);
                    if (!match) continue;
                    const value = JSON.parse(match[1]);
                    if (value.game !== "forest-hop" || !Number.isInteger(value.score) || value.score < 0 ||
                        typeof value.name !== "string" || !value.name.trim()) continue;
                    const entry = { name: value.name.trim().slice(0, 12), score: value.score };
                    if (!best.has(entry.name) || best.get(entry.name).score < entry.score) best.set(entry.name, entry);
                } catch { /* Ignore unrelated or malformed submissions. */ }
            }
            if (issues.length < 100) break;
        }
        if (rankingRequest !== request) return;
        renderRanking([...best.values()].sort((a, b) => b.score - a.score).slice(0, 10));
        document.getElementById("ranking-status").textContent = "同名取最高分 · 玩家提交，未经验证";
    } catch (error) {
        if (rankingRequest === request) document.getElementById("ranking-status").textContent =
            request.signal.aborted ? "读取超时，请重新点击联机排行" : "读取失败，请稍后重试或查看本机排行";
    } finally { clearTimeout(timeout); }
}

function showResult(ended) {
    keys.clear();
    pointers.clear();
    for (const id of ["left", "right"]) document.getElementById(id).classList.remove("pressed");
    document.getElementById("result-title").textContent = ended ? "游戏结束" : "森林排行榜";
    document.getElementById("result-summary").innerHTML =
        "本次分数<br><strong>" + score() + "</strong><br>最高纪录 " + (records[0]?.score || 0);
    showLocalRanking();
    const submit = document.getElementById("submit-score");
    submit.hidden = !gameOver;
    submit.disabled = !!completedRun?.uploaded;
    submit.textContent = completedRun?.uploaded ? "本次成绩已上传" : "上传本次成绩";
    document.getElementById("close-result").textContent = ended ? "查看场景" : "继续游戏";
    document.getElementById("play-again").hidden = !gameOver;
    if (!result.open) result.showModal();
}

function finish() {
    gameOver = true;
    completedRun = { name: nickname, score: score() };
    records.push(completedRun);
    records.sort((a, b) => b.score - a.score);
    records = records.slice(0, 10);
    try { localStorage.setItem("forest-hop-scores", JSON.stringify(records)); } catch {}
    showResult(true);
    showUploadConfirm();
}

function showUploadConfirm() {
    if (!completedRun || completedRun.uploaded || uploading) return;
    document.getElementById("upload-summary").textContent = completedRun.name + " · " + completedRun.score + " 分";
    document.getElementById("upload-status").textContent = "";
    const manual = document.getElementById("manual-upload");
    manual.hidden = true;
    const body = "Forest Hop 手动提交成绩（未经验证）\n\n```json\n" +
        JSON.stringify({ game: "forest-hop", name: completedRun.name, score: completedRun.score }, null, 2) + "\n```";
    manual.href = "https://github.com/zydatalearn/forest-hop/issues/new?title=" +
        encodeURIComponent("[Forest Hop Score]") + "&body=" + encodeURIComponent(body);
    uploadConfirm.showModal();
}

async function uploadScore() {
    if (!completedRun || completedRun.uploaded || uploading) return;
    uploading = true;
    const run = completedRun;
    const request = new AbortController();
    const timeout = setTimeout(() => request.abort(), 15000);
    const yes = document.getElementById("upload-yes");
    const no = document.getElementById("upload-no");
    yes.disabled = no.disabled = true;
    document.getElementById("upload-status").textContent = "正在上传…";
    try {
        if (!FOREST_HOP_API_URL) throw new Error("上传服务尚未部署，本机成绩已保留");
        const response = await fetch(FOREST_HOP_API_URL + "/scores", {
            method: "POST", signal: request.signal,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name: run.name, score: run.score })
        });
        if (!response.ok) {
            const error = await response.json().catch(() => ({}));
            throw new Error(error.message || "上传失败，请稍后重试");
        }
        run.uploaded = true;
        const submit = document.getElementById("submit-score");
        submit.disabled = true;
        submit.textContent = "本次成绩已上传";
        uploadConfirm.close();
        await showOnlineRanking();
    } catch (error) {
        document.getElementById("manual-upload").hidden = false;
        document.getElementById("upload-status").textContent = request.signal.aborted ?
            "请求超时，可能已上传，请先查看联机排行再决定是否重试；也可使用下方备用入口" :
            error instanceof TypeError ? "无法连接上传服务，本机成绩已保存。可切换网络重试，或使用下方 GitHub 备用入口" : error.message;
    } finally {
        clearTimeout(timeout);
        uploading = false;
        yes.disabled = no.disabled = false;
    }
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
    return makePlatform(previous.y - gap, x, spring, fragile);
}

function restart() {
    if (uploadConfirm.open) uploadConfirm.close();
    if (result.open) result.close();
    for (const id of ["left", "right"]) document.getElementById(id).classList.remove("pressed");
    player = { x: 157, y: 458, width: 46, height: 46, vy: jumpSpeed, img: rightImage };
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
    if (direction) player.img = direction < 0 ? leftImage : rightImage;
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

function draw() {
    context.clearRect(0, 0, width, height);
    for (const platform of platforms) {
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
    if (player.img.complete && player.img.naturalWidth) {
        context.drawImage(player.img, player.x, player.y - camera, player.width, player.height);
    }
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
    if (gameOver || result.open || profile.open || event.target.closest(".hud, #ranking, dialog")) return;
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
    if (profile.open || uploadConfirm.open || event.target.matches("input, textarea")) return;
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
document.getElementById("upload-no").addEventListener("click", () => uploadConfirm.close());
document.getElementById("upload-yes").addEventListener("click", uploadScore);
document.getElementById("submit-score").addEventListener("click", showUploadConfirm);
uploadConfirm.addEventListener("cancel", event => { if (uploading) event.preventDefault(); });
document.getElementById("play-again").addEventListener("click", restart);
document.getElementById("close-result").addEventListener("click", () => result.close());
result.addEventListener("close", () => { rankingRequest?.abort(); clearControls(); });
restart();
if (!hasNickname) showProfile();
requestAnimationFrame(frame);
