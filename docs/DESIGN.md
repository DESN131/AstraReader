# AstraReader 产品与架构设计

## 目标

AstraReader 是一个单用户、本地自托管的网页电子书阅读器。它优先保证阅读体验、书库可维护性和设备间共享进度，不追求多用户、云服务或商业化能力。

首版成功标准：

- 可以从浏览器一次导入一本或多本 TXT/EPUB。
- 自动显示 EPUB 封面；缺失时显示稳定的 CSS 占位封面。
- 可以查看和编辑图书信息，并永久删除图书。
- 阅读器具备左侧可折叠目录、书内搜索、书签、进度续读和基础阅读统计。
- TXT/EPUB 支持字体、字号、行距、内容宽度、主题和滑动/淡入翻页。
- 桌面、平板和手机均可使用，阅读进度保存在服务端。
- 无需登录即可从可信局域网访问。

## 技术栈

- Next.js 16 App Router、React 19、TypeScript。
- Tailwind CSS 4，Radix UI 基础交互组件，Lucide 图标。
- EPUB.js 渲染 EPUB；TXT 使用应用自建的编码检测、章节解析和多栏分页。
- SQLite + `better-sqlite3` 保存元数据、进度、书签和统计。
- 本地文件系统保存书籍原文、封面和 EPUB locations 缓存。
- Vitest、Testing Library 和 Playwright 用于自动化测试。

## 运行架构

```text
Browser
  ├─ Server Component pages: 书库、阅读页初始数据、统计
  ├─ Client Components: 导入、目录、阅读器、设置、元数据编辑
  └─ Route Handlers: 上传、文件流、元数据、进度、书签、统计
          │
          ├─ better-sqlite3 -> data/astra.db
          └─ Node fs         -> data/books, data/imports
```

应用使用标准 Node.js 自托管，不使用 Cloudflare/Edge runtime，也不做静态导出。`next build` 之后由 `next start --hostname 0.0.0.0` 提供服务。

## 目录边界

```text
src/app/          页面与 Route Handlers
src/components/   书库、阅读器与 UI 组件
src/lib/          浏览器端工具与阅读器实现
src/server/       仅服务端：SQLite、文件、查询和事务
src/shared/       客户端与服务端共享的类型和 Zod schema
data/             运行时数据，永不进入 public 或 Git
docs/             设计、接口、开发和部署文档
```

`src/server/*` 必须包含 `server-only` 导入，不得被 Client Component 引用。

## 导入流程

1. 浏览器读取文件，计算 SHA-256 并识别 TXT/EPUB。
2. EPUB 通过 EPUB.js 读取 OPF 元数据、目录和封面；TXT 检测 BOM 与编码。
3. 浏览器将封面缩放为不超过 600 × 900 的 WebP。
4. 先按哈希查询是否已存在同一本书。
5. 通过 `POST /api/uploads/book` 以原始字节流上传文件。
6. 服务端流式写临时文件，同时校验大小和哈希。
7. 通过 `POST /api/books` 提交元数据和封面。服务端原子移动文件、写数据库并返回新书。
8. 失败、断流或超过 24 小时的临时上传会被清理。

单本上限默认 500 MiB。大文件不得通过 `request.formData()` 或 Server Action 导入。

## 阅读器设计

公共 `ReaderAdapter` 统一 PDF 之外各格式的阅读操作：

- 加载与销毁。
- 上一页、下一页、跳转。
- 读取当前位置。
- 应用字体、字号、主题和动画设置。
- 读取目录。
- 搜索并返回可跳转结果。

EPUB 使用 CFI 保存位置，并通过 `book.locations` 计算百分比。locations 生成结果写入 `data/books/<id>/locations.json`。

TXT 保存绝对字符偏移。章节按常见中英文标题识别；无章节时作为单一“正文”。正文按段落边界分块，通过固定视口 CSS 多栏分页，窗口和字号变化后使用字符锚点恢复。

阅读设置保存在 `localStorage`。进度、书签和统计存储在 SQLite，以便不同设备共享。

## 数据模型

- `books`：图书元数据、格式、编码、文件路径、封面路径、大小、哈希和时间。
- `reading_progress`：每本书一条最新进度，最后写入覆盖。
- `bookmarks`：EPUB CFI 或 TXT 字符偏移、摘要和创建时间。
- `reading_stats`：按书籍和本地日期累计阅读秒数。
- `upload_sessions`：未完成上传的令牌、临时目录和过期时间。
- `schema_migrations`：数据库迁移版本。

书籍路径必须来自数据库生成的 UUID，不接受用户提供的路径。删除时先移动目录到临时位置，数据库事务成功后再清空。

## UI 方向

界面是工作型阅读工具，不是营销页。首页直接显示继续阅读和全部图书，封面是主要视觉信息。整体使用石墨色、纸张色和青绿色强调色，不使用大面积渐变、装饰球或嵌套卡片。

桌面阅读页为可折叠左侧抽屉加中央正文；移动端抽屉覆盖全屏。所有图标按钮都有 tooltip 或 aria-label。动画尊重 `prefers-reduced-motion`。

## 明确不做

- 登录、用户、权限和会话。
- HTTPS 与公网部署。
- PDF、MOBI、AZW3、DRM。
- 自定义字体上传、批注、笔记、TTS、OCR。
- 云同步、自动备份、回收站和内容推荐。
