# AstraReader

AstraReader 是一个面向个人使用的本地电子书阅读器。它使用 Next.js 全栈架构，在浏览器中阅读 TXT 和 EPUB，支持书库管理、封面、目录、搜索、书签、阅读进度、字体和主题设置。

## 当前范围

- 支持 TXT 和 EPUB。
- 支持同一局域网内免登录访问。
- 不支持 PDF、MOBI、AZW3、DRM、批注、云同步和自定义字体上传。
- 仅适合可信局域网，不应暴露到公网。

## 快速开始

需要 Node.js 24 和 npm。

```powershell
npm install
npm run dev
```

打开 `http://localhost:3000`。开发服务同时监听局域网地址，其他设备可以通过终端输出的 Network 地址访问。

生产运行：

```powershell
npm run build
npm start
```

## 数据目录

默认数据位于项目根目录的 `data/`：

- `data/astra.db`：SQLite 数据库。
- `data/books/<id>/`：受管理的书籍原文、封面和阅读缓存。
- `data/imports/`：尚未完成的临时上传。

可以通过 `ASTRAREADER_DATA_DIR` 修改数据目录，通过 `ASTRAREADER_MAX_UPLOAD_MB` 修改单本上传上限。

备份时停止服务，然后复制整个数据目录。不要只复制运行中的 SQLite 文件。

## 文档

- [产品与架构设计](docs/DESIGN.md)
- [API 契约](docs/API.md)
- [开发指南](docs/DEVELOPMENT.md)
- [部署与备份](docs/DEPLOYMENT.md)

## 脚本

```powershell
npm run dev
npm run build
npm start
npm run lint
npm run typecheck
npm test
npm run test:e2e
```

## 安全说明

首版没有登录或访问控制。同一网络内的任何设备都可以读取、导入、修改和删除图书。请只绑定可信网络，不要做端口转发，也不要通过公网反向代理暴露服务。
