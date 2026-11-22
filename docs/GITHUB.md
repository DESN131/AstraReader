# 发布到 GitHub 前的隐私检查

## 当前工作区结论

已检查当前 Git 跟踪文件：

- `data/`、`output/`、`.next/`、`.playwright-cli/`、`node_modules/` 未被跟踪。
- 未发现 `.env`、私钥、API key、访问令牌或数据库文件被跟踪。
- 已跟踪的资源只有应用图标等代码资源，没有真实 EPUB、TXT、PDF 或封面。
- 未发现源代码或文档中的个人绝对路径；部署示例使用 `$env:USERPROFILE`。

这些检查能降低误提交风险，但不能替代对真实 Git 历史的检查。

## Git 历史

提交历史会公开提交作者姓名和邮箱。当前仓库是本地历史，上传前应确认这些
元数据是否可以公开。

如果不想公开历史中的邮箱，可选择：

1. 新建一个空仓库，只提交当前工作区的快照，重新开始历史。
2. 使用 `git filter-repo` 或 `git filter-branch` 重写历史作者信息。

重写历史会改变提交 ID，也可能影响已有副本；应明确确认后再执行，不要直接
在需要保留原始历史的仓库上操作。

## 上传前清单

```powershell
git status --short
git ls-files data output .env .env.local .next .playwright-cli
git grep -n -I -E 'api[_-]?key|secret|password|token|private key'
git diff --cached --stat
git check-ignore -v data output .next .playwright-cli node_modules
```

然后人工确认：

- 未跟踪的本地脚本、测试截图和临时文件没有通过 `git add .` 一并加入。
- 没有 `data/` 中的真实书籍、封面、数据库或阅读进度。
- 没有 `.env`、部署凭据、反向代理凭据或个人访问令牌。
- README 中没有个人住址、学校账号或私人域名。
- 若选择开源，补充许可证，例如 MIT、Apache-2.0 或其他明确许可证。
- 不在 README 或截图中暴露私人书架内容。

`.gitignore` 只能阻止之后的误添加，不能删除已经进入 Git 历史的文件。如果
历史中曾经提交过真实书籍或密钥，应在推送前清理历史并轮换相关密钥。

## 推荐发布步骤

```powershell
npm ci
npm run lint
npm run typecheck
npm test
npm run build
npm audit --omit=dev
git status --short
git remote -v
```

确认暂存内容只包含预期源码、测试和文档后，再创建远程仓库并推送。首次推送
前建议先在 GitHub 仓库设置中确认可见性为 Private 或 Public，避免把私有仓库
误设为公开。不要使用 `git add .` 代替逐项检查。
