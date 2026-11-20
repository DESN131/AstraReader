# 开发与测试指南

## 环境

- Node.js 24+
- npm 11+
- Windows PowerShell、macOS 或 Linux
- 推荐现代 Chrome、Edge、Safari 或 Firefox

```powershell
npm install
npm run dev
```

开发和运行默认监听 `0.0.0.0:3000`。

## 环境变量

```powershell
$env:ASTRAREADER_DATA_DIR = "$env:USERPROFILE\AstraReaderData"
$env:ASTRAREADER_MAX_UPLOAD_MB = "500"
$env:PORT = "3000"
npm run dev
```

不设置时使用项目内 `./data`。

## 命令

| 命令 | 作用 |
| --- | --- |
| `npm run dev` | 启动开发服务器 |
| `npm run lint` | ESLint |
| `npm run typecheck` | TypeScript 类型检查 |
| `npm test` | Vitest 单元与组件测试 |
| `npm run test:watch` | Vitest watch 模式 |
| `npm run build` | Next.js 生产构建 |
| `npm start` | 启动已构建的生产服务 |

## 模块边界

- `src/server/**` 只能被 Server Component 或 Route Handler 引用。
- 服务端模块必须保持 `server-only`。
- Client Component 不得引用 SQLite、Node `fs`、`Readable` 或本地路径。
- 输入校验使用 `src/shared/schemas.ts`，不要在路由中另写一套规则。
- 浏览器端阅读设置通过 `src/lib/reader/settings.ts` 读写。
- 应用主题通过 `src/lib/reader/theme.ts` 写入全局 CSS 变量。
- 原始书籍和缓存不能放入 `public/`。

## 页面与 API

- 书库页由 Server Component 直接读取 SQLite。
- 阅读页由 Server Component 获取图书详情和初始进度。
- 交互更新通过同源 Route Handler。
- 所有动态页面与 API 显式使用动态渲染。
- 大型上传使用原始 `application/octet-stream`，不使用 `request.formData()` 或 Server Action。

## 开发数据

默认数据库和书籍位于 `data/`，该目录已被 Git 忽略。

重置空书库：

1. 停止服务。
2. 备份需要保留的 `data/`。
3. 删除或移动 `data/`。
4. 重新启动服务。

不要在服务运行时删除 WAL 数据库文件。

## 测试

### 单元与组件测试

```powershell
npm test
```

现有测试覆盖：

- TXT 编码、章节、分块、搜索和字符锚点。
- EPUB 导航、主题、搜索、位置和键盘映射。
- EPUB 分页/滚动键盘映射和 TXT 滚动布局。
- VS Code 深灰主题和设置归一化。
- 通用格式化函数。

### 构建检查

```powershell
npm run lint
npm run typecheck
npm test
npm run build
```

交付前四项必须全部通过。

### 浏览器验证

使用独立的 Playwright CLI 会话，不操作使用者当前正在使用的浏览器：

```powershell
npx --yes --package @playwright/cli playwright-cli -s=astra-test open http://127.0.0.1:3000
```

建议验证：

- 从书架点入 EPUB 后正文立即可见。
- iframe 内的左右键只翻一页。
- 翻页后章节标题不意外变化。
- 连续右翻再左翻能回到同一位置。
- 分页模式下检查 `scrollWidth` 是视口宽度的整数倍，连续翻页不重复或裁切。
- 切换到上下滚动后，内容可滚动，方向键和工具栏按钮按视口移动。
- 修改字号、行距和版心后，正文和外层分页容器一起重排。
- 切回分页模式后仍能从当前章节继续阅读。
- 书架、阅读页和目录抽屉主题一致。
- 移动端目录抽屉可用。

## EPUB 调试要点

### 分页宽度

EPUB.js 的分页步长必须等于真实页步长。当前实现使用 32px 栏间距，并在
EPUB.js 每次重算布局后修正实际列宽：

```text
viewport width = content column width + 32
page step      = viewport width
```

不能只通过 CSS 设置 `column-gap`。EPUB.js 的 `layout.calculate` 默认会把
列宽设成整个视口宽度，必须同步修正 `columnWidth`、`delta`、`pageWidth` 和
`spreadWidth`；否则栏间距会侵占正文，造成首尾字裁切或邻页混入。

### 键盘焦点

iframe 内的键盘事件不会冒泡到父页面。EPUB 阅读器必须在 iframe 文档上注册自己的非 passive `keydown` 监听。

### 生命周期

- 切换书籍时销毁 `rendition` 和 `book`。
- 回收 archive Blob URL。
- 不用旧 `window.unload`；使用组件卸载和 `pagehide`。

### 脚本 sandbox

EPUB iframe 禁止脚本执行。浏览器可能显示 “Blocked script execution” 的安全日志，这是预期行为，不应为了消除日志而开启脚本。

## Git 约定

每个可验证阶段单独提交，例如：

- `docs: ...`
- `feat(server): ...`
- `feat(web): ...`
- `fix(epub): ...`
- `test: ...`

不要提交 `data/`、`.next/`、`node_modules/`、`output/`、`.playwright-cli/` 或真实电子书。

## 常见开发问题

完整排障见 [TROUBLESHOOTING.md](TROUBLESHOOTING.md)。
