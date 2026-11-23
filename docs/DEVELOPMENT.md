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
- EPUB 目录映射、搜索摘要、键盘映射和按 spine 权重计算的进度。
- EPUB 主题、版心限制、Foliate 专用排版规则和 TXT 滚动布局。
- EPUB 单列配置与模式切换相关纯函数。
- EPUB XHTML/CSS 加固，覆盖脚本、事件属性、脚本 URL 和远程资源。
- VS Code 深灰主题和设置归一化。
- 通用格式化函数。

截至 2026-11-23，当前测试集为 10 个测试文件、45 项测试。

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
- 分页模式下检查 `foliate-view` 内部的 `renderer.page/pages`，连续翻页不重复或
  裁切。
- 切换到上下滚动后，内容可滚动，方向键和工具栏按钮按视口移动。
- 修改字号、行距和版心后，正文和外层分页容器一起重排。
- 切回分页模式后仍能从当前章节继续阅读。
- 在末页修改字号、行距或版心后仍停留在末页。
- 在章节中部切换分页/上下滚动后，页内比例保持接近。
- 字体和图片加载完成后，正文位置不应跳回章节开头。
- 末章必须显示原始 EPUB 的最后一段，且进度只在真正末页为 100%。
- 书架、阅读页和目录抽屉主题一致。
- 移动端目录抽屉可用。

完整内容审计方法和最新结果见 [CONTENT-AUDIT.md](CONTENT-AUDIT.md)。

## EPUB 调试要点

### 渲染引擎

- 正文渲染：`src/components/reader/epub/FoliateEpubReader.tsx`。
- 纯函数：`src/lib/reader/epub/foliate.ts`。
- 样式生成：`src/lib/reader/epub/theme.ts`。
- 渲染器配置在 `foliate-view.renderer` 上，不是在自定义元素 `foliate-view` 上。

分页模式：

```text
flow             = paginated
max-column-count = 1
max-inline-size  = 用户版心宽度
gap              = 7%
```

上下滚动模式只把 `flow` 改为 `scrolled`，不重建书籍。

### 分页宽度

不要通过 CSS 强行修改 Foliate iframe 的列宽。版心、栏间距、最大列数和阅读
模式都应通过 renderer 属性交给分页器计算。自定义 CSS 只负责纸张外框、动画、
主题色和进度滑块。

### 可见 Range 与进度

Foliate 的 `relocate` 事件给出当前可见 `Range`、节索引和节内比例。阅读器使用
可见 Range 生成 CFI，并按 spine 字节权重折算全书进度。验证重排时，应比较
操作前后的 `lastLocation.range`，不能只比较 CFI。

### 内容完整性

只比较 iframe `body.textContent` 不能证明用户逐页看到了全部内容。回归审计要把
每个分页状态的 `lastLocation.range.toString()` 拼接后，与章节正文的非空白字符
比较：

```text
normalize(page1.range + page2.range + ... + pageN.range)
  === normalize(section.body.textContent)
```

### 键盘焦点

iframe 内的键盘事件不会冒泡到父页面。EPUB 阅读器必须在 iframe 文档上注册自己的非 passive `keydown` 监听。

### 生命周期

- 切换书籍时调用 `foliate-view.close()` 并删除视图。
- EPUB 资源由 Foliate 的 loader 和浏览器 Blob 生命周期管理。
- 组件卸载时注销 `load`、`relocate` 和 iframe `keydown` 监听。

### 脚本 sandbox

EPUB XHTML 和 CSS 在渲染前经过本地加固，移除脚本、事件属性、脚本 URL、远程
资源、表单和自动刷新。页面 CSP 由 `src/proxy.ts` 生成 nonce，并禁止 EPUB
iframe 执行无 nonce 脚本。Foliate 的 iframe 仍带有 `allow-scripts` 以满足浏览器
兼容性；因此不要在加固流程中跳过 `book.transformTarget` 的 `data` 事件。

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
