# API 契约

所有接口均为同源 JSON 或流式接口。错误统一返回：

```json
{
  "error": {
    "code": "BOOK_NOT_FOUND",
    "message": "未找到这本书"
  }
}
```

## 图书

### `GET /api/books`

查询参数：`q`、`format`、`sort`（`recent`、`title`、`added`）。返回 `Book[]`。

### `GET /api/books/by-hash/:sha256`

- `200`：存在时返回 `Book`，不存在时返回 `null`。

### `POST /api/uploads/book`

请求体是原始文件字节。请求头：

- `X-Astra-Filename`：经过 URI 编码的文件名。
- `Content-Type`：`application/octet-stream`。

返回 `UploadBookResponse`：

```json
{
  "uploadId": "uuid",
  "size": 123456,
  "sha256": "64-char-hex"
}
```

### `POST /api/books`

完成导入，使用 `FinalizeBookRequest`。成功返回 `Book`。重复哈希返回 `409 DUPLICATE_BOOK`。

### `PATCH /api/books/:id`

请求体：

```json
{
  "metadata": {
    "title": "书名",
    "author": "作者",
    "description": "",
    "language": "zh",
    "publisher": "",
    "publishedAt": ""
  },
  "textEncoding": "utf-8",
  "coverDataUrl": "data:image/webp;base64,..."
}
```

`textEncoding` 和 `coverDataUrl` 可省略。返回更新后的 `Book`。

### `DELETE /api/books/:id`

成功返回 `204`，并删除文件、缓存、进度、书签和统计。

### `GET /api/books/:id/file`

以原始字节流返回书籍。禁止将该文件暴露在 `public/` 中。

### `GET /api/books/:id/cover`

返回封面图片；没有封面时返回 `404`。

## 阅读数据

### `GET /api/books/:id`

返回 `BookDetails`，包含最新进度和书签。

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

TXT 使用 `{ "kind": "txt-offset", "offset": 12345, "chapterId": "chapter-2" }`。

### `GET|PUT /api/books/:id/locations`

读取或保存 EPUB locations JSON。GET 在缓存尚未生成时返回 `null`。PUT 只接受 `application/json`，单本上限 20 MiB。

### `GET|POST /api/books/:id/bookmarks`

POST 请求体：

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

### `DELETE /api/books/:id/bookmarks/:bookmarkId`

成功返回 `204`。

## 统计

### `POST /api/reading-time`

```json
{
  "bookId": "uuid",
  "day": "2026-11-18",
  "seconds": 30
}
```

### `GET /api/stats`

返回：

```json
{
  "totalSeconds": 12345,
  "activeDays": 8,
  "topBooks": [
    { "bookId": "uuid", "title": "书名", "seconds": 3600 }
  ]
}
```

## 限制

- 单本图书默认上限 500 MiB。
- 封面 Data URL 最大 4,000,000 字符。
- locations 缓存最大 20 MiB。
- 所有写接口拒绝跨来源请求。
- 所有动态数据响应使用 `Cache-Control: no-store`。
