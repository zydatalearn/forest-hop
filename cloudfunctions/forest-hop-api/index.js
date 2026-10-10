const http = require("node:http");

function createServer(env = process.env, fetchApi = fetch) {
    const limits = new Map();
    const databaseUrl = "https://" + env.TCB_ENV + ".api.tcloudbasegateway.com/v1/rdb/rest/";
    return http.createServer(async (req, res) => {
        const origin = req.headers.origin;
        const allowed = env.ALLOWED_ORIGIN || "https://zydatalearn.github.io";
        const originAllowed = origin === allowed || origin === "null";
        const headers = { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", Vary: "Origin" };
        if (originAllowed) Object.assign(headers, { "Access-Control-Allow-Origin": origin,
            "Access-Control-Allow-Methods": "GET, POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type" });
        const send = (status, data) => { res.writeHead(status, headers); res.end(data === undefined ? undefined : JSON.stringify(data)); };
        const url = new URL(req.url, "http://localhost");
        const path = url.pathname;
        if (path === "/health" && req.method === "GET") return send(200, { ok: true });
        if (origin && !originAllowed) return send(403, { message: "网站来源不允许" });
        if (path !== "/scores") return send(404, { message: "接口不存在" });
        if (req.method === "OPTIONS") return send(204);
        if (!["GET", "POST"].includes(req.method)) return send(405, { message: "请求方法不支持" });
        if (!env.CLOUDBASE_APIKEY || !env.TCB_ENV) return send(503, { message: "排行服务尚未配置" });
        const databaseHeaders = { "Content-Type": "application/json", Authorization: "Bearer " + env.CLOUDBASE_APIKEY };
        try {
            if (req.method === "GET") {
                const name = (url.searchParams.get("name") || "").trim();
                if (name.length > 12) return send(400, { message: "名称过长" });
                const response = await fetchApi(databaseUrl + "rpc/forest_hop_ranking",
                    { method: "POST", headers: databaseHeaders, signal: AbortSignal.timeout(10000),
                        body: JSON.stringify({ player_name: name }) });
                if (!response.ok) return send(502, { message: "排行榜读取失败，请稍后重试" });
                return send(200, await response.json());
            }
            if (!req.headers["content-type"]?.startsWith("application/json")) return send(415, { message: "需要 JSON 格式" });
            let raw = "";
            for await (const chunk of req) {
                raw += chunk;
                if (Buffer.byteLength(raw) > 1024) return send(413, { message: "提交内容过长" });
            }
            let value;
            try { value = JSON.parse(raw); } catch { return send(400, { message: "提交格式不正确" }); }
            if (!value || typeof value.name !== "string" || !value.name.trim() || value.name.length > 12 ||
                !Number.isInteger(value.score) || value.score < 0 || value.score > 2147483647)
                return send(400, { message: "名称或分数不正确" });
            const now = Date.now();
            for (const [key, limit] of limits) if (limit.expires <= now) limits.delete(key);
            const ip = (req.headers["x-forwarded-for"] || req.socket.remoteAddress).split(",")[0].trim();
            const limit = limits.get(ip) || { count: 0, expires: now + 60000 };
            if (limit.count >= 5) return send(429, { message: "上传太频繁，请一分钟后重试" });
            limit.count++;
            limits.set(ip, limit);
            const response = await fetchApi(databaseUrl + "rpc/forest_hop_submit", { method: "POST",
                headers: databaseHeaders, signal: AbortSignal.timeout(10000),
                body: JSON.stringify({ player_name: value.name.trim(), run_score: value.score }) });
            if (!response.ok) return send(502, { message: "成绩上传失败，请稍后重试" });
            return send(200, { message: "已上传，排行榜保留同名最高分", record: (await response.json())[0] });
        } catch { return send(504, { message: "请求超时，请先查看联机排行再决定是否重试" }); }
    });
}
module.exports = { createServer };
if (require.main === module) createServer().listen(9000, "0.0.0.0");
