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
- Foliate.js 尚未加载，或 renderer 属性被自定义 CSS/旧构建覆盖。

处理：

1. 确认执行了 `npm run build` 并重启 `npm start`。
2. 强制刷新页面。
3. 在无痕窗口或独立浏览器会话验证。
4. 检查控制台是否出现 `book.epub` 加载失败。
5. 检查阅读页是否有 `foliate-view`，且 `view.renderer` 已创建。

无头浏览器检查示例：

```powershell
npx --yes --package @playwright/cli playwright-cli -s=astra-test open http://127.0.0.1:3000
```

## 一屏显示两页、左侧串页或右侧被截断

当前 EPUB 正文由 Foliate.js 分页，不再改写 EPUB.js 私有 layout 字段。先确认
实际 renderer 配置：

```javascript
const view = document.querySelector("foliate-view");
const renderer = view.renderer;

console.log({
  flow: renderer.getAttribute("flow"),
  columns: renderer.getAttribute("max-column-count"),
  inline: renderer.getAttribute("max-inline-size"),
  gap: renderer.getAttribute("gap"),
  page: renderer.page,
  pages: renderer.pages,
});
```

正常分页应为：

```text
flow             = paginated
max-column-count = 1
max-inline-size  = 当前版心宽度
```

如果值不对，检查 `FoliateEpubReader.tsx` 的 `applyViewSettings()`。属性必须设置
在 `view.renderer` 上；设置在外层 `foliate-view` 不会生效。

检查页码是否单调变化：

```javascript
renderer.page;
renderer.pages;
```

连续点击下一页时，`page` 应在当前节内递增；到节末后应切换 section index。
不要再用 `scrollWidth % clientWidth` 判断 Foliate 的分页是否正确。

## 左右方向键不工作

键盘焦点可能在 EPUB iframe 内。父页面 `window` 收不到 iframe 键盘事件。

当前实现：

- 父页面 EPUB 容器处理普通方向键。
- EPUB iframe 文档处理 focus 在正文内的方向键。
- iframe 监听必须是非 passive。

如果只修好其中一处，就会出现“有时可以、有时不可以”。

## 翻页漏掉内容

检查：

- `renderer.page` 是否每次只递增 1。
- 节末是否只在最后一页后切换 section。
- 当前分页的 `lastLocation.range` 是否与下一分页连续。
- 是否同时触发了父页面和 iframe 的两次翻页。
- 是否仍运行旧 JS bundle。

真正的完整性检查应把当前节每一页的可见 Range 文本拼接，再与原始章节正文
比较。步骤见 [CONTENT-AUDIT.md](CONTENT-AUDIT.md)。

## 上下滚动正文变窄

滚动模式与分页模式共用同一个 Foliate renderer 和最大行宽。检查：

- renderer 的 `flow` 是否为 `scrolled`。
- `max-inline-size` 是否与分页模式相同。
- `.astra-epub-scrollbar` 是否覆盖在纸张边缘，而不是占用布局列。
- `foliate-view::part(container)` 是否隐藏了原生滚动条。

## 翻页后跳回章节开头

Foliate 使用当前可见 Range 作为重排锚点。若发生跳转：

1. 检查 `lastLocation.range` 是否为空。
2. 确认修改设置时调用的是同一个 renderer，而不是新建 view。
3. 确认 `applyViewSettings()` 在同一帧内设置 flow、版心、主题并调用
   `renderer.render()`。
4. 用隔离浏览器切换字号、行距、版心和阅读模式，比较操作前后的 Range 文本。

## 行距设置无效

EPUB 常在 `p`、`div` 或 class 上单独声明 `line-height`，只设置 `body`
不会覆盖这些规则。当前主题规则对 `body` 和全部正文后代使用用户行距，并保留
标题的独立行高。

检查 iframe 内正文段落的计算样式：

```javascript
const doc = document
  .querySelector("foliate-view")
  .renderer.getContents()[0].doc;
getComputedStyle(doc.querySelector("p")).lineHeight;
```

调整行距后该值应立即变化，分页模式的页数或滚动模式的 `scrollHeight`
也应随之变化。

## 最后一页内容看起来缺失

Foliate 提供每节实际页数、当前页和可见 Range。AstraReader 会将在最后一节
显示末页视为 100%；历史 100% 位置会通过 `goTo({ fraction: 1 })` 直接恢复到
末节末尾。

检查末页：

```javascript
const view = document.querySelector("foliate-view");
const doc = view.renderer.getContents()[0].doc;
doc.body.textContent.slice(-300);

view.lastLocation.range.toString();
```

最后一段应存在于 DOM，并且分页容器必须能到达最大滚动偏移。

## 控制台出现 Blocked script execution

如果消息指向 EPUB iframe 的 `about:srcdoc`，这是 sandbox 主动阻止电子书内嵌脚本的结果。

这是安全设计：

- 不执行 EPUB 中的 JavaScript。
- 不加载远程脚本。
- 书籍正文、图片和目录仍可显示。

不要通过增加 `allow-scripts` 来消除该日志。

## 控制台出现 iframe sandbox 警告

Foliate 为兼容浏览器 iframe 内容保留 `allow-scripts` 和 `allow-same-origin`，
Chrome 可能提示 sandbox 警告。书籍脚本在写入 iframe 前已经移除，加载后还会
再次加固 DOM。不要为了消除提示而删除加固流程。

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
- EPUB 百分比按 spine 字节大小和当前节内页比例计算，是阅读位置估值。
- `data/books/<id>/locations.json` 是旧版缓存，当前阅读器不再依赖。

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
