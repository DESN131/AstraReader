# 开发指南

## 环境

- Node.js 24+
- npm 11+
- Windows PowerShell、macOS 或 Linux 均可

```powershell
npm install
npm run dev
```

默认访问 `http://localhost:3000`。开发和运行都监听 `0.0.0.0`，以便手机或平板访问。

## 常用命令

```powershell
npm run lint
npm run typecheck
npm test
npm run build
npm start
```

## 模块规则

- Client Component 不能导入 `src/server/**`、`better-sqlite3` 或 Node 文件系统。
- 共享输入验证放在 `src/shared/schemas.ts`。
- 所有文件路径从 `ASTRAREADER_DATA_DIR` 解析，并验证最终路径仍在数据根目录内。
- 上传文件只能由 Route Handler 返回，不能复制到 `public/` 中。
- 书库、阅读和统计页面显式使用动态渲染。
- 所有用户可见错误必须包含稳定的 error code，便于测试。

## 测试策略

- 单元测试：编码识别、章节目录、字符位置、哈希、路径校验。
- Route Handler 集成测试：上传、导入、重复、超限、删除、进度和书签。
- Playwright CLI：导入 TXT/EPUB、打开书、目录、搜索、书签、字体主题、移动端和刷新续读。
- 生产验收必须执行 `npm run build`，不能只验证开发服务器。

## Git 约定

每个可独立验证的阶段提交一次，例如：

- `docs: define AstraReader architecture`
- `feat(server): add local library persistence and import API`
- `feat(web): build library and reader experience`
- `test: cover import and reading flows`

不要提交 `data/`、`.next/`、`node_modules/`、测试产物或任何真实电子书。

## 清理开发数据

先停止开发服务器，再删除 `data/` 后重新启动即可创建空书库。不要在服务运行时直接删除 SQLite 文件。
