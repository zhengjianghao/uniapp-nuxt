# 终端机开箱机台弹窗（H5）实施计划

## Context（背景与目标）

H5 云开箱的"终端机拆封"目前复用通用开箱动画（`CloudActionAnimation` 的 open 模式），拆封后直接进结果弹窗，没有一个像 web `TerminalModal.vue` 那样的机台控制台弹窗，也没有"接受/放弃报价"的多轮交互。

用户希望按 `figma.md` 的设计，把终端机开箱改造成一个**专用机台弹窗**，逻辑参考 web 的 `TerminalModal.vue` / `TerminalDetail.vue` 状态机。已与用户确认：

1. 做**完整机台弹窗**（移植 boot→roll→quote→error 多阶段状态机 + 日志 + 按住2秒按钮）。
2. 动画模块**复用刚修复好的 `CloudRollTrack.vue`**（横向滚动出件）。
3. **报价交互在弹窗内闭环**：接受→确认报价后关闭；放弃→在弹窗里重新跑一轮滚动动画出新件再报价，最后一件放弃即报废。

预期结果：给 H5 一个按 figma 布局、逻辑对齐 web 的终端机开箱弹窗。

## Figma 布局解读（转响应式）

figma 为绝对定位单屏，按"保留全部元素 + 语义重排"解读为：

- 顶部标题栏：机台名（"毁灭之手终端机"）+ 状态标签 + 右上角关闭 X
- 步骤条：`开机自检 ——— 报价`（对应 phase）
- 机台图（左上，浅色径向背景占位）
- 统计行：`已接受 X 件 · 未接受 X 件 · 本机累计成交 ￥X`
- 深色日志盒（`#161616` 底、绿色等宽字体、可滚动、最多 60 条）
- **动画模块区（figma 中的 323×175 主区域）位于下方**：未开出→`CloudRollTrack` 滚动；已开出→报价卡片；自检→进度条；错误→提示
- 底部操作：`按住2秒·接受报价`（绿）+ `按住2秒·放弃报价`（灰，最后一件变危险色）

## 阶段状态机（移植 web TerminalModal）

```
boot → roll → quote
        ↑      │
        └──────┘（放弃报价 → 重新出件）
每个动作失败 → error → 重试/关闭
```

- `boot`：按时间线输出自检日志（校验封条/液压加压/核心校准），同时等待 `OPEN` 接口结果
- `roll`：`CloudRollTrack` 用真实产物作为 winner，滚动结束进入 quote
- `quote`：展示产物 + 报价，两个按住按钮（接受/放弃）
- `error`：区分 `open`（拆封失败，重试=重拆封）与 `replace`（换件失败，重试=重新出件）两种动作

## 新增 / 修改文件

### 1. 新增 `CloudHoldButton.vue`（按住2秒触发）
- Props：`label`、`deny?`、`danger?`、`disabled?`
- 交互：`touchstart/pointerdown` 开始 2s 计时并显示进度，`touchend/pointerup/leave` 取消；满足 2s 触发 `confirm`
- 样式：绿色（接受）/ 灰色（放弃）/ 危险红（最后一件），圆角 8px，对齐 figma 按钮

### 2. 新增 `CloudTerminalMachineModal.vue`（机台弹窗主体）
- 用 `wd-popup`（参照 `CloudActionAnimation.vue` 的 popup 用法）
- Props：
  - `show: boolean`、`slotNo`、`pool: CloudProduct[]`
  - `machine`：机台信息（`{ name, image, count, maxOffers, round, state }`）
  - `pending: CloudProduct | null`（当前待报价产物）
  - 三个异步 job 回调：`onOpen: () => Promise<CloudProduct|null>`、`onReplace: () => Promise<CloudProduct|null>`（null=报废）、`onAccept: () => Promise<boolean>`
- Emits：`close`、`accepted`、`destroyed`
- 内部状态：`phase`、`logs[]`、`bootProgress`、`outcome`（当前产物）、错误信息与动作
- 复用 `CloudRollTrack`：`:show="true" :pool="pool" :winner="outcome" @settled="phase='quote'"`
- 接受→调 `onAccept()` 成功后 `emit('accepted')` 并 `close`；放弃→调 `onReplace()`，返回新产物则回到 `roll`，返回 null 则 `emit('destroyed')` 并关闭

### 3. 修改 `CloudTerminalPanel.vue`（入口）
- 终端机位卡片点击/主按钮：未拆封→"拆封开机"，已开出→"打开终端机窗口"，统一**打开机台弹窗**（由弹窗内部驱动 OPEN/出件/报价/接受/放弃多轮）
- 保留"完成开箱"入口
- 机位状态/进度逻辑复用现有 `state()/stateClass()/round()`

### 4. 修改 `index.vue`（装配 + 作业函数）
- 新增状态：`terminalMachineVisible`、`terminalMachineSlot`、`terminalMachinePending`
- 新增三个 job 函数（复用现有 API）：
  - `onOpen`：走 `runAction("OPEN_ONE", {slotNo})`，返回 `next.allSlots[slotNo].openedProduct`（映射为 `CloudProduct`）；失败抛错进 error
  - `onReplace`：按 `canReplaceItem ? "REPLACE_TERMINAL_ITEM" : "DESTROY_TERMINAL"` 走 `runAction`，返回新产物或 null（报废）
  - `onAccept`：复用现有 `confirmTerminalOffer` + `applyInfo` 逻辑，返回是否成功
- 模板挂载 `<CloudTerminalMachineModal>`；`accepted`→刷新订单/toast；`destroyed`→toast 报废 + 刷新
- 原 `openTerminal/replaceTerminal` 中"打开通用动画弹窗"的路径改为打开机台弹窗（`OPEN_ONE`/首轮出件仍由弹窗 `onOpen` 驱动）；`confirmTerminal` 保留供 `onAccept` 复用
- 图表/类型：确认 `CloudProduct` 是否含报价价字段；如只有 `price/buffPrice` 则报价区沿用市场参考价并加注释（与 web `currentOfferPrice` 的差异，实现时向用户确认）

## 复用清单
- `CloudRollTrack.vue`（已修复滚动动画）
- `runAction()`（index.vue，轮询/刷新订单）、`confirmTerminalOffer`、`applyInfo`、`mapProduct`（index.vue）
- `toast`、`errorText`、`sameSlot`、`current/version` 等既有工具
- `wd-popup`、`c-image-local`、`c-shop-button`（现有 H5 组件）

## 验证
1. `pnpm dev:h5` 起服务，登录后进入云开箱订单。
2. 点某机位"拆封开机"→ 弹窗先走开机自检日志 → `CloudRollTrack` 滚动 → 停在真实产物进入报价。
3. 接受报价（按住2秒）→ 调用确认接口 → 弹窗关闭、订单/成交金额刷新。
4. 放弃报价 → 弹窗内重新滚动出新件再报价；最后一轮放弃 → 机台报废并提示。
5. 拆封/换件接口报错 → 弹窗进入 error 态、可重试/关闭；控制台无报错。
6. 校验 figma 元素（标题/步骤条/机台图/统计行/日志盒/底部按钮）在窄屏与宽屏均正常布局。