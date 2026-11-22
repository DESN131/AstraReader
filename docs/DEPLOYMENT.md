# 部署、备份与升级

## 适用场景

- Windows、macOS 或 Linux 上单机运行。
- 同一可信局域网内由电脑、平板和手机访问。
- 单 Node.js 进程和单 SQLite 数据库。

不适用于公网、多租户、多实例共享同一 SQLite 文件的场景。

## 安装

需要 Node.js 24 和 npm。

```powershell
npm ci
npm run build
npm start
```

`npm start` 使用：

```text
next start --hostname 0.0.0.0 --port 3000
```

默认访问：

```text
本机   http://localhost:3000
局域网 http://<本机局域网IP>:3000
```

## 环境变量

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `ASTRAREADER_DATA_DIR` | `./data` | 数据库、原文、封面和上传临时目录 |
| `ASTRAREADER_MAX_UPLOAD_MB` | `500` | 单本原始文件上限 |
| `PORT` | `3000` | HTTP 端口 |

推荐把数据目录放到稳定磁盘：

```powershell
$env:ASTRAREADER_DATA_DIR = "$env:USERPROFILE\AstraReaderData"
$env:PORT = "3000"
npm start
```

## Windows 防火墙

如果其他设备无法访问，需要在 Windows 防火墙中允许 TCP 3000。以下命令需要管理员 PowerShell：

```powershell
New-NetFirewallRule `
  -DisplayName "AstraReader 3000" `
  -Direction Inbound `
  -Protocol TCP `
  -LocalPort 3000 `
  -Action Allow
```

只应在可信网络配置文件中启用。不要建立公网端口映射。

## 网络安全

当前版本没有认证。绑定 `0.0.0.0` 后，同一局域网内任何能访问端口的设备都可以：

- 查看和下载全部书籍。
- 导入、编辑和永久删除图书。
- 修改阅读进度和书签。

必须遵守：

- 只在可信家庭或个人局域网运行。
- 不通过路由器端口转发暴露到公网。
- 不通过无认证的公网反向代理暴露。
- 如果未来需要跨网络访问，先增加 HTTPS、身份认证、访问控制和审计。

## 健康检查

```powershell
Invoke-WebRequest http://127.0.0.1:3000 -UseBasicParsing
Invoke-RestMethod http://127.0.0.1:3000/api/books
```

检查监听：

```powershell
Get-NetTCPConnection -LocalPort 3000 -State Listen
```

## 备份

1. 停止服务。
2. 复制整个数据目录。

```powershell
$source = "$env:USERPROFILE\AstraReaderData"
$backup = "$env:USERPROFILE\AstraReaderBackup-$(Get-Date -Format yyyyMMdd-HHmmss)"
Copy-Item -LiteralPath $source -Destination $backup -Recurse
```

必须备份：

- `astra.db`
- `books/`
- 任何保留的 `imports/`

不要只在服务运行时复制 `astra.db`。SQLite 可能还有 `-wal` 和 `-shm` 文件。

## 恢复

1. 停止服务。
2. 移动当前数据目录作为额外备份。
3. 把备份目录内容恢复到 `ASTRAREADER_DATA_DIR`。
4. 启动服务。
5. 打开书库，验证封面、阅读进度和一个 EPUB、一个 TXT。

## 升级

1. 备份数据目录。
2. 拉取新代码。
3. 执行 `npm ci`。
4. 执行 `npm run build`。
5. 停止旧进程。
6. 启动 `npm start`。

数据库迁移在首次访问数据库时幂等执行。

升级后检查：

- 首页书库可见。
- EPUB 封面和目录可见。
- 连续翻页不跨章节。
- iframe 内左右键可翻页。
- 末章能够显示真正最后一段，进度只在末页为 100%。
- 在章节中部切换排版或阅读模式后，不会跳回节首。
- 控制台没有持续出现 `EPUB layout guard rebuilding columns`。
- 主题在书架、正文和目录保持一致。

如果更新涉及 EPUB.js、分页 CSS 或阅读器布局，还应按
[CONTENT-AUDIT.md](CONTENT-AUDIT.md) 重新执行内容完整性审计。

## 回滚

1. 停止服务。
2. 切回上一版代码。
3. 执行 `npm ci` 和 `npm run build`。
4. 恢复与上一版匹配的数据备份。
5. 启动服务。

数据库迁移通常向前兼容，但涉及 schema 变更时不能依赖自动降级，因此回滚前应恢复备份。

## 进程与日志

前台运行：

```powershell
npm start
```

后台运行时应把 stdout 和 stderr 重定向到文件，并确保只启动一个进程。重复启动前先检查端口占用：

```powershell
Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue
```

## 数据迁移

迁移到另一台电脑：

1. 在新电脑安装相同或更新版本的 AstraReader。
2. 停止服务。
3. 复制整个数据目录。
4. 设置 `ASTRAREADER_DATA_DIR`。
5. 启动并验证。

路径是相对数据根目录保存的，因此整个目录迁移后不需要修改数据库中的文件路径。
