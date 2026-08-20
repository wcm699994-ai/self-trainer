# SelfTrainer
SelfTrainer 是一款将「机器学习模型训练范式」迁移到个人行为优化的极简工具。
用户像调试模型一样迭代自身行为秩序：去道德化、去鸡汤、不依赖意志力，通过量化指标与梯度微调实现稳定收敛。

## 核心特性
- **双指标体系**：损失指标 + 增益指标，各最多 3 项，总计不超过 6 项
- **梯度微调建议**：纯本地规则引擎，采用目标偏差率 + 7日滑动中位数方案，单次调整幅度不超过当前值 20%
- **每日数据采集**：结构化数字录入，支持 7 天内补录，草稿自动保存，提供一键复制昨日数值功能
- **周度复盘**：损失/增益双趋势移动平均线，内置基础规则复盘，支持可选 AI 深度复盘
- **本地优先**：核心功能 100% 本地运行，断网可用
- **PWA 支持**：可添加到主屏幕，离线可用（首次加载需联网）
- **AI 可选增强**：固定接入 DeepSeek 官方服务，仅用于辅助生成指标与深度复盘
- **内置使用指南**：应用内包含完整操作说明与指标规则讲解
- **数据主权**：所有数据存储于浏览器本地 IndexedDB，支持 JSON / CSV 导出备份
- **多套内置模板**：提供作息校准、学生备考、职场效率三套预置指标方案

## 快速开始

### 本地运行
安装项目全部依赖
```bash
npm install
```

启动本地开发服务，支持代码热更新
```bash
npm run dev
```

### 构建部署
打包生成生产环境静态资源，输出至 `dist` 目录，可直接部署到任意静态托管平台
```bash
npm run build
```

## AI 配置说明
SelfTrainer 已固定使用 DeepSeek 官方服务，无需自定义接口地址与模型：
- API 地址：`https://api.deepseek.com/v1`
- 模型：`deepseek-v4-flash`

只需在应用「配置」页填写 DeepSeek API Key 即可启用 AI 增强功能。

AI 仅在以下两个场景由用户手动触发：
1. 配置页：AI 辅助生成指标方案
2. 复盘页：AI 深度复盘分析

无有效 API Key、网络异常、请求超时或调用失败时，AI 入口自动隐藏，核心功能不受任何影响。

## 技术栈
- React 18 + Vite
- Tailwind CSS
- Recharts
- Zustand
- IndexedDB + localStorage
- PWA (vite-plugin-pwa)

## 数据存储与隐私
- 每日训练记录：IndexedDB 存储，异常时自动降级为 localStorage
- 配置信息、API Key、录入草稿：localStorage 存储
- 所有数据仅留存于用户本地浏览器，不上传任何服务器
- API Key 以明文形式存储在 localStorage，请勿在不受信任的公共设备上使用
- AI 请求仅发送必要的结构化数值数据，不包含任何用户身份信息

## 定位诚实说明
本工具的「梯度微调」本质上是基于目标偏差率与滑动中位数的启发式规则，并非数学意义上的梯度下降。我们借鉴了机器学习训练的概念框架，但在实现上采用工程化直觉与行为心理学原则，旨在提供稳定、可解释的微调建议。

## 开源协议
MIT 协议，完全开源免费，无付费、会员、广告、内购入口。

## Trademark Notice
The MIT License applies **only to the source code of this project**, and does NOT apply to the project name `SelfTrainer`.
The project name is not licensed under any open source license.
No permission is granted to use `SelfTrainer` as a trademark, product name or brand name without prior written consent.