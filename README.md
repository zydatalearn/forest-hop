# Forest Hop · 森林跃跃

适合移动端的 HTML5 纵向跳跃小游戏。建议 GitHub 仓库名：forest-hop。

## 运行
双击 index.html 即可运行，也可使用 VS Code Live Server。
部署 GitHub Pages 时选择仓库根目录，无需构建。

## 操作
- 手机：按住画面左侧或右侧移动；单指滑过中线换向，松手停止。
- 电脑：方向键或 A / D；结束后空格重开。
- 下落时踩中黄色弹簧可获得约 3.5 倍普通跳跃高度。
- 有裂纹的木板只能踩一次：弹起后断裂、掉落并消失。
- 画面左右边缘可以穿越。

## 难度
- 按路线高度逐步增加难度，普通木板间距从 50 增至 68 像素，约 300 分后不再增加。
- 约 120 分后的路线开始出现弹簧大跨度，标注“必踩弹簧”；必须踩中弹簧才能到达上方木板。
- 必踩弹簧及其下一块木板不会断裂，横向距离按跳跃时间限制，不要求穿越屏幕边缘。
- 运行 `node tests/platform-route.cjs` 可验证随机路线在实际物理和碰撞逻辑下可达。

## 结构
- index.html：页面入口
- src/game.js：控制、物理和绘制
- src/style.css：移动端布局
- assets/images/：实际使用的图片

## 来源
基于 https://github.com/ImKennyYip/doodle-jump 改进。
角色图片沿用原项目；森林、平台和弹簧由 AI 生成。
发布前请自行确认原项目及角色素材的使用授权。

## 排行榜
本机前 10 名保存在当前浏览器 localStorage，游戏结束时记录一次。排行榜打开时暂停游戏；不同设备之间不共享成绩。
每条成绩保存当时的昵称。旧版仅有分数的记录使用升级时的昵称显示。
首次进入需先设置昵称，确认后在当前浏览器锁定，清除浏览器数据会重置。
游戏结束后询问是否上传，选择“是”通过 Cloudflare Worker 提交到 GitHub Issues，无需玩家登录；选择“否”仅保留本机记录，可随后点击上传按钮。
联机排行读取本仓库标题为 `[Forest Hop Score]` 的公开、未关闭 Issue，按名称保留最高分，同名玩家会合并。
游戏内不提供分数编辑，但客户端提交不能防止作弊，联机成绩未经验证。关闭作弊或无效成绩的 Issue 可将其移出联机排行。
GitHub Token 仅保存到 Worker 的 GITHUB_TOKEN Secret，不放进网页或仓库。网页 src/github-config.js 只保存公开的 Worker 地址。

## Cloudflare 上传服务
1. 在 worker 目录运行 `npx wrangler login`，然后 `npx wrangler deploy`。
2. 运行 `npx wrangler secret put GITHUB_TOKEN`，按提示输入仅授权本仓库 Issues 读写的 Token。
3. 将部署输出的 HTTPS 地址填入 src/github-config.js 的 FOREST_HOP_API_URL。
4. 将游戏部署到 GitHub Pages；worker/wrangler.jsonc 的 ALLOWED_ORIGIN 必须和网页来源一致（不含路径）。

接口检查名称和非负整数分数，每个 IP 在同一 Cloudflare 节点每分钟最多提交 5 次，同一网络的玩家共用这个额度。
直接打开本地 HTML 的来源不被允许上传；本机成绩仍可正常保存。来源检查和频率限制不能代替防作弊或保证名称唯一。
运行 `node tests/worker-api.mjs` 和 `node tests/score-upload.cjs` 验证接口和上传流程。
本地 .dev.vars 文件仅用于开发，已加入 .gitignore；上传 Secret 时不要把 Token 写进命令行或日志。
