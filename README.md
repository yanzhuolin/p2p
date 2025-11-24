# 🚀 P2P 聊天室

基于 PeerJS 和 Next.js 实现的点对点聊天应用，支持实时消息传输，无需中心化服务器存储消息。

## ✨ 特性

- 🔐 **真正的 P2P 通信** - 消息直接在用户之间传输
- 🎯 **PeerJS 信令服务器** - 用于 WebRTC 连接协调
- 💬 **实时聊天** - 低延迟的消息传输
- 👥 **在线用户列表** - 查看并连接到其他在线用户
- 🎨 **现代化 UI** - 基于 Next.js 和 CSS Modules
- 📱 **响应式设计** - 支持移动端和桌面端

## 🏗️ 项目结构

```
.
├── server/              # PeerJS 信令服务器
│   ├── server.js       # 服务器主文件
│   └── package.json    # 服务器依赖
│
└── client/             # Next.js 前端应用
    ├── pages/          # Next.js 页面
    │   ├── _app.tsx   # App 组件
    │   └── index.tsx  # 聊天室主页面
    ├── styles/         # 样式文件
    │   ├── globals.css
    │   └── Chat.module.css
    ├── package.json    # 前端依赖
    ├── tsconfig.json   # TypeScript 配置
    └── next.config.js  # Next.js 配置
```

## 🚀 快速开始

### 前置要求

- Node.js 16+ 
- npm 或 yarn

### 安装依赖

#### 1. 安装服务器依赖

```bash
cd server
npm install
```

#### 2. 安装客户端依赖

```bash
cd client
npm install
```

### 运行项目

#### 1. 启动信令服务器

```bash
cd server
npm start
```

服务器将在以下端口启动：
- HTTP API: `http://localhost:3001`
- PeerJS 服务: `ws://localhost:9000/myapp`

#### 2. 启动前端应用

在新的终端窗口中：

```bash
cd client
npm run dev
```

前端应用将在 `http://localhost:3000` 启动

### 使用方法

1. 打开浏览器访问 `http://localhost:3000`
2. 输入你的用户名并连接到服务器
3. 在左侧的在线用户列表中选择一个用户进行连接
4. 开始聊天！

💡 **提示**: 可以在多个浏览器标签页或不同浏览器中打开应用来测试多用户聊天

## 🔧 技术栈

### 后端（信令服务器）
- **PeerJS Server** - WebRTC 信令服务器
- **Express** - HTTP API 服务器
- **CORS** - 跨域资源共享

### 前端
- **Next.js 14** - React 框架
- **TypeScript** - 类型安全
- **PeerJS Client** - WebRTC 客户端库
- **CSS Modules** - 样式管理

## 📡 工作原理

1. **连接建立**
   - 用户连接到 PeerJS 信令服务器
   - 获得唯一的 Peer ID
   - 注册到用户列表

2. **P2P 连接**
   - 用户 A 选择用户 B 进行连接
   - 通过信令服务器交换 SDP 和 ICE 候选
   - 建立直接的 WebRTC 数据通道

3. **消息传输**
   - 消息通过 WebRTC 数据通道直接传输
   - 不经过服务器（真正的 P2P）
   - 低延迟、高效率

## 🎯 API 端点

### HTTP API (端口 3001)

- `GET /health` - 健康检查
- `POST /api/register` - 注册用户
- `POST /api/unregister` - 注销用户
- `GET /api/users` - 获取在线用户列表

### PeerJS 服务 (端口 9000)

- WebSocket 连接: `ws://localhost:9000/myapp`

## 🔒 安全注意事项

⚠️ **本项目仅用于学习和演示目的**

在生产环境中使用时，请考虑：
- 添加用户认证
- 实现消息加密
- 添加速率限制
- 使用 HTTPS/WSS
- 实现更完善的错误处理

## 🛠️ 开发模式

### 服务器开发模式（自动重启）

```bash
cd server
npm run dev
```

### 客户端开发模式

```bash
cd client
npm run dev
```

## 📦 构建生产版本

### 构建客户端

```bash
cd client
npm run build
npm start
```

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

## 📄 许可证

MIT License

## 🙏 致谢

- [PeerJS](https://peerjs.com/) - 简化 WebRTC 的优秀库
- [Next.js](https://nextjs.org/) - 强大的 React 框架
- [WebRTC](https://webrtc.org/) - 实时通信技术

---

**享受 P2P 聊天的乐趣！** 🎉

