# AstraReader 文档

本文档目录记录当前实现，而不是最初的构想。修改行为、接口或部署方式时，应同步更新对应文档。

## 推荐阅读顺序

1. [产品与架构设计](DESIGN.md)：范围、架构、数据流和关键技术决策。
2. [HTTP API 契约](API.md)：前后端接口、状态码、请求和响应结构。
3. [开发与测试指南](DEVELOPMENT.md)：本地开发、模块规则、测试和质量门槛。
4. [部署、备份与升级](DEPLOYMENT.md)：Windows 本地生产运行和运维步骤。
5. [故障排查](TROUBLESHOOTING.md)：常见症状、诊断命令和修复方式。
6. [变更记录](CHANGELOG.md)：功能阶段和重要修复。
7. [EPUB 内容完整性审计](CONTENT-AUDIT.md)：书脊正文与阅读器渲染结果的全量对比。
8. [发布到 GitHub 前的隐私检查](GITHUB.md)：提交历史、数据目录和发布清单。

## 文档状态

| 文档 | 维护内容 |
| --- | --- |
| `README.md` | 快速开始、功能范围和文档入口 |
| `DESIGN.md` | 架构、阅读引擎、主题、数据和关键不变量 |
| `API.md` | Route Handler 方法、请求体、响应和错误 |
| `DEVELOPMENT.md` | 开发流程、代码边界、测试和调试 |
| `DEPLOYMENT.md` | 生产启动、网络安全、备份、恢复和升级 |
| `TROUBLESHOOTING.md` | 按症状定位问题 |
| `CHANGELOG.md` | 阶段性变更和关键修复 |
| `CONTENT-AUDIT.md` | 原始 EPUB 与阅读器渲染内容的完整性审计 |
| `GITHUB.md` | GitHub 发布前的隐私、数据和仓库检查清单 |

## 事实来源

出现文档与实现不一致时，按以下顺序确认真实行为：

1. `src/shared/types.ts` 和 `src/shared/schemas.ts`
2. `src/app/api/**/route.ts`
3. `src/server/**`
4. `src/components/reader/**` 和 `src/lib/reader/**`
5. 本文档目录

修改契约时，应同时更新类型、测试和 `API.md`。
