# HTTP API 契约

## 通用约定

- API 由 Next.js App Router Route Handlers 提供。
- 所有接口使用同源请求，不提供 CORS。
- 修改请求如果带有 `Origin`，必须与 `Host` 同源，否则返回 `403 CROSS_ORIGIN_FORBIDDEN`。
- 动态响应使用 `Cache-Control: no-store`。
- JSON 错误结构：

```json
{
  "error": {
    "code": "BOOK_NOT_FOUND",
    "message": "未找到这本书"
  }
}
```

## 路由总览

| 方法 | 路径 | 作用 |
| --- | --- | --- |
| `GET` | `/api/books` | 查询书库 |
| `POST` | `/api/books` | 完成图书导入 |
| `GET` | `/api/books/:id` | 获取图书详情、进度和书签 |
| `PATCH` | `/api/books/:id` | 更新元数据、编码或封面 |
| `DELETE` | `/api/books/:id` | 永久删除图书 |
| `GET` | `/api/books/:id/file` | 流式读取书籍原文 |
| `GET` | `/api/books/:id/cover` | 读取封面 |
| `GET` | `/api/books/by-hash/:sha256` | 按哈希查重 |
| `POST` | `/api/uploads/book` | 原始字节流上传 |
| `GET` | `/api/books/:id/progress` | 读取进度 |
| `PUT` | `/api/books/:id/progress` | 保存进度 |
| `GET` | `/api/books/:id/locations` | 读取 EPUB locations |
| `PUT` | `/api/books/:id/locations` | 保存 EPUB locations |
| `GET` | `/api/books/:id/bookmarks` | 列出书签 |
| `POST` | `/api/books/:id/bookmarks` | 创建书签 |
| `DELETE` | `/api/books/:id/bookmarks/:bookmarkId` | 删除书签 |
| `POST` | `/api/reading-time` | 增加阅读时长 |
| `GET` | `/api/stats` | 获取统计汇总 |

## 图书查询

### `GET /api/books`

查询参数：

| 参数 | 可选值 | 默认值 |
| --- | --- | --- |
| `q` | 标题、作者或原始文件名的模糊匹配 | 空 |
| `format` | `txt`、`epub` | 全部 |
| `sort` | `recent`、`title`、`added` | `recent` |

返回 `Book[]`。

### `GET /api/books/by-hash/:sha256`

- `sha256` 必须是 64 位十六进制字符串。
- 存在时返回 `Book`。
- 不存在时返回 HTTP `200` 和 `null`。
- 格式错误返回 `422 INVALID_HASH`。

### `GET /api/books/:id`

返回 `BookDetails`：

```json
{
  "id": "uuid",
  "format": "epub",
  "title": "书名",
  "author": "作者",
  "description": "",
  "language": "zh-CN",
  "publisher": "",
  "publishedAt": "",
  "originalFilename": "book.epub",
  "fileSize": 12345,
  "sha256": "...",
  "coverUrl": "/api/books/uuid/cover",
  "textEncoding": "utf-8",
  "createdAt": "ISO-8601",
  "updatedAt": "ISO-8601",
  "lastOpenedAt": "ISO-8601",
  "progressPercentage": 0.42,
  "progress": {
    "bookId": "uuid",
    "location": {
      "kind": "epub-cfi",
      "cfi": "epubcfi(...)",
      "href": "chapter.xhtml"
    },
    "percentage": 0.42,
    "chapterLabel": "第三章",
    "updatedAt": "ISO-8601"
  },
  "bookmarks": []
}
```

## 上传与导入

### `POST /api/uploads/book`

请求：

```http
Content-Type: application/octet-stream
X-Astra-Filename: encodeURIComponent(filename)
```

请求体是原始文件流，不是 multipart。服务端边写临时文件边计算 SHA-256，并返回：

```json
{
  "uploadId": "uuid",
  "size": 123456,
  "sha256": "64-char-hex"
}
```

成功状态为 `201`。缺失文件体返回 `400 EMPTY_UPLOAD`，超限返回 `413 UPLOAD_TOO_LARGE`。

### `POST /api/books`

完成导入：

```json
{
  "uploadId": "uuid",
  "sha256": "64-char-hex",
  "format": "epub",
  "originalFilename": "book.epub",
  "metadata": {
    "title": "书名",
    "author": "作者",
    "description": "",
    "language": "zh-CN",
    "publisher": "",
    "publishedAt": ""
  },
  "textEncoding": "utf-8",
  "coverDataUrl": "data:image/webp;base64,..."
}
```

