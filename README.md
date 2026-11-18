# AstraReader

AstraReader 是一个面向个人使用的本地电子书阅读器。它使用 Next.js 全栈架构，将书库、阅读进度和原始文件保存在自己的电脑上，不依赖云服务。

## 功能

- 导入、查重和管理 TXT、EPUB 图书。
- 显示 EPUB 内置封面，TXT 使用稳定的 CSS 占位封面。
- 查看、编辑和永久删除图书信息。
- 目录抽屉、书内搜索、书签、进度续读和基础阅读统计。
- TXT 编码识别、章节导航和字符偏移位置恢复。
- EPUB CFI 位置、locations 缓存、嵌套目录和键盘翻页。
- 字体、字号、行距、段距、版心宽度、页面主题和翻页动画。
- 书架、阅读正文、目录抽屉和设置面板共享当前主题。
- 桌面与移动端响应式布局，局域网内多设备共享书库和进度。

## 技术栈

| 层级 | 技术 |
| --- | --- |
| Web 框架 | Next.js 16 App Router |
| UI | React 19、Tailwind CSS 4、Radix UI、Lucide |
| EPUB | EPUB.js 0.3.93 |
| TXT | 自建编码检测、章节解析和 CSS 多栏分页 |
| 服务端 | Node.js 24、Route Handlers |
| 数据库 | SQLite、`better-sqlite3` |
| 测试 | Vitest、Testing Library、Playwright CLI |

## 快速开始

需要 Node.js 24 和 npm。

```powershell
npm install
npm run dev
```

打开 `http://localhost:3000`。其他设备使用终端输出的 Network 地址。

生产运行：

```powershell
npm run build
npm start
```

## 数据目录

默认数据位于项目根目录的 `data/`：

```text
data/
├─ astra.db
├─ books/<book-id>/
│  ├─ book.txt | book.epub
│  ├─ cover-<uuid>.webp
│  └─ locations.json
└─ imports/<upload-id>/
```

可通过环境变量调整：

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `ASTRAREADER_DATA_DIR` | `./data` | 数据根目录 |
| `ASTRAREADER_MAX_UPLOAD_MB` | `500` | 单本上传上限 |
| `PORT` | `3000` | Next.js 监听端口 |

备份时应停止服务，然后复制整个数据目录。不要在服务运行时只复制 `astra.db`。

## 常用命令

```powershell
npm run dev
npm run lint
npm run typecheck
npm test
npm run build
npm start
```

## 文档

- [文档索引与阅读顺序](docs/README.md)
- [产品与架构设计](docs/DESIGN.md)
- [HTTP API 契约](docs/API.md)
- [开发与测试指南](docs/DEVELOPMENT.md)
- [部署、备份与升级](docs/DEPLOYMENT.md)
- [故障排查](docs/TROUBLESHOOTING.md)
- [变更记录](docs/CHANGELOG.md)

## 当前限制

- 不支持 PDF、MOBI、AZW3、DRM 电子书。
- 不支持批注、笔记、TTS、OCR、云同步和自定义字体上传。
- 没有登录、用户和权限系统。
- 主题偏好保存在各自浏览器；书库、进度和书签保存在共享服务端。
- 服务只适合可信家庭或个人局域网，不应直接暴露到公网。

## 安全提示

同一局域网内任何能访问该端口的设备都可以读取、导入、修改和永久删除图书。请勿进行公网端口转发；跨网络访问前应先增加 HTTPS、身份认证和访问审计。
