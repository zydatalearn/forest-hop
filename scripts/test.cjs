const { spawnSync } = require("node:child_process");
for (const file of ["platform-route.cjs", "gameplay-items.cjs", "difficulty-pressure.cjs", "hud-render.cjs", "pwa.cjs", "cloudbase-api.cjs"]) {
    const result = spawnSync(process.execPath, ["tests/" + file], { stdio: "inherit" });
    if (result.status !== 0) process.exit(result.status || 1);
}
const result = spawnSync(process.execPath, ["tests/platform-route.cjs", "--expanded"], { stdio: "inherit" });
process.exit(result.status ?? 1);