`coverDataUrl` 可省略。成功返回 `201` 和 `Book`；重复文件返回 `409 DUPLICATE_BOOK`。

## 更新与删除

### `PATCH /api/books/:id`

```json
{
  "metadata": {
    "title": "新书名",
    "author": "作者",
    "description": "简介",
    "language": "zh-CN",
    "publisher": "",
    "publishedAt": ""
  },
  "textEncoding": "utf-8",
  "coverDataUrl": "data:image/webp;base64,..."
}
```

`textEncoding` 和 `coverDataUrl` 可省略。成功返回更新后的 `Book`。

### `DELETE /api/books/:id`

成功返回 `204`。删除数据库关联记录、原文、封面和缓存。

## 文件

### `GET /api/books/:id/file`

- EPUB 返回 `application/epub+zip`。
- TXT 返回 `text/plain`。
- 使用 Node 文件流转换后的 Web Stream 响应。
- 当前不实现 HTTP Range。
- 响应设置 `X-Content-Type-Options: nosniff`。

### `GET /api/books/:id/cover`

返回数据库中保存的 WebP、JPEG 或 PNG 封面。没有封面返回 `404 COVER_NOT_FOUND`。

## 阅读进度

### `GET /api/books/:id/progress`

返回 `ReadingProgress` 或 `null`。

### `PUT /api/books/:id/progress`

```json
{
  "location": {
    "kind": "epub-cfi",
    "cfi": "epubcfi(...)",
    "href": "chapter.xhtml"
  },
  "percentage": 0.42,
  "chapterLabel": "第三章"
}
```

TXT 位置：

```json
{
  "kind": "txt-offset",
  "offset": 12345,
  "chapterId": "chapter-2"
}
```

`percentage` 范围为 `0` 到 `1`。每本书只保留最新进度，最后写入覆盖。

EPUB 客户端会结合 CFI 和当前节内实际滚动比例更新 `percentage`；API 本身只保存
客户端提交的位置，不负责判断该 CFI 是否覆盖了多个分页列。TXT 应提交可见内容
对应的字符偏移。

## EPUB Locations

### `GET /api/books/:id/locations`

- 缓存存在时返回 JSON。
- 尚未生成时返回 `200 null`。

### `PUT /api/books/:id/locations`

- 必须使用 `application/json`。
- 最大 20 MiB。
- 成功返回 `204`。

## 书签

### `GET /api/books/:id/bookmarks`

按创建时间倒序返回 `Bookmark[]`。

### `POST /api/books/:id/bookmarks`

```json
{
  "location": {
    "kind": "txt-offset",
    "offset": 1234,
    "chapterId": "chapter-1"
  },
  "label": "第一章",
  "excerpt": "书签附近的短文本"
}
```

成功返回 `201` 和 `Bookmark`。

### `DELETE /api/books/:id/bookmarks/:bookmarkId`

成功返回 `204`。

## 统计

### `POST /api/reading-time`

```json
{
  "bookId": "uuid",
  "day": "2026-11-19",
  "seconds": 30
}
```

同一本书同一天会累加。成功返回 `204`。

### `GET /api/stats`

```json
{
  "totalSeconds": 12345,
  "activeDays": 8,
  "topBooks": [
    {
      "bookId": "uuid",
      "title": "书名",
      "seconds": 3600
    }
  ]
}
```

## 状态码

| 状态 | 常见代码 | 含义 |
| --- | --- | --- |
| `400` | `INVALID_JSON`、`EMPTY_UPLOAD` | 请求格式错误 |
| `403` | `CROSS_ORIGIN_FORBIDDEN` | 写请求跨来源 |
| `404` | `BOOK_NOT_FOUND`、`COVER_NOT_FOUND` | 资源不存在 |
| `409` | `DUPLICATE_BOOK`、`CONFLICT` | 重复或数据库冲突 |
| `413` | `UPLOAD_TOO_LARGE`、`COVER_TOO_LARGE` | 超过大小限制 |
| `422` | `VALIDATION_ERROR`、`INVALID_FORMAT` | 字段或格式不合法 |
| `500` | `INTERNAL_ERROR` | 未处理的服务端错误 |

## 当前限制

- 单本图书默认 500 MiB。
- 封面 Data URL 最大 4,000,000 字符。
- locations 最大 20 MiB。
- 不存在认证、用户或权限接口。
- 不存在正文修改、导出或批量编辑接口。
- 内容完整性校验在浏览器阅读器中执行，不提供服务端审计接口。
