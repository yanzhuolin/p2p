# 🎮 P2P 游戏世界

基于 PeerJS 和 Next.js 实现的多人在线 2D 游戏世界，支持实时位置同步、角色选择和聊天功能，完全基于 P2P 技术，无需中心化游戏服务器。

## ✨ 核心特性

### 🎮 游戏功能
- 🗺️ **2D 游戏世界** - 基于 Canvas 的实时渲染，800x600 像素地图
- 🎭 **角色选择系统** - 8 个独特角色可选（骑士、法师、弓箭手等）
- 🎯 **实时位置同步** - P2P 同步所有玩家位置，低延迟（50ms）
- 🕹️ **流畅控制** - WASD/方向键移动，支持对角线移动
- 👥 **多人在线** - 实时看到其他玩家移动和互动
- 🎨 **精美视觉** - 角色表情符号、阴影效果、动画

### 💬 聊天功能
- 📡 **自动广播模式** - 消息自动发送给所有在线用户
- 💬 **实时聊天** - 低延迟的消息传输
- 🎨 **优雅 UI** - 可折叠聊天面板，不影响游戏体验

### 🔧 技术特性
- 🔐 **真正的 P2P 通信** - 游戏数据和消息直接在玩家之间传输
- 🎯 **PeerJS 信令服务器** - 用于 WebRTC 连接协调
- 🔄 **自动连接管理** - 自动连接到新上线的玩家
- 💓 **心跳机制** - 自动检测和清理离线用户（30秒超时）
- 🔄 **页面刷新处理** - 刷新页面时自动注销，避免僵尸用户
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
2. 输入你的用户名
3. 点击"🚀 进入游戏"
4. 选择你喜欢的角色（8个角色可选）
5. 使用 **WASD** 或 **方向键** 移动角色
6. 在右侧聊天面板与其他玩家交流

💡 **提示**:
- 可以在多个浏览器标签页或不同浏览器中打开应用来测试多人游戏
- 你会看到其他玩家的实时移动
- 聊天面板可以折叠，不影响游戏体验
- 每个角色都有独特的颜色和表情符号

## 🎮 游戏控制

| 按键 | 功能 |
|------|------|
| W / ↑ | 向上移动 |
| S / ↓ | 向下移动 |
| A / ← | 向左移动 |
| D / → | 向右移动 |
| Enter | 发送聊天消息 |

## 🎭 可选角色

| 角色 | 表情 | 颜色 | 类型 |
|------|------|------|------|
| 骑士 | 🛡️ | 蓝色 | 防御型 |
| 法师 | 🔮 | 紫色 | 魔法型 |
| 弓箭手 | 🏹 | 绿色 | 远程型 |
| 战士 | ⚔️ | 红色 | 攻击型 |
| 刺客 | 🗡️ | 靛蓝色 | 敏捷型 |
| 圣骑士 | ✨ | 橙色 | 神圣型 |
| 德鲁伊 | 🌿 | 青绿色 | 自然型 |
| 死灵法师 | 💀 | 紫罗兰色 | 黑暗型 |

## 🔧 技术栈

### 后端（信令服务器）
- **PeerJS Server** - WebRTC 信令服务器
- **Express** - HTTP API 服务器
- **CORS** - 跨域资源共享

### 前端
- **Next.js 14** - React 框架
- **TypeScript** - 类型安全
- **PeerJS Client** - WebRTC 客户端库
- **Canvas API** - 2D 游戏渲染
- **CSS Modules** - 样式管理
- **React Hooks** - 状态管理

## 📡 工作原理

1. **连接建立**
   - 用户连接到 PeerJS 信令服务器
   - 获得唯一的 Peer ID
   - 注册到用户列表

2. **自动 P2P 连接**
   - 系统自动获取在线用户列表
   - 自动连接到所有在线用户
   - 新用户上线时自动建立连接
   - 通过信令服务器交换 SDP 和 ICE 候选
   - 建立直接的 WebRTC 数据通道

3. **广播消息传输**
   - 用户发送消息时，自动广播到所有已连接的用户
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

## 🐛 故障排查

如果遇到问题，请查看 [TROUBLESHOOTING.md](./TROUBLESHOOTING.md) 获取详细的故障排查指南。

### 快速检查

1. **确认服务器运行**
   ```bash
   curl http://localhost:3001/health
   ```

2. **查看浏览器控制台**
   - 按 F12 打开开发者工具
   - 查看 Console 标签页的日志

3. **常见问题**
   - 首次登录时的连接错误是正常的（如果没有其他用户）
   - 红色圆点表示连接失败，绿色圆点表示已连接
   - 至少需要一个绿色连接才能发送消息

## 🔒 安全注意事项

⚠️ **本项目仅用于学习和演示目的**

在生产环境中使用时，请考虑：
- 添加用户认证
- 实现消息加密
- 添加速率限制
- 使用 HTTPS/WSS
- ✅ **已配置免费 TURN 服务器** - 支持跨网络 P2P 连接（详见 [NAT_TRAVERSAL_GUIDE.md](./NAT_TRAVERSAL_GUIDE.md)）
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

## 📚 详细文档

- [GAME_FEATURES.md](./GAME_FEATURES.md) - 游戏功能详细说明
- [TROUBLESHOOTING.md](./TROUBLESHOOTING.md) - 故障排查指南
- [TESTING.md](./TESTING.md) - 测试指南

## 🎯 项目亮点

### 技术创新
- ✅ **完全 P2P** - 游戏状态和聊天消息都通过 P2P 传输
- ✅ **实时同步** - 50ms 的位置同步间隔，流畅的多人体验
- ✅ **自动连接** - 新玩家加入时自动建立 P2P 连接
- ✅ **心跳机制** - 自动检测和清理离线玩家

### 用户体验
- ✅ **精美界面** - 现代化的 UI 设计，流畅的动画效果
- ✅ **角色系统** - 8 个独特角色，每个都有独特的视觉效果
- ✅ **响应式** - 支持桌面端和移动端
- ✅ **易用性** - 简单的键盘控制，直观的操作

### 性能优化
- ✅ **60 FPS** - 流畅的游戏渲染
- ✅ **低延迟** - P2P 直连，无需经过服务器
- ✅ **资源优化** - 轻量级的游戏资源
- ✅ **内存管理** - 自动清理断开的连接

## 🚀 未来计划

### 短期目标
- [ ] 添加虚拟摇杆支持移动端控制
- [ ] 添加玩家之间的碰撞检测
- [ ] 优化网络同步算法（预测+插值）
- [ ] 添加更多地图元素（障碍物、道具）
- [ ] 添加音效和背景音乐

### 长期目标
- [ ] 多房间系统
- [ ] 游戏内语音聊天
- [ ] 角色技能系统
- [ ] 成就和排行榜
- [ ] 地图编辑器
- [ ] 保存游戏进度
- [ ] 更大的地图和小地图系统

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

如果你有好的想法或建议，请：
1. Fork 本项目
2. 创建你的特性分支 (`git checkout -b feature/AmazingFeature`)
3. 提交你的改动 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 开启一个 Pull Request

## 📄 许可证

MIT License

## 🙏 致谢

- [PeerJS](https://peerjs.com/) - 简化 WebRTC 的优秀库
- [Next.js](https://nextjs.org/) - 强大的 React 框架
- [WebRTC](https://webrtc.org/) - 实时通信技术
- [Canvas API](https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API) - 2D 图形渲染

---

**享受 P2P 游戏世界的乐趣！** 🎮🎉

