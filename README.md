# 拾读 SHIDU

私人 RSS 阅读器，支持 RSS、Atom、JSON Feed 和 RSSHub 路由，使用 React、Vite、Node.js 24 和 SQLite。

## 功能

- 每天北京时间 08:00 拉取一次；首次添加立即拉取，同日跳过重复任务，服务恢复后补拉当天任务。
- 订阅源按标签分组、折叠和筛选；未读、收藏、搜索及原文阅读。
- 侧栏宽度支持拖动、方向键调整，双击或 Enter 恢复默认，浏览器保存宽度。
- 极简白昼、深空终端、暖纸书房、森间晨雾四套主题，以及跟随系统。
- RSSHub 支持公共、自建和本机实例；实例地址在「添加订阅 → RSSHub 路由」中设置。
- 本地数据保存在 SQLite，远程部署支持 HTTPS 和独立的 HTTP Basic 登录保护。

## 本地运行

需要 Node.js 24 或更新版本。

```sh
npm ci
npm run build
npm start
```

打开 <http://127.0.0.1:8787/>。程序在后台运行时才会执行定时更新，关闭浏览器不会终止服务。`.local/` 是构建输出，`local-data/` 是本地数据库目录，两者均不提交。

## 验证

```sh
npm run typecheck
npm test
npm run test:auth
```

先构建，再执行集成测试。测试使用独立临时数据库；RSSHub 测试启动模拟实例。`tests/local-smoke.mjs` 可选地连接真实的少数派 RSS，运行它需要联网。

## 云服务器部署

1. 在构建机运行 `npm ci && npm run build`。
2. 将 `.local/server.mjs`、`.local/public/` 和 `.local/migrations/` 上传到服务器 `/opt/shidu-rss/.local/`。
3. 安装 Node.js 24，创建专用用户 `shidu-rss` 和其可写的数据目录 `/var/lib/shidu-rss`。
4. 参考 `.env.example` 创建 `/etc/shidu-rss/server.env`，设置公开访问地址、TLS 证书路径和新生成的网站密码。限制环境文件和私钥的读取权限。
5. 复制 `deploy/shidu-rss.service` 到 systemd，确认 `ExecStart` 与服务器 Node.js 安装路径一致，执行 `sudo systemctl daemon-reload` 和 `sudo systemctl enable --now shidu-rss`。
6. 在操作系统防火墙及云平台安全组中允许所选 TCP 端口。使用可信 TLS 证书，或在受控环境中核对自签名证书指纹。

服务默认只监听本机。对外监听必须同时配置 `RSS_PUBLIC_ORIGIN`、TLS 证书及私钥、`RSS_AUTH_PASSWORD`。应用不自动加载本地 `.env`，本地可通过 shell 设置环境变量，systemd 使用 `EnvironmentFile`。

`RSS_PORT` 默认为 8787，`RSS_DATA_DIR` 可覆盖数据目录。备份数据库时应停止服务或使用 SQLite 在线备份 API，避免遗漏 WAL 文件。

## RSSHub

在实例地址后填写 `/bilibili/ranking/0/3/1` 等路由，也支持 `rsshub://` 和完整 HTTP 链接。实例的网络可达性、路由可用性以及所需的 Cookie、Token 配置由 RSSHub 服务负责。本项目不内置 RSSHub 引擎。

## 源码与部署文件

`app/` 是阅读界面源码，`lib/` 是订阅解析和筛选逻辑，`local/` 是独立 Node 服务与 SQLite 适配，`scripts/build-local.mjs` 构建完整程序。此项目从本次开发记录恢复，并以现有云端部署文件核对；不包含真实订阅数据、网站密码、SSH 凭据或 TLS 私钥。
