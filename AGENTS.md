# ICO 生成器 — Agent Guide

## 命令 / Commands

```bash
pip install -r requirements.txt   # 安装依赖：pywebview>=4.4，Pillow>=10.0.0
python main.py                    # 启动桌面应用
python -m PyInstaller --clean icon_generator.spec   # 打包成 EXE
build.ps1                         # 同上（PowerShell 封装脚本）
```
No lint, typecheck, or test commands exist.
目前没有代码检查、类型检查或测试相关的命令。

## 项目架构

- **程序入口**：`main.py` 会启动一个无边框的 pywebview 窗口并加载 `web/index.html`
- **前端**：`web/` 目录是正式的源文件位置。根目录下的 `index.html`、`app.js`、`style.css` 是**过时的副本**，只能编辑 `web/` 目录里的文件
- **双模式运行**：在 pywebview 环境下，前端直接调用 Python `Api` 类的方法，在后端用 Pillow 完成 ICO 生成；在纯浏览器模式下（没有 pywebview），则改用客户端的 canvas + BMP 方式生成 ICO
- **输出格式**：ICO 文件使用手动打包的 BMP 图像数据，以保证 Windows 兼容性；ICNS 文件则将 PNG 数据嵌入 ICNS 容器，支持 macOS 所需的各种图标尺寸
- **打包配置**：`icon_generator.spec` 排除了大量不必要的依赖（PyQt、numpy、requests、tkinter 等），以尽量压缩打包体积。重新打包时一定要加上 `--clean` 参数
- **Python 图标生成逻辑**：生成 ICO 时，先用 `Image.Resampling.LANCZOS` 对源图像进行缩放，再手动将 BMP 格式的图像数据打包进 ICO 容器；生成 ICNS 时，按照支持的图标尺寸，将 PNG 数据打包进 ICNS 容器

## Architecture

- **Entrypoint**: `main.py` launches a pywebview frameless window loading `web/index.html`
- **Frontend**: `web/` directory is canonical source. Root-level `index.html`, `app.js`, `style.css` are **stale duplicates** — edit `web/` files only
- **Dual-mode**: pywebview calls Python `Api` class methods (ICO generation via Pillow on backend). Standalone browser mode (without pywebview) uses client-side canvas+BMP for ICO generation
- **Output formats**: ICO output uses manually packed BMP image data for Windows compatibility; ICNS output embeds PNG payloads in an ICNS container for supported macOS icon sizes
- **Specfile**: `icon_generator.spec` has extensive exclusions (PyQt, numpy, requests, tkinter, etc.) to minimize bundle size. Always use `--clean` when rebuilding
- **Python icon generation**: ICO generation resizes source images with `Image.Resampling.LANCZOS` and manually packs BMP-format image data into the ICO container; ICNS generation uses the supported icon sizes and PNG payloads

## 文件结构 / File Layout

```text
main.py                 # Python 后端 + pywebview Api 类
web/                    # frontend source 前端源文件（HTML/CSS/JS）
  index.html
  style.css
  app.js
icon_generator.spec     # PyInstaller Config 打包配置
build.ps1               # 构建脚本 / build script
requirements.txt        # pywebview、Pillow
```

## 开发规范 / Conventions

- `main.py` 里的 `Api` 类通过 `window.pywebview.api.*` 对外暴露可供 JavaScript 调用的方法
- 前端通过检测 `window.pywebview && window.pywebview.api` 来判断当前是否运行在 pywebview 环境中
- 所有提示消息都已本地化为中文
- 生成的 ICO 文件使用手动打包的 BMP 格式，而不是 PIL 自带的 ICO 保存方式，这样做是为了保证 Windows 兼容性
- 生成的 ICNS 文件在 ICNS 容器内使用 PNG 数据


- The `Api` class in `main.py` exposes JS-callable methods via `window.pywebview.api.*`
- Frontend detects pywebview by checking `window.pywebview && window.pywebview.api`
- All notifications are Chinese-localized
- Generated ICO uses manual BMP format (not PIL's ICO save) for Windows compatibility
- Generated ICNS uses PNG payloads inside the ICNS container