# PDM Reader

一个跨平台的 PowerDesigner PDM 文件查看器，基于 Electron + TypeScript 构建。

支持解析 PDM（Physical Data Model）文件，以树形结构展示表信息，查看列详情、主键、外键、索引，浏览 ER 关系图，并根据目标数据库方言生成 CREATE TABLE SQL 语句。

## 功能特性

- 打开并解析 `.pdm` 格式文件
- 树形结构浏览所有表
- 查看表详情：列、数据类型、注释、默认值等
- 查看主键、外键关系、索引信息
- ER 关系图可视化
- 按数据库方言生成 SQL（支持 Oracle、MySQL、PostgreSQL、SQL Server）
- 导出全部表的 CREATE TABLE SQL 为 `.sql` 文件
- 单表 SQL 复制到剪贴板
- 支持快捷键复制/粘贴/剪切

## 环境要求

- [Node.js](https://nodejs.org/) >= 18.0.0
- npm >= 8.0.0（随 Node.js 安装）

## 快速开始

### 1. 克隆项目

```bash
git clone <repository-url>
cd pdmreader
```

### 2. 安装依赖

```bash
npm install
```

### 3. 开发模式运行

```bash
npm run dev
```

启动后即可打开 `.pdm` 文件进行查看。

## 编译与打包

### 开发构建

仅编译 TypeScript，不打包安装程序：

```bash
npm run build
```

输出位于 `dist/` 目录。

### 生产打包

编译并生成安装程序：

```bash
npm run package
```

输出位于 `release/` 目录。

#### 各平台打包产物

| 平台 | 产物格式 | 文件位置 |
|------|----------|----------|
| Windows | `.exe`（NSIS 安装包） | `release/PDM Reader Setup X.X.X.exe` |
| macOS | `.dmg` | `release/PDM Reader-X.X.X.dmg` |
| Linux | `.AppImage` | `release/PDM Reader-X.X.X.AppImage` |

#### 跨平台打包说明

`npm run package` 默认打包当前平台。如需指定目标平台：

```bash
# Windows（在 Windows 上执行）
npm run package -- --win

# macOS（在 macOS 上执行）
npm run package -- --mac

# Linux（在 Linux 上执行）
npm run package -- --linux
```

> **注意**：macOS 的 `.dmg` 打包需要在 macOS 系统上执行；Windows 的 `.exe` 打包需要在 Windows 系统上执行，或使用跨平台编译工具。如需在非原生平台上打包，请参考 [electron-builder 跨平台构建文档](https://www.electron.build/multi-platform-build)。

## 各平台开发运行指南

### macOS

```bash
# 安装依赖
npm install

# 开发运行
npm run dev
```

### Windows

```bash
# 安装依赖
npm install

# 开发运行
npm run dev
```

如遇到 PowerShell 执行策略限制：

```powershell
Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned
```

### Linux

```bash
# 安装依赖
npm install

# 开发运行
npm run dev
```

如遇到 Electron 安装问题，可能需要安装系统依赖：

```bash
# Ubuntu / Debian
sudo apt-get install libgtk-3-dev libnotify-dev libgconf-2-4 libnss3 libxss1 libasound2

# Fedora
sudo dnf install gtk3-devel libnotify-devel GConf2 nss libXScrnSaver-devel alsa-lib-devel
```

## 项目结构

```
pdmreader/
├── src/
│   ├── main/                    # Electron 主进程
│   │   ├── index.ts             # 主进程入口、窗口管理
│   │   ├── ipc-handlers.ts      # IPC 通信、菜单、文件保存
│   │   └── services/
│   │       └── pdm-parser.ts    # PDM 文件解析器
│   ├── preload/                 # 预加载脚本
│   │   └── index.ts             # 暴露 electronAPI
│   └── renderer/               # 渲染进程（前端）
│       ├── index.html           # 主页面
│       ├── src/
│       │   ├── main.ts          # 渲染入口、事件绑定
│       │   ├── components/
│       │   │   ├── TreeView.ts   # 树形视图组件
│       │   │   ├── DetailPanel.ts # 表详情面板
│       │   │   └── ERDiagram.ts  # ER 关系图组件
│       │   └── utils/
│       │       └── sql-generator.ts  # SQL 生成器
│       └── assets/
│           └── styles/
│               └── main.css      # 样式文件
├── resources/                   # 应用图标等资源
├── dist/                        # 编译输出（gitignore）
├── release/                      # 打包输出（gitignore）
├── electron.vite.config.ts      # electron-vite 配置
├── electron-builder.yml         # electron-builder 打包配置
├── tsconfig.json                # TypeScript 配置
└── package.json
```

## 技术栈

- [Electron](https://www.electronjs.org/) 28 — 跨平台桌面应用框架
- [electron-vite](https://electron-vite.org/) — Electron 构建工具
- [TypeScript](https://www.typescriptlang.org/) 5 — 类型安全
- [fast-xml-parser](https://github.com/NaturalIntelligence/fast-xml-parser) — PDM (XML) 文件解析
- [Vite](https://vitejs.dev/) 5 — 前端构建

## SQL 方言支持

根据 PDM 文件中定义的目标数据库，生成对应方言的 SQL 语句(未完整测试)：

| 特性 | Oracle | MySQL | PostgreSQL | SQL Server |
|------|--------|-------|------------|------------|
| 标识符引用 | `"name"` | `` `name` `` | `"name"` | `[name]` |
| 自增列 | — | AUTO_INCREMENT | GENERATED ALWAYS AS IDENTITY | IDENTITY(1,1) |
| 列注释 | COMMENT ON COLUMN | 行内 COMMENT | COMMENT ON COLUMN | sp_addextendedproperty |
| 表注释 | COMMENT ON TABLE | ALTER TABLE COMMENT= | COMMENT ON TABLE | sp_addextendedproperty |
| 类型映射 | INT→NUMBER, TEXT→CLOB | BOOL→TINYINT(1) | CLOB→TEXT, BLOB→BYTEA | BOOL→BIT, TEXT→NVARCHAR(MAX) |

## 许可证

MIT
