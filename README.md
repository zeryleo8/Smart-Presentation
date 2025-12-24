# Smart Presentation 智能演示系统

Smart Presentation 是一个基于 Vue 3 + TypeScript 的企业级智能演示项目。它不仅支持常规的文档演示功能（打开、翻页、全屏），核心亮点在于集成了 **AI 视觉手势控制**，允许演讲者通过挥手、握拳等动作隔空控制 PPT，提供极具未来感的演示体验。

## ✨ 核心功能

### 1. 智能手势控制 (AI Vision)
基于 Google MediaPipe 视觉框架，无需穿戴任何设备，仅需普通摄像头即可实现：
- **👋 挥手翻页**：在摄像头前向左/向右挥手，即可切换上一页/下一页。
- **✊ 握拳交互**：握拳保持一段时间，可触发特定操作（如退出全屏模式）。
- **实时反馈**：界面包含 AI 视觉激活状态指示灯及骨架追踪可视化，确保交互准确性。

### 2. 高清文档演示
- **多格式支持**：支持 PPTX、PDF 等常见演示格式（需后端转换服务配合）。
- **Canvas 渲染**：利用 HTML5 Canvas 技术进行文档渲染，确保在不同分辨率下的清晰度。
- **沉浸式全屏**：一键进入全屏演示模式，自动激活手势控制。
- **缩略图导航**：侧边栏实时预览所有页面，快速跳转。

### 3. 企业级 UI 设计
- **扁平化风格**：采用 Element Plus 组件库，结合定制化的 SCSS 样式，打造简洁专业的界面。
- **响应式布局**：自适应不同屏幕尺寸。

## 🛠️ 技术栈

- **前端框架**: [Vue 3](https://vuejs.org/) (Script Setup)
- **构建工具**: [Vite](https://vitejs.dev/)
- **编程语言**: [TypeScript](https://www.typescriptlang.org/)
- **UI 组件库**: [Element Plus](https://element-plus.org/)
- **状态管理**: [Pinia](https://pinia.vuejs.org/)
- **AI/视觉**: [MediaPipe Tasks Vision](https://developers.google.com/mediapipe/solutions/vision) (Hand Landmarker)
- **PDF 渲染**: [PDF.js](https://mozilla.github.io/pdf.js/)
- **样式预处理**: SASS/SCSS

## 🚀 快速开始

### 环境要求
- Node.js >= 16
- 摄像头（用于体验手势控制功能）

### 安装依赖

```bash
npm install
```

### 启动开发服务器

```bash
npm run dev
```

启动后访问 `http://localhost:5173` 即可体验。

### 构建生产版本

```bash
npm run build
```

## 📂 项目结构

```
smart-presentation/
├── public/
│   ├── models/              # MediaPipe AI 模型文件 (hand_landmarker.task)
│   └── wasm/                # MediaPipe WebAssembly 文件
├── src/
│   ├── assets/              # 静态资源与样式
│   ├── components/
│   │   ├── Gesture/         # 手势控制核心组件
│   │   │   └── GestureController.vue
│   │   ├── Layout/          # 布局组件
│   │   └── ...
│   ├── router/              # 路由配置
│   ├── views/               # 页面视图
│   │   ├── Presentation.vue # 核心演示页面
│   │   ├── Dashboard.vue    # 文件管理/仪表盘
│   │   └── Editor.vue       # 编辑器视图
│   ├── App.vue
│   └── main.ts
├── index.html
├── package.json
└── vite.config.ts
```

## 💡 使用指南

1. **打开文档**：在首页点击“打开文档”按钮，选择本地的 PPTX 或 PDF 文件。
2. **进入演示**：点击右上角的“开始全屏演示”按钮。
3. **手势控制**：
   - 确保浏览器已获授权访问摄像头。
   - 站在摄像头前，确保手部清晰可见（屏幕右下角会有骨架追踪反馈）。
   - **下一页**：手掌向左挥动。
   - **上一页**：手掌向右挥动。
   - **退出全屏**：握紧拳头保持约 1 秒。

## ⚠️ 注意事项

- **PPTX 支持**：项目目前包含对 Gotenberg API 的调用逻辑 (`/api-gotenberg`) 用于将 Office 文档转换为 PDF 进行渲染。如果在本地运行且没有配置相应的后端代理，建议直接测试 **PDF 文件**。
- **模型加载**：首次加载 AI 模型可能需要几秒钟，请留意界面上的加载状态。
- **启动转换引擎 (Docker)**:
```bash
docker run --rm -p 3001:3000 gotenberg/gotenberg:7
```

## 🤝 贡献

欢迎提交 Issue 或 Pull Request 来改进项目！

## 📄 许可证

MIT License
