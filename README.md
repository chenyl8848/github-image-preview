# GitHub Image Preview

在 GitHub 上点击图片即可**原地预览**，不再被迫打开新标签页。支持放大 / 缩小、拖拽平移、下载原图、多图切换，兼容 **Chrome / Edge / Firefox**（Manifest V3）。

## 项目背景

在 GitHub 上查看 issue、PR、README、评论里的截图时，点击图片会跳到新标签页打开原图——打断阅读节奏，来回切换标签页体验很差。

本插件拦截 GitHub 上的图片点击，改为在当前页面弹出灯箱（lightbox）预览，随点随看、随看随关，让阅读流程不被打断。

## 功能特性

- 🖱️ **原地预览**：单击图片弹出灯箱，不再新开标签页
- 🔍 **放大 / 缩小**：滚轮、工具栏按钮、键盘 `+` / `-`、双击在 1×/2× 间切换
- ✋ **拖拽平移**：放大后可按住鼠标左键拖动查看细节
- ⬇️ **下载原图**：一键保存到本地
- ↗️ **新标签页打开**：按需回到浏览器原生打开方式
- ⬅️ ➡️ **多图切换**：当前页面的图片之间上一张 / 下一张
- 🏷️ **alt 标题**：显示图片 alt 文本作为标题
- 🌐 **双平台**：同时支持 Chrome / Edge / Firefox

## 演示

> 待补充截图。

## 下载

最新版本可从 [Releases](https://github.com/chenyl8848/github-picture-preview/releases) 下载 `github-picture-preview.zip`，解压后按下方「安装」步骤以开发者模式加载。

## 安装

### Chrome / Edge（或其他 Chromium 内核浏览器）

1. 获取源码（二选一）：
   - 从 [Releases](https://github.com/chenyl8848/github-picture-preview/releases) 下载 `github-picture-preview.zip` 并解压；
   - 或克隆仓库：
     ```bash
     git clone https://github.com/chenyl8848/github-picture-preview.git
     ```
2. 打开 `chrome://extensions`（Edge 为 `edge://extensions`）。
3. 打开右上角「开发者模式」开关。
4. 点击「加载已解压的扩展程序」，选择本项目根目录。
5. 打开任意含图片的 GitHub 页面，单击图片即可预览。

### Firefox

1. 获取源码：从 [Releases](https://github.com/chenyl8848/github-picture-preview/releases) 下载 zip 并解压，或克隆仓库。
2. 打开 `about:debugging#/runtime/this-firefox`。
3. 点击「临时载入附加组件」，选择本项目根目录下的 `manifest.json`。
4. 打开任意含图片的 GitHub 页面，单击图片即可预览。

> Firefox 仅支持「临时载入」，重启浏览器后需重新加载；如需永久安装，需用 Firefox Developer Edition / Nightly 关闭签名校验。

## 使用方法

在 GitHub 页面上**单击**图片即可弹出预览。灯箱打开后：

| 操作               | 方式                                               |
| ------------------ | -------------------------------------------------- |
| 关闭               | `Esc` / 点击背景 / 点击右上角 ×                 |
| 上一张 / 下一张    | `←` / `→` 或左右箭头按钮                     |
| 放大 / 缩小        | `+` / `-`、鼠标滚轮、工具栏「放大 / 缩小」按钮 |
| 复位到原始尺寸     | `0` 或工具栏「1:1」按钮                          |
| 1× / 2× 切换     | 双击图片                                           |
| 拖拽平移（放大后） | 按住鼠标左键拖动                                   |
| 下载原图           | 工具栏「下载」按钮                                 |
| 新标签页打开       | 工具栏「新标签页打开」按钮                         |

> 按住 `Ctrl` / `Cmd` / `Shift` / `Alt`（或使用右键、中键）点击图片时，仍按浏览器默认行为在新标签页打开，不受插件影响。

> 「下载原图」通过 `fetch` 拉取图片，若遇跨域受限会自动降级为「新标签页打开」。

## 工作原理

- 在 `document` 上以**捕获阶段**监听点击事件（事件委托），不依赖页面结构，GitHub 的 SPA 动态渲染内容也能实时生效。
- 命中「链接指向图片」的 `<a>` 标签时，`preventDefault()` 阻止新标签页打开，改为显示自绘灯箱；同时识别 GitHub 的页面路由（`/blob/`、`/tree/`、`/blame/`），避免误伤普通页面链接。
- 灯箱 DOM 仅创建一次并复用；多图导航在每次打开时重新收集当前页面的可预览图片。

## 权限说明

本插件申请的权限及用途：

- `github.com`：在 GitHub 页面上注入脚本，拦截图片点击以弹出预览。
- `*.githubusercontent.com`：「下载原图」时拉取托管在 GitHub CDN 上的图片资源。

插件不收集、不上传任何用户数据，全部逻辑在本地浏览器内运行。

## 目录结构

```
github-picture-preview/
├── manifest.json      # Manifest V3 配置
├── content.js         # 核心逻辑：点击拦截 + 图片识别 + 灯箱交互
├── content.css        # 灯箱样式
├── icons/             # 插件图标（16 / 48 / 128）
├── tools/gen_icons.py # 图标生成脚本（仅依赖标准库）
├── .gitignore         # 忽略打包产物与编辑器目录
├── LICENSE            # MIT 协议
└── README.md
```

## 贡献

欢迎提交 Issue 与 Pull Request。开发流程：

1. Fork 本仓库并克隆到本地。
2. 修改 `content.js` / `content.css`。
3. 按上文「安装」步骤在浏览器中「重新加载」扩展进行验证。
4. 提交 PR，说明改动内容与验证结果。

### 常见自定义

- **GitHub Enterprise（自定义域名）**：在 `manifest.json` 的 `content_scripts.matches` 中追加你的域名，例如 `https://github.yourcompany.com/*`。
- **替换图标**：将 `icons/` 下的 PNG 替换为你的图标（保持 16 / 48 / 128 尺寸），或修改 `tools/gen_icons.py` 后重新生成。

## License

[MIT](./LICENSE)
