---
name: wechat-daily-digest
description: >
  微信公众号文章日报生成器。当用户要求"获取今天的公众号文章"、"生成公众号日报"、
  "归纳公众号文章并发邮件"、"看看今天公众号有什么新内容"时使用此 skill。
  功能：同步最新文章 → 读取正文 → AI 归纳分类 → 生成 HTML 网页 → 邮件发送。
  依赖：wechat-article-exporter 项目（含 MCP Server 和 SQLite 数据库）+ agently-mail skill。
---

# 微信公众号文章日报

## 前置条件

- wechat-article-exporter 项目在本地运行（dev server 或 build），端口默认 3000
- agently-mail 已安装并授权
- 配置文件 `~/.config/wechat-digest/config.json` 包含收件邮箱（见下文）

## 配置文件

首次使用前创建配置：

```bash
mkdir -p ~/.config/wechat-digest
cat > ~/.config/wechat-digest/config.json << 'EOF'
{
  "project_path": "/Users/你的用户名/Documents/github/wechat-article-exporter",
  "email": "你的邮箱@qq.com",
  "days": 1
}
EOF
```

- `project_path`：项目根目录路径（含 .data/wechat.db）
- `email`：日报发送的目标邮箱
- `days`：默认拉取几天的文章（默认 1 = 今天）

## 工作流程

### 第 1 步：读取配置

```bash
cat ~/.config/wechat-digest/config.json
```

获取 project_path、email、days。如果配置不存在，提示用户先创建。

### 第 2 步：同步最新文章

调用项目的增量同步 API（需要微信登录态，若失败提示用户在浏览器里登录）：

```bash
# 获取所有公众号 fakeid
curl -s http://localhost:3000/api/web/data/v1/accounts | python3 -c "import sys,json; [print(a['fakeid']) for a in json.load(sys.stdin)['data']['items']]"
```

对每个公众号触发增量同步：

```bash
curl -s -X POST http://localhost:3000/api/web/data/v1/batch/sync-account \
  -H "Content-Type: application/json" \
  -d '{"fakeid":"<FAKEID>","begin":0,"incremental":true,"maxPages":5}'
```

等待同步完成（轮询 sync-status），然后触发补抓正文：

```bash
curl -s -X POST http://localhost:3000/api/web/data/v1/topic/fetch-content \
  -H "Content-Type: application/json" \
  -d '{"days":<DAYS>,"limit":50}'
```

等待补抓完成（轮询 fetch-status）。

**备选方案**：如果项目服务没运行，直接运行数据提取脚本（只读已有数据，不同步新的）：

```bash
node <skill_path>/scripts/sync_and_fetch.cjs <project_path> <days>
```

### 第 3 步：提取文章数据

运行提取脚本，把最近 N 天的文章（含正文）导出为 JSON：

```bash
node <skill_path>/scripts/sync_and_fetch.cjs <project_path> <days>
```

输出 `scripts/articles_data.json`，包含每篇文章的标题、链接、公众号、摘要、正文。

### 第 4 步：AI 归纳分类

读取 `articles_data.json`，逐篇阅读正文后做以下处理：

1. **归纳**：为每篇文章生成 2-3 句话的内容摘要（不是复制原文摘要，而是基于正文重新归纳）
2. **分类**：将文章按主题归类（如"AI 模型"、"行业动态"、"技术教程"等），同类放一起
3. **标签**：为每篇文章打 1-3 个关键词标签

归纳要求：
- 基于正文内容，不凭标题猜测
- 没有正文的文章（has_content=false），标注"仅摘要"并用 digest 兜底
- 摘要要提炼核心观点，不是流水账

### 第 5 步：生成 HTML 日报

基于 `assets/digest-template.html` 模板，填充归纳后的内容：

1. 替换 `{{date}}` 为当天日期
2. 替换 `{{total}}`、`{{accounts_count}}`、`{{categories}}` 为统计数据
3. `{{categories_html}}` 替换为分类后的文章内容（每个分类一个 `.category` 块）
4. 每篇文章用 `.article` 块，包含标题（带链接）、来源公众号、日期、AI 归纳摘要、标签

生成的 HTML 保存为 `scripts/digest.html`。

### 第 6 步：发送邮件

使用 agently-mail skill 发送邮件：

```bash
agently-cli message +send \
  --to "<EMAIL>" \
  --subject "公众号文章日报 - <DATE>" \
  --body-file scripts/digest.html \
  --confirmation-token <TOKEN>
```

正文用 `--body-file` 指向生成的 HTML 文件（支持 HTML 格式邮件）。

**注意**：发送邮件需要两阶段确认。先生成邮件内容和命令，展示给用户确认后再执行。

## 注意事项

- 如果项目服务没运行（端口 3000 不通），跳过同步步骤，只用本地已有数据
- 如果微信登录态过期，同步会失败，提示用户在浏览器里重新扫码登录
- 正文未抓取的文章，AI 归纳时标注"仅基于摘要"，不要编造内容
- 文章超过 50 篇时，每篇归纳控制在 2-3 句，避免 HTML 过长
