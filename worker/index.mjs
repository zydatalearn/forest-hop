export default {
    async fetch(request, env) {
        const origin = request.headers.get("Origin");
        const headers = { "Content-Type": "application/json", "Cache-Control": "no-store", "Vary": "Origin" };
        const reply = (status, message) => new Response(JSON.stringify({ message }), { status, headers });
        if (origin !== env.ALLOWED_ORIGIN) return reply(403, "网站来源不允许上传");
        headers["Access-Control-Allow-Origin"] = origin;
        headers["Access-Control-Allow-Methods"] = "POST, OPTIONS";
        headers["Access-Control-Allow-Headers"] = "Content-Type";
        if (new URL(request.url).pathname !== "/scores") return reply(404, "接口不存在");
        if (request.method === "OPTIONS") return new Response(null, { status: 204, headers });
        if (request.method !== "POST") return reply(405, "请使用 POST 上传成绩");
        if (!env.GITHUB_TOKEN) return reply(503, "上传服务尚未配置");
        if (!request.headers.get("Content-Type")?.startsWith("application/json")) return reply(415, "需要 JSON 格式");
        let value;
        try {
            const text = await request.text();
            if (text.length > 1024) return reply(413, "提交内容过长");
            value = JSON.parse(text);
        } catch { return reply(400, "提交格式不正确"); }
        if (!value || typeof value.name !== "string" || !value.name.trim() || value.name.length > 12 ||
            !Number.isSafeInteger(value.score) || value.score < 0) return reply(400, "名称或分数不正确");
        // IP throttling protects the shared GitHub credential; shared networks share this limit.
        const { success } = await env.SCORE_LIMIT.limit({ key: request.headers.get("CF-Connecting-IP") || "unknown" });
        if (!success) return reply(429, "上传太频繁，请一分钟后重试");
        const body = "Forest Hop 游戏提交成绩（未经验证）\n\n```json\n" +
            JSON.stringify({ game: "forest-hop", name: value.name.trim(), score: value.score }, null, 2) + "\n```";
        try {
            const response = await fetch("https://api.github.com/repos/zydatalearn/forest-hop/issues", {
                method: "POST", signal: AbortSignal.timeout(10000),
                headers: { Accept: "application/vnd.github+json", "Content-Type": "application/json",
                    "User-Agent": "forest-hop-scores", Authorization: "Bearer " + env.GITHUB_TOKEN },
                body: JSON.stringify({ title: "[Forest Hop Score]", body })
            });
            if (!response.ok) return reply(502, "GitHub 上传失败，请管理员检查凭据或稍后重试");
            return reply(201, "成绩已上传");
        } catch { return reply(504, "上传超时，可能已提交，请先查看排行榜"); }
    }
};
