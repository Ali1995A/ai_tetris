## 俄罗斯方块

本仓库现包含两套实现：

- `auto_tetris/`：原 C++ + WinAPI 桌面版（普通模式与 AI 模式）
- 根目录 Web 版：适合 Vercel 部署、iPad/微信浏览器触控游玩

## Web 版特性（儿童超低难度）

- 触控优先：大按钮、低误触布局，支持横屏和竖屏
- 目标设备：第一代 iPad Pro 浏览器与微信内浏览器
- 最低难度：慢速下落 + 儿童友好方块池
- 无限生命：永不结束，堆高后自动整理继续玩
- 手势锁定：可开关防误触，微信内浏览器自动开启
- 语音提示与幼儿大字：可开关，更适合 5 岁儿童

## 本地运行

直接打开 `index.html` 即可，或使用任意静态服务器：

```bash
npx serve .
```

## Vercel 部署

仓库已包含 `vercel.json`，按静态站点部署即可：

1. 在 Vercel 导入本仓库
2. Framework Preset 选 `Other`
3. 保持默认构建设置（无需 Build Command）
4. 部署后即可访问

## 原桌面版资料

![思维导图](./img/Tetris.png)

### 玩家模式预览

![玩家模式](./img/common.gif)

### AI模式预览

> [pierre-dellacheries算法详情](http://imake.ninja/el-tetris-an-improvement-on-pierre-dellacheries-algorithm)

![AI模式](./img/ai.gif)
