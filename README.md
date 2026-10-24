# 拾读 · SHIDU

每天一次，把值得读的内容留在自己的阅读空间。

拾读是一个可部署在本地电脑或云服务器上的个人 RSS 阅读器。它支持 RSS、Atom、JSON Feed 和 RSSHub 路由，用 SQLite 保存订阅、文章、已读状态与收藏，无需单独安装数据库服务。

## 目录

- [功能](#功能)
- [快速开始](#快速开始)
- [使用指南](#使用指南)
- [RSSHub 订阅](#rsshub-订阅)
- [更新机制](#更新机制)
- [配置](#配置)
- [云服务器部署](#云服务器部署)
- [备份与升级](#备份与升级)
- [开发与验证](#开发与验证)
- [常见问题](#常见问题)
- [当前限制](#当前限制)

## 功能

| 功能 | 说明 |
| --- | --- |
| 多种订阅格式 | RSS、Atom、JSON Feed；添加成功后立即获取文章 |
| RSSHub 接入 | 支持路由、`rsshub://` 和完整 HTTP / HTTPS 地址，可连接公共或自建实例 |
| 每日更新 | 每天北京时间 08:00 自动拉取，按自然日去重，服务恢复后补执行当天任务 |
| 标签分类 | 订阅源按标签分组、折叠；按标签查看订阅源及其文章 |
| 阅读管理 | 未读筛选、收藏、关键词搜索、时间排序、按当前订阅源或标签范围标记全部已读 |
| 阅读界面 | 文章摘要预览、左右方向键切换文章、原文跳转、适配移动端的导航 |
| 可调侧栏 | 拖动分隔线调整宽度，支持键盘操作并记住宽度 |
| 多种主题 | 极简白昼、深空终端、暖纸书房、森间晨雾，以及跟随系统 |
| 本地存储 | SQLite 持久化，无需外部数据库 |
| 远程访问 | 内置 HTTPS、HTTP Basic 身份验证及写入请求来源校验 |

技术栈：React 19 · TypeScript · Vite 8 · Tailwind CSS 4 · Node.js 24 · SQLite。

## 快速开始

需要 **Node.js 24 或更高版本**（使用内置 `node:sqlite`）、npm 和 Git。以下命令可在 Windows PowerShell、macOS 或 Linux 的终端执行：

```sh
git clone https://github.com/fatwltr/SHIDU.git
cd SHIDU
npm ci
npm run build
npm start
```

打开 **<http://127.0.0.1:8787/>**。首次启动会自动创建数据库及表结构。

默认仅监听本机，不需要登录。终端中的服务进程需要持续运行；关闭网页不会停止服务，在终端按 `Ctrl+C` 会停止服务。

构建和运行产生的文件：

```text
.local/
├── server.mjs          # 打包后的 Node.js 服务
├── public/             # 网页静态资源
└── migrations/0000.sql # 数据库初始化脚本
local-data/
└── rss.sqlite          # 订阅、文章、阅读状态及应用设置
```

这两个目录均已加入 `.gitignore`，不应提交到仓库。

## 使用指南

1. 点击「添加订阅」，粘贴 RSS / Atom / JSON Feed 的订阅地址，选择标签。
2. 添加成功后，首批文章会出现在阅读列表中；也可从「发现好内容」选择示例订阅。
3. 在「我的订阅」展开标签分组，点击订阅源查看文章；使用标签下拉框或标签按钮筛选整个分类。
4. 点击文章标题打开摘要，同时标记为已读；在弹窗中按 `← / →` 或点击「上一篇 / 下一篇」连续阅读，点击「阅读完整原文」跳转到原网站。
5. 点击书签收藏文章，在「我的收藏」中查看；搜索支持文章标题、摘要和来源名称。
6. 在顶部「主题」中切换阅读风格，选择会保存在当前浏览器。

桌面端侧栏分隔线支持拖动，也可聚焦后使用左右方向键调整；`Shift + 方向键` 加大步长，`Home / End` 调至最窄 / 最宽，双击或按 `Enter` 恢复默认宽度。

取消订阅会一并删除该源的文章及收藏，请在确认弹窗中核对。

文章切换沿用打开弹窗时的筛选结果和排序；即使未读文章被标记为已读，也能按原顺序继续阅读。到达首篇或末篇时停止切换，不循环跳转。

## RSSHub 订阅

RSSHub 将网站内容转换为 RSS。拾读负责连接和读取 RSSHub 输出，**不会自动安装或运行 RSSHub**。

在「添加订阅 → RSSHub 路由」中：

1. 填写 RSSHub 实例地址，例如自建实例 `http://127.0.0.1:1200`。
2. 修改实例后先点击「保存实例」。
3. 输入路由、检查「实际订阅地址」预览，再添加订阅。

支持的输入形式：

| 输入形式 | 示例 |
| --- | --- |
| 路由路径 | `/bilibili/ranking/0/3/1` |
| RSSHub 协议 | `rsshub://bilibili/ranking/0/3/1` |
| 完整地址 | `https://your-rsshub.example/bilibili/ranking/0/3/1` |

路由路径和 `rsshub://` 使用已保存的实例拼接地址；完整 HTTP / HTTPS 地址使用其自身地址。以上示例用于说明输入格式，实际可用性取决于 RSSHub 实例和对应路由。

- 默认实例为 `https://rsshub.app`，可替换为自己的实例。
- **网络请求由拾读服务端发出**。拾读部署在云端时，`127.0.0.1:1200` 指云服务器上的 RSSHub，而不是你电脑上的服务。
- 更换实例只影响之后添加的路由，已有订阅保留原来的完整地址。
- 需要 Cookie、Token 等登录配置的路由，应在 RSSHub 实例中配置；拾读没有用于填写这些凭据的界面。
- RSSHub 可能有自己的缓存周期，拾读每天拉取不代表上游内容每天一定变化。

路由说明与实例部署方法见 [RSSHub 官方文档](https://docs.rsshub.app/)。

## 更新机制

更新按 **北京时间（`Asia/Shanghai`）的自然日**计算，不是从启动时起每隔 24 小时执行。

- 首次添加订阅立即拉取。
- 服务每分钟检查一次，在每天 08:00 之后执行当天尚未完成的更新任务。
- 每个订阅源当天已尝试拉取后会被跳过，包括当天刚添加的源，以及当天拉取失败的源。
- 服务在当天 08:00 之后启动或恢复运行，会补执行当天任务；不会逐日补跑停机期间的历史任务。
- 支持 ETag / Last-Modified 条件请求，重复文章按标识更新，保留已读和收藏状态。
- 页面每分钟读取一次本地数据，这不会触发额外的上游订阅拉取。

电脑关机、休眠或服务进程停止期间无法更新。希望每天稳定执行时，可使用下方的 systemd 部署。

## 配置

配置项见 [`.env.example`](.env.example)。**服务不会自动加载 `.env`**，可以设置进程环境变量，或使用 Node.js 的 `--env-file` 参数。

例如先复制示例：

```sh
cp .env.example .env
```

Windows PowerShell 使用：

```powershell
Copy-Item .env.example .env
```

编辑后启动：

```sh
node --env-file=.env .local/server.mjs
```

| 环境变量 | 默认值 | 说明 |
| --- | --- | --- |
| `RSS_PORT` | `8787` | 监听端口，允许 1024–65535 |
| `RSS_BIND` | `127.0.0.1` | 监听地址；`0.0.0.0` 用于对外监听 |
| `RSS_DATA_DIR` | 项目下的 `local-data/` | 数据目录，建议生产环境使用绝对路径 |
| `RSS_PUBLIC_ORIGIN` | 未设置 | 对外访问的协议、主机及端口，例如 `https://reader.example.com:8787`，不要包含路径或结尾斜杠 |
| `RSS_AUTH_USER` | `reader` | HTTP Basic 登录用户名 |
| `RSS_AUTH_PASSWORD` | 未设置 | 登录密码，设置后保护页面及 API |
| `RSS_TLS_CERT` | 未设置 | PEM 格式 TLS 证书文件路径 |
| `RSS_TLS_KEY` | 未设置 | PEM 格式 TLS 私钥文件路径 |

当 `RSS_BIND` 不是 `127.0.0.1` 时，服务要求同时配置公开访问地址、TLS 证书与私钥、登录密码，否则拒绝启动。公网访问地址必须与配置匹配，不能随意换用其他域名或 IP。

## 云服务器部署

以下步骤以使用 systemd 的 Linux 服务器为例。先在服务器或构建机按「快速开始」完成构建；服务器运行时需要可供系统服务访问的 Node.js 24+，不需要安装 npm 依赖。

### 1. 安装构建产物

在包含构建结果的项目目录执行：

```sh
sudo useradd --system --user-group --home-dir /var/lib/shidu-rss --shell /usr/sbin/nologin shidu-rss
sudo install -d -m 755 /opt/shidu-rss/.local
sudo install -d -o shidu-rss -g shidu-rss -m 750 /var/lib/shidu-rss
sudo install -d -o root -g shidu-rss -m 750 /etc/shidu-rss
sudo cp -R .local/server.mjs .local/public .local/migrations /opt/shidu-rss/.local/
```

如果专用用户已存在，跳过 `useradd`。如果在其他机器构建，传输 `.local/server.mjs`、`.local/public/` 和 `.local/migrations/` 到相同位置即可。

### 2. 配置证书和登录

准备与访问域名匹配的 TLS 证书。下面的源路径是占位示例，需要替换为自己的证书和私钥路径：

```sh
sudo install -o root -g shidu-rss -m 640 /path/to/fullchain.pem /etc/shidu-rss/server.crt
sudo install -o root -g shidu-rss -m 640 /path/to/privkey.pem /etc/shidu-rss/server.key
sudo install -o root -g root -m 600 /dev/null /etc/shidu-rss/server.env
sudoedit /etc/shidu-rss/server.env
```

填入配置，替换域名和密码：

```dotenv
RSS_BIND=0.0.0.0
RSS_PORT=8787
RSS_DATA_DIR=/var/lib/shidu-rss
RSS_PUBLIC_ORIGIN=https://reader.example.com:8787
RSS_AUTH_USER=reader
RSS_AUTH_PASSWORD=replace-with-your-own-random-password
RSS_TLS_CERT=/etc/shidu-rss/server.crt
RSS_TLS_KEY=/etc/shidu-rss/server.key
```

环境文件由 systemd 读取，证书和私钥需允许 `shidu-rss` 组读取。请使用独立生成的网站密码，保管在服务器环境文件中。

### 3. 启用 systemd 服务

```sh
command -v node
sudo cp deploy/shidu-rss.service /etc/systemd/system/shidu-rss.service
sudo systemctl daemon-reload
sudo systemctl enable --now shidu-rss
sudo systemctl status shidu-rss --no-pager
```

提供的 [服务配置](deploy/shidu-rss.service) 使用 `/usr/bin/node`。若实际路径不同，先修改 `ExecStart`；该服务启用了 `ProtectHome=true`，不要引用个人主目录中的 Node.js 安装。

### 4. 开放访问并验证

配置域名解析，在操作系统防火墙和云平台安全组 / 实例防火墙中放行 **TCP 8787**，然后打开配置中的 HTTPS 地址，输入网站用户名和密码。

也可在终端检查健康状态，以下命令会提示输入密码：

```sh
curl --user reader https://reader.example.com:8787/api/health
```

成功时返回包含 `"ok": true`、`"refreshHour": 8` 和 `"timeZone": "Asia/Shanghai"` 的 JSON。

常用管理命令：

```sh
sudo systemctl restart shidu-rss
sudo systemctl stop shidu-rss
sudo journalctl -u shidu-rss -n 100 --no-pager
```

## 备份与升级

订阅源、RSSHub 实例配置、文章、已读状态和收藏都在 `RSS_DATA_DIR/rss.sqlite`；主题和侧栏宽度保存在各浏览器的 localStorage 中。

SQLite 使用 WAL 模式。**不要在服务运行时只复制 `rss.sqlite` 单个文件**，应使用 SQLite 在线备份功能，或停机后备份。例如：

```sh
sudo systemctl stop shidu-rss
sudo install -d -m 700 /var/backups/shidu-rss
sudo cp -p /var/lib/shidu-rss/rss.sqlite "/var/backups/shidu-rss/rss-$(date +%Y%m%d-%H%M%S).sqlite"
sudo systemctl start shidu-rss
```

本地部署先用 `Ctrl+C` 停止进程，再备份 `local-data/`。恢复时保持服务停止，将备份还原到数据目录，并确保数据库归属 `shidu-rss:shidu-rss`；替换数据库前应移走旧库及配套的 `-wal` / `-shm` 文件，避免混用。

升级流程：先备份数据，再在源码目录执行 `git pull --ff-only`、`npm ci`、`npm run build`，停止服务、重新复制三个构建产物，最后启动服务。数据目录应继续沿用原路径。

网站密码、TLS 私钥和订阅数据不应上传到 GitHub。备份文件也可能包含私人订阅和收藏，应妥善保管。

## 开发与验证

```sh
npm ci
npm run typecheck
npm run build
npm test
npm run test:auth
```

| 命令 | 用途 |
| --- | --- |
| `npm run build` | 构建前端、打包服务端、复制数据库脚本 |
| `npm start` | 启动构建后的服务 |
| `npm run typecheck` | TypeScript 类型检查 |
| `npm test` | 解析、每日去重、持久化、RSSHub 模拟实例及文章切换 DOM 交互测试 |
| `npm run test:auth` | HTTP Basic 身份验证与写入来源校验测试 |
| `node tests/local-smoke.mjs` | 可选的真实订阅联调，需要访问外网 |

集成测试会启动临时服务并使用独立数据库，应在构建后执行。默认使用 8878、8879、8881 端口；请在未设置生产用 `RSS_*` 环境变量的终端中运行。

源码结构：

```text
app/                       阅读界面、主题、标签分组和布局
lib/
├── feed-parser.mjs        RSS / Atom / JSON Feed 解析
├── rss-core.ts            拉取、去重、更新和文章状态
├── rsshub.mjs             RSSHub 实例与路由处理
└── reader-filters.ts      标签筛选与已读操作范围
local/
├── main.tsx               前端入口
├── server.ts              HTTP(S)、鉴权、API 和定时任务
└── sqlite.ts              SQLite 适配与初始化
drizzle/                   数据库初始化 SQL
scripts/build-local.mjs    构建入口
deploy/shidu-rss.service   systemd 服务模板
tests/                     单元测试及服务集成测试
public/                    图标与主题初始化脚本
```

欢迎通过 [Issues](https://github.com/fatwltr/SHIDU/issues) 反馈问题。请附上 Node.js 版本、部署方式、可复现步骤和脱敏日志；修改代码后请运行上述检查。

## 常见问题

| 问题 | 排查方式 |
| --- | --- |
| `RSSHub 订阅失败：fetch failed` | 从拾读所在服务器检查实例和完整路由是否可访问，排查 DNS、网络、TLS 证书及 RSSHub 日志；需要登录的路由在 RSSHub 中配置 |
| 路由返回 403、404 或 503 | 检查路由拼写、实例版本、访问限制和上游站点状态；可更换或自建 RSSHub 实例 |
| 本机正常，公网无法访问 | 检查 systemd 日志、监听地址、TLS 和公开地址配置，以及系统防火墙与云侧入站规则 |
| 访问返回 401 | 检查网站用户名和密码；HTTP Basic 登录由浏览器弹窗完成 |
| 返回「访问地址无效」或「请求来源无效」 | 使用与 `RSS_PUBLIC_ORIGIN` 完全一致的协议、主机和端口；若自行加反向代理，需核对 Host 和 Origin 转发 |
| 修改 `.env` 没有效果 | 普通 `npm start` 不自动加载文件，使用 `node --env-file=.env .local/server.mjs`；systemd 部署修改其环境文件后重启 |
| 当天没有再次拉取 | 每个源每天仅尝试一次，失败也计入当天尝试；检查当天状态和次日更新结果 |
| 关机后没有按时更新 | 定时器在服务进程内运行，保持进程在线或使用 systemd |
| `EADDRINUSE` | 端口被占用，停止冲突进程或修改 `RSS_PORT`，远程模式同时修改公开地址和防火墙规则 |
| 提示缺少 `node:sqlite` | 检查实际运行服务的 Node.js 是否为 24+，尤其是 systemd 中的绝对路径 |
| 文章只有摘要 | 当前仅展示订阅源提供的纯文本摘要，点击「阅读完整原文」访问完整内容 |

## 当前限制

- 面向个人使用，采用单个共享账号，不提供多用户独立数据空间。
- 最多添加 30 个订阅源；每次解析每个源前 100 条文章。
- 阅读接口最多返回按发布时间排序的最近 2000 篇文章；更早的数据仍可能在数据库中，但不会显示在当前列表里。
- 单次订阅响应上限为 2,000,000 字节，拉取超时为 15 秒；摘要最多保存 2500 个字符。
- 普通订阅地址仅支持公开域名及标准 HTTP / HTTPS 端口；自建 RSSHub 可使用配置实例对应的本机或内网地址。
- 尚未提供 OPML 导入导出、全文抓取、应用内修改更新时间或绕过当天去重的强制刷新功能。
- 仓库暂未添加 `LICENSE` 文件。
