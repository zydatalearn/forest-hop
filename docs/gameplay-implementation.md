# 玩法扩展实现记录 · 1.1.1

本次将 gameplay-expansion.md 的设计落实到代码。原设计文档保留为提案；下列条目说明实际采用的规则。

## 明确的规则

- 冲刺、二段跳、弹簧靴分别有充能和按钮；护盾自动触发，滑翔和磁石拾取后自动生效。不加入触屏上滑手势。
- 主动技能按钮位于右侧，透明圆形竖排，只显示持有或正在使用的技能，图标加次数，不占独立侧栏。
- 持续时间使用固定步进 dt，暂停期间不消耗。按用户修正，冲刺改为以 780 px/s 垂直向上移动 0.30 秒、冷却 0.5 秒；左右控制照常，结束后恢复重力并保留上升惯性，残影位于角色下方。原设计文档中的水平冲刺不再适用。
- 羽毛允许本次落板到下次落板之间使用一次，不采用提案中无法明确判定的“落地前 0.35 秒”。弹簧靴手动预备，下一次落板消耗。
- 坠落护盾在仍存在的主路线平台下方 50 px 创建救援板，避开备选板，必要时修复目标板，确保普通跳可以返回主线。碰撞护盾移除对应危险物，并提供 1 秒白色闪光保护；金色光环只表示尚未消耗的护盾。
- 收集链采用可测试的 4 秒窗口，不采用随相机持续变化的“同一屏”范围。连击只计不同完整木板，踩碎裂板或消耗护盾中断。
- 高难度默认关闭；苔藓只在备选板，蜂窝沿用炸弹的安全走廊排除条件，2 秒后变成 70 px/s 的横向小虫。风区在木板附近对垂直速度施加 ±60 px/s² 的局部加速度；这与提案的 ±60 px/s 不同，避免每步直接加速度值造成巨大位移。
- 普通生成公式未改变，但分值道具被功能道具部分替代、额外奖励增加，因此达到 2000 分移动板门槛的实际高度可能变化。概率和参数仍需真实游玩调平衡。
- 后续难度调整：实际得分达到 5000 后，所有现有与新生成平台均为碎木板，包含弹簧、移动、备选与护盾救援板；踩板先起跳再断裂。5000 分前仍保留原弹簧段保护规则。
- 功能道具不是平台可达的必要条件。路线测试中的控制器按下一块安全板移动，不主动使用冲刺等技能；主动技能单独验证。高难度活动小虫与风区不属于基础安全路线证明。

## 新增素材与提示词

使用内置 imagegen，每件道具独立生成。原始 PNG 保留在 Codex generated_images 目录；下列项目文件均为透明 WebP，288×288，主体在 256×256 内。角色继续使用已有 8 帧，冲刺使用现有帧的半透明残影。

共同提示词：

> Use case: stylized-concept. Asset type: single collectible sprite for Forest Hop, a warm forest squirrel jumping game. Subject: [下列主体]. Polished cinematic stylized 3D CG, clear chunky silhouette readable at 28 pixels, warm soft lighting, detailed natural materials, centered fully visible with generous empty margins. Genuine transparent background, no floor, no text, no borders, no watermark, one standalone collectible.

| 文件 | 主体提示词 |
| --- | --- |
| assets/images/runtime/dash.webp | a compact acorn wind booster with a cyan white swirl pointing right |
| assets/images/runtime/shield.webp | a golden amber heart-shaped forest fruit inside a translucent resin shield |
| assets/images/runtime/glide.webp | one broad green maple leaf shaped like a small glider |
| assets/images/runtime/magnet.webp | a pinecone with a red and blue horseshoe magnet and subtle magnetic arcs |
| assets/images/runtime/feather.webp | one softly curved pale cream feather with warm golden tip |
| assets/images/runtime/spring-boots.webp | a pair of tiny brown woodland boots fitted with clearly visible silver coil springs |

高难度苔藓、蜂窝、小虫和风区目前使用 Canvas 绘制，未新增图片依赖。

## 验证范围

- 基础路线：60,000 次真实物理跳跃，保留原分值、危险物和移动板断言。
- 扩展路线：开启功能道具的相同路线模拟，覆盖自动拾取带来的物理变化。
- 功能测试：充能上限、冲刺距离/冷却、暂停和后台、单次撞弹上限、护盾消耗、救援板、滑翔、移动板磁吸、二段跳、弹簧靴、连击和收集链、重开状态清理、高难度生成和蜂窝释放。
- 浏览器加载和布局检查；不代表完成 30 分钟人工游玩、实体手机双指测试或死亡率/分数分布统计。
