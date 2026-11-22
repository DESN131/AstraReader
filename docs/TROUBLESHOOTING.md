# 故障排查

## 快速检查

```powershell
Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue
Invoke-WebRequest http://127.0.0.1:3000 -UseBasicParsing
Invoke-RestMethod http://127.0.0.1:3000/api/books
git status --short
git log --oneline -5
```

如果刚刚修改过源码，必须重新执行：

```powershell
npm run build
```

并重启 `npm start`。`next start` 不会自动读取未构建的源码。

## 从书架进入后正文空白

可能原因：

- 浏览器仍加载旧构建。
- 阅读器容器初始高度异常。
- 自定义主题或旧 CSS 覆盖了 EPUB.js 布局。

处理：

1. 确认执行了 `npm run build` 并重启 `npm start`。
2. 强制刷新页面。
3. 在无痕窗口或独立浏览器会话验证。
4. 检查控制台是否出现 `book.epub` 加载失败。
5. 检查阅读页是否有 `.epub-container`。

无头浏览器检查示例：

```powershell
npx --yes --package @playwright/cli playwright-cli -s=astra-test open http://127.0.0.1:3000
```

## 一屏显示两页或左右被截断

这是 EPUB 分页步长与真实列步长不一致。

正确关系：

```text
viewport width = content column width + 32
page step      = viewport width
```

当前实现使用 32px 栏间距，并在 EPUB.js 重新计算布局后同步修正实际列宽、
`delta` 和 `pageWidth`。正文左右各保留 16px 内边距，避免字形贴边。

正常情况下：

- `.epub-container` 的 `scrollLeft` 应为页宽的整数倍。
- 一屏只应显示一列。
- 连续右翻、左翻后章节不应意外变化。

## 左右方向键不工作

键盘焦点可能在 EPUB iframe 内。父页面 `window` 收不到 iframe 键盘事件。

当前实现需要：

- 父页面处理普通方向键。
- EPUB iframe 文档处理 focus 在正文内的方向键。
- iframe 监听必须是非 passive。

如果只修好其中一处，就会出现“有时可以、有时不可以”。

## 翻页漏掉内容

检查：

- EPUB.js 的 `gap` 是否为 32，且实际列宽是否为视口宽度减 32。
- 翻页前是否执行了旧布局自检和列宽重建。
- 页面恢复是否落在页边界。
- 是否同时触发了父页面和 iframe 的两次翻页。
- 是否仍运行旧 JS bundle。

如果切换到上下滚动后内容仍然不可见，检查 `.epub-container` 的
`scrollHeight` 是否大于 `clientHeight`，以及阅读方式切换后是否创建了新的
`rendition`。当前实现会在分页和滚动之间重建 rendition，以当前 CFI 恢复。

如果正文贴住纸张左右边框，检查 `.astra-epub-viewport` 是否应用了
`--epub-page-inset`。安全边距必须在 EPUB.js 视口外层留出，而不是直接给
内部的 CSS 列增加 padding，否则会破坏分页步长。

上下滚动模式隐藏原生占位滚动条，使用纸张右边缘的悬浮滚动条。滚动条不参与
正文宽度计算；正文左右内边距固定为 `16px`，与分页模式的实际文本列一致。
拖动滑块、点击轨道和滚轮均可滚动。

翻页后 `.epub-container.scrollLeft` 应稳定按页宽递增或递减。

## 行距设置无效

EPUB 常在 `p`、`div` 或 class 上单独声明 `line-height`，只设置 `body`
不会覆盖这些规则。当前主题规则对 `body` 和全部正文后代使用用户行距，并保留
标题的独立行高。

检查 iframe 内正文段落的计算样式：

```javascript
getComputedStyle(
  document.querySelector(".astra-epub-viewport iframe").contentDocument.querySelector("p")
).lineHeight;
```

调整行距后该值应立即变化，分页模式的页数或滚动模式的 `scrollHeight`
也应随之变化。

## 控制台出现 Blocked script execution

如果消息指向 EPUB iframe 的 `about:srcdoc`，这是 sandbox 主动阻止电子书内嵌脚本的结果。

这是安全设计：

- 不执行 EPUB 中的 JavaScript。
- 不加载远程脚本。
- 书籍正文、图片和目录仍可显示。

不要通过增加 `allow-scripts` 来消除该日志。

## 控制台出现 unload 权限违规

旧版 EPUB.js 会注册 `window.unload`。当前实现已在创建 rendition 时过滤该监听。

如果仍出现：

- 确认运行的是最新构建。
- 检查是否还有旧 `next start` 进程占用端口。
- 重建并重启。

## 导入失败

### `409 DUPLICATE_BOOK`

相同 SHA-256 已存在。直接打开已有图书，或删除旧书后重新导入。

### `413 UPLOAD_TOO_LARGE`

文件超过 `ASTRAREADER_MAX_UPLOAD_MB`。提高环境变量并重启服务。

### `422 INVALID_EPUB`

文件不是有效 ZIP/EPUB 容器，或扩展名与内容不符。

### `422 VALIDATION_ERROR`

元数据字段不符合 schema，检查标题、编码或封面 Data URL。

### 上传中断

重新导入。服务端会删除失败上传的临时目录；超过 24 小时的未完成会话会自动清理。

## EPUB 封面不显示

- 某些 EPUB 没有声明 cover-image。
- 封面资源可能损坏。
- 图片格式可能不受浏览器支持。

应用会使用 CSS 占位封面，不影响正文阅读。可在图书信息编辑中手动上传封面。

## 阅读进度没有恢复

- EPUB 使用 CFI，书籍内容或版本变化可能让旧 CFI 失效。
- TXT 使用字符偏移，重新保存或转换编码可能改变偏移。
- locations 尚未生成时百分比是估算值。

检查：

```powershell
Invoke-RestMethod http://127.0.0.1:3000/api/books/<id>/progress
```

无效位置会回退到 EPUB 书脊第一项（通常是封面）或书籍开头。

## 局域网设备无法访问

1. 确认服务监听 `0.0.0.0:3000`。
2. 用部署电脑访问 `http://127.0.0.1:3000`。
3. 用部署电脑访问自己的局域网 IP。
4. 检查 Windows 防火墙入站规则。
5. 确认手机和电脑在同一网段。
6. 检查 VPN、虚拟网卡或访客网络隔离。

## 端口已被占用

```powershell
Get-NetTCPConnection -LocalPort 3000 -State Listen
```

停止占用进程或换端口：

```powershell
$env:PORT = "3100"
npm start
```

## SQLite 数据库锁定

- 确认只有一个生产 Node 进程。
- 不要同时运行多个 `next start` 写入同一数据目录。
- 确保 `data/` 所在磁盘可写。
- 停止服务后再执行文件级备份或移动。

## 主题没有同步到书架或目录

- 主题设置按浏览器保存在 `localStorage`。
- 当前浏览器应包含 `astra-reader:settings:v1`。
- 清除站点数据会重置主题，但不会影响服务端进度。
- 确认运行的是包含全局主题 CSS 变量的最新构建。

## 生产环境仍是旧界面或旧行为

这是本地 Next.js 部署最常见的问题。

```powershell
npm run build
npm start
```

如果 3000 端口已有旧进程，先停止旧进程再启动。仅修改 `.tsx` 或 `.css` 文件不会改变正在运行的 `next start` 输出。
