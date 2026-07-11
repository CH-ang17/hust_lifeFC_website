# 学院足球队网站 · LIFE SC. FC

简约、现代的学院足球队站点：展示球队风采、赛季数据与比赛战报。**纯静态**（HTML + CSS + 原生 JS），内容来自 `assets/data/content.json`，托管在 **GitHub Pages** 后任何人都能访问；站长通过 `admin.html` 登录后台即可在线修改内容并自动提交回仓库。

## 目录结构

```
.
├─ index.html              # 前台页面（外壳，内容由 app.js 渲染）
├─ admin.html              # 管理后台（登录 + 表单编辑）
├─ start.py                # 零依赖本地预览服务器
├─ assets/
│  ├─ css/styles.css       # 设计系统与全部样式（改这里换主题）
│  ├─ js/app.js            # 前台：读取 content.json + 渲染 + 主题/动效
│  ├─ js/admin.js          # 后台：GitHub API 连接 / 编辑 / 提交
│  └─ data/
│     ├─ content.json      # ★ 全站内容唯一数据源（改这个 = 改网站）
│     └─ admin.config.json # 后台口令哈希（公开文件，仅作 UI 门禁）
└─ .nojekyll               # 让 GitHub Pages 不做 Jekyll 处理
```

## 一、本地预览

直接双击 `index.html` 会因浏览器安全策略无法读取 `content.json`，请用本地服务器：

```bash
python start.py            # 然后打开 http://localhost:8000
python start.py 8080       # 自定义端口
```

## 二、部署到 GitHub Pages（让别人也能浏览）

1. 在 GitHub 上**新建一个公开仓库**（公开仓库才能用免费的 GitHub Pages）。
   - 项目页：`team-site` → 站点地址 `https://<你的用户名>.github.io/team-site/`
   - 用户/组织页：仓库名必须叫 `<用户名>.github.io` → 站点地址 `https://<用户名>.github.io/`
2. 把本目录所有文件推送到该仓库（分支 `main`）：
   ```bash
   git init
   git add .
   git commit -m "init: 学院足球队网站"
   git branch -M main
   git remote add origin https://github.com/<用户名>/<仓库名>.git
   git push -u origin main
   ```
3. 仓库 → **Settings → Pages** → Source 选 `Deploy from a branch`，分支选 `main`、目录选 `/ (root)`，保存。
4. 等待约 1 分钟，访问你的 `*.github.io` 地址即可看到网站。

## 三、登录后台修改内容

1. 打开 `https://<你的地址>/admin.html`。
2. 点击 **「从当前网址自动识别」**（已部署在 github.io 上时可用），再填入**个人访问令牌 (PAT)**：
   - 生成地址：GitHub → Settings → Developer settings → **Fine-grained tokens**（或 Classic tokens）
   - 权限：仓库的 **Contents → Read and write**（只勾 Read 则能看不能改）
   - 令牌**只保存在你当前浏览器**的 localStorage，不会上传到任何服务器。
3. 首次进入会让你**设置站点口令**（也可留空不设）。之后每次进后台都要输口令——它只是防误改的 UI 门禁，**真正的写入权限来自上面的 PAT**。
4. 在表单里改队名、阵容、赛程、数据、故事、页脚等，点 **「保存修改」** 即把 `content.json` 提交回仓库。GitHub Pages 通常 1 分钟内自动更新。
5. 另有 **「导出 / 导入 JSON」** 作为兜底：可把内容下载到本地、改完再导入（导入后仍需点保存提交）。

> 安全说明：`admin.config.json` 是公开文件，口令以 SHA-256 哈希存储，无法反推明文，但也只能挡住「随便点点的人」。对一支球队的站点足够；若日后要更强鉴权，可再上真后端。

## 四、如何自定义

- **换配色 / 字体**：改 `assets/css/styles.css` 顶部的 `:root` 设计令牌（`--pitch` 草绿、`--signal` 琥珀、`--ink`/`--paper` 等）。深色模式在 `:root[data-theme="dark"]`。
- **改内容**：要么直接在 `content.json` 里改（提交后生效），要么登录 `admin.html` 在线改。
- **改文案结构**：前台渲染逻辑在 `assets/js/app.js`，后台表单字段在 `assets/js/admin.js` 的 `buildEditor()`。

## 五、已知限制

- 必须是**公开仓库**才能用免费 GitHub Pages 让别人浏览。
- 浏览器端提交走 GitHub API，免费账号每小时 5000 次请求额度，日常足够。
- GitHub Pages 的 CDN 可能缓存旧文件几十秒到 1 分钟，保存后稍等或强制刷新即可。
