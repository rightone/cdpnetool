# 规则配置规范设计 (v2)

本文档描述 cdpnetool 规则配置的新版设计规范，用于指导后续的核心重构工作。

---

## 一、设计目标

1. **清晰的层次结构**：配置 → 规则 → 匹配/行为，层级分明
2. **明确的生命周期**：每条规则必须指定应用阶段（请求/响应），决定行为执行时机
3. **统一的匹配逻辑**：所有匹配条件基于请求信息，简化用户心智模型
4. **多行为支持**：每条规则可包含多个行为，按顺序依次执行
5. **细粒度行为**：每种行为类型字段固定，职责单一，便于组合
6. **便于管理**：支持启用/禁用、优先级排序等实用特性

---

## 二、核心设计原则

### 2.1 匹配与行为分离

```
匹配条件：统一基于请求信息（与 stage 无关）
     ↓
匹配成功
     ↓
根据 stage 决定执行时机：
  - request: 请求发出前执行 → 可修改请求/拦截请求
  - response: 响应返回后执行 → 可修改响应
```

**核心洞察**：在绝大多数场景下，匹配网络请求只需要请求信息（URL、Method、Headers 等）就足够了，不需要根据响应内容来匹配。因此：

- **匹配条件**：永远基于请求信息，无论规则的 stage 是什么
- **生命周期（stage）**：只决定行为在什么时机执行、能操作什么内容

### 2.2 执行模式

采用 **aggregate 模式**（聚合模式）：

- 所有匹配成功的规则都会按优先级顺序执行
- 同一规则内的多个行为按数组顺序依次执行
- 多条规则的行为可以叠加生效（如：规则 A 修改 Header X，规则 B 修改 Header Y）
- **终结性行为**（block）会中断当前规则的后续行为及其他规则的执行

### 2.3 配置设计原则

1. **字段固定**：每种类型（条件/行为）有且仅有固定的字段
2. **无空字段**：每个字段都必须有值，都有意义
3. **类型明确**：通过 `type` 值就能确定结构
4. **程序优雅**：`switch type` 后直接访问对应字段，无需判空

---

## 三、整体结构

```
配置 (Config)
├── 基础信息
│   ├── 配置ID (id)
│   ├── 配置名称 (name)
│   ├── 版本号 (version) ── 配置格式规范版本，用于选择解析器
│   └── 配置描述 (description)
├── 设置项 (settings) ── 预留
└── 规则列表 (rules)
    └── 规则 (Rule)
        ├── 规则ID (id)
        ├── 规则名称 (name)
        ├── 是否启用 (enabled)
        ├── 规则优先级 (priority)
        ├── 生命周期 (stage) ── 决定行为执行时机
        ├── 匹配规则 (match) ── 基于请求信息
        └── 执行行为 (actions) ── 行为列表，按顺序执行
```

---

## 四、配置 (Config)

配置是一个完整的 JSON 文件，包含基础信息和规则列表。

### 4.1 字段定义

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `id` | string | 是 | 配置唯一标识符，格式：`config-YYYYMMDD-随机6位`，如 `config-20260117-a1b2c3` |
| `name` | string | 是 | 配置名称，用于展示 |
| `version` | string | 是 | **配置格式规范版本**（见下文说明） |
| `description` | string | 否 | 配置描述信息 |
| `settings` | object | 否 | 预留的设置项，用于后续扩展 |
| `rules` | array | 是 | 规则列表 |

### 4.2 配置 ID 说明

`id` 字段是配置的业务唯一标识，用于导入导出时的身份识别。

**生成规则**：
- 格式：`config-YYYYMMDD-随机6位字母数字`
- 示例：`config-20260117-a1b2c3`
- 首次创建配置时自动生成

**约束**：
- 长度：3-64 字符
- 字符集：`^[a-zA-Z0-9_-]+$`（字母、数字、横线、下划线）
- 数据库中建立唯一索引

**导入逻辑**：
- 导入时根据 `id` 判断是否已存在
- `id` 已存在 → 覆盖更新该配置
- `id` 不存在 → 新增配置
- 手动修改 `id` → 视为新配置

### 4.3 version 字段说明

`version` 字段表示**配置格式规范的版本**，而不是配置内容的版本。

**作用**：
- 指示系统应该用什么标准来解释这个配置文件
- 当配置格式规则发生变化时，系统可以根据版本号选择不同的解析器
- 实现向后兼容，支持解析旧版本的配置文件

**类比**：
- 类似于 JSON Schema 的 `$schema`
- 类似于 OpenAPI 的 `openapi: "3.0.0"`
- 类似于 Kubernetes 的 `apiVersion`

### 4.4 JSON 结构示例

```json
{
  "id": "config-20260117-a1b2c3",
  "name": "API 调试配置",
  "version": "1.0",
  "description": "用于调试后端 API 接口的拦截配置",
  "settings": {},
  "rules": [
    // 规则列表...
  ]
}
```

---

## 五、规则 (Rule)

规则是配置的核心单元，每条规则定义了：匹配什么请求、在什么阶段、执行什么行为。

### 5.1 字段定义

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `id` | string | 是 | 规则唯一标识符，格式：`rule-XXX`（如 `rule-001`），同一配置内不可重复 |
| `name` | string | 是 | 规则名称，用于展示和日志 |
| `enabled` | boolean | 是 | 是否启用此规则 |
| `priority` | integer | 是 | 优先级，数值越大越先执行 |
| `stage` | string | 是 | 生命周期阶段，必须为 `"request"` 或 `"response"` |
| `match` | object | 是 | 匹配规则（基于请求信息） |
| `actions` | array | 是 | 执行行为列表，按顺序依次执行 |

### 5.2 规则 ID 说明

**生成规则**：
- 格式：`rule-XXX`（三位数字序号）
- 示例：`rule-001`, `rule-002`, `rule-003`
- 添加规则时自动生成

**约束**：
- 长度：1-64 字符
- 字符集：`^[a-zA-Z0-9_-]+$`（字母、数字、横线、下划线）
- 同一配置内规则 ID 不可重复
- 允许用户手动修改，但需校验格式和唯一性

### 5.3 生命周期 (stage)

`stage` 字段决定规则的**行为执行时机**和**可操作内容**，不影响匹配条件。

| 值 | 执行时机 | 可执行的行为 |
|----|---------|-------------|
| `"request"` | 请求发出前 | 修改请求（URL/Method/Headers/Query/Body）、拦截请求 |
| `"response"` | 响应返回后 | 修改响应（Status/Headers/Body） |

**重要**：无论 stage 是什么，匹配条件都基于**请求信息**。

**设计原则**：
- 不允许省略 stage 字段
- 不允许同时指定两个阶段
- 如需同时处理请求和响应，创建两条独立规则

### 5.4 JSON 结构示例

```json
{
  "id": "rule-001",
  "name": "修改 API 请求",
  "enabled": true,
  "priority": 100,
  "stage": "request",
  "match": {
    "allOf": [
      { "type": "urlPrefix", "value": "https://api.example.com" }
    ]
  },
  "actions": [
    { "type": "setHeader", "name": "X-Debug", "value": "true" },
    { "type": "setHeader", "name": "X-Env", "value": "dev" },
    { "type": "removeHeader", "name": "X-Trace" }
  ]
}
```

### 5.5 执行顺序与规则

1. 按 `priority` 从大到小排序执行
2. 优先级相同时，按规则在列表中的声明顺序
3. `enabled: false` 的规则不参与匹配和执行
4. 同一规则内的 actions 按**数组顺序**依次执行
5. **aggregate 模式**：所有匹配的规则都会执行
6. **终结性行为**（block）会中断当前规则的后续行为及其他规则的执行

---

## 六、匹配规则 (match)

**核心原则**：所有匹配条件统一基于**请求信息**，与 stage 无关。

**设计原则**：
1. **字段固定**：每种条件类型有且仅有固定的字段
2. **无空字段**：每个字段都必须有值，都有意义
3. **类型明确**：通过 `type` 值就能确定结构
4. **程序优雅**：`switch type` 后直接访问对应字段，无需判空

### 6.1 Match 结构

```json
{
  "match": {
    "allOf": [ /* 条件列表，所有条件都满足才匹配 */ ],
    "anyOf": [ /* 条件列表，任一条件满足即匹配 */ ]
  }
}
```

- `allOf`：AND 逻辑，所有条件都满足才匹配
- `anyOf`：OR 逻辑，任一条件满足即匹配
- 两者可以同时使用，allOf 和 anyOf 之间是 AND 关系

### 6.2 条件结构

每个条件是一个对象，通过 `type` 字段标识条件类型：

```json
{ "type": "条件类型", ...其他固定字段 }
```

### 6.3 URL 条件

| type | 必填字段 | 说明 |
|------|---------|------|
| `urlEquals` | `value` | URL 精确匹配 |
| `urlPrefix` | `value` | URL 前缀匹配 |
| `urlSuffix` | `value` | URL 后缀匹配 |
| `urlContains` | `value` | URL 包含匹配 |
| `urlRegex` | `pattern` | URL 正则匹配 |

**示例**：
```json
{ "type": "urlPrefix", "value": "https://api.example.com" }
{ "type": "urlContains", "value": "/payment" }
{ "type": "urlRegex", "pattern": "^https://.*\\.example\\.com" }
```

### 6.4 Method 条件

| type | 必填字段 | 说明 |
|------|---------|------|
| `method` | `values` | HTTP 方法列表，任一匹配即可 |

**示例**：
```json
{ "type": "method", "values": ["POST", "PUT", "DELETE"] }
```

### 6.5 ResourceType 条件

| type | 必填字段 | 说明 |
|------|---------|------|
| `resourceType` | `values` | 资源类型列表，任一匹配即可 |

**可选值**：

| 值 | 说明 |
|----|------|
| `document` | HTML 文档 |
| `script` | JavaScript |
| `stylesheet` | CSS |
| `image` | 图片 |
| `media` | 音视频 |
| `font` | 字体 |
| `xhr` | XMLHttpRequest |
| `fetch` | Fetch API |
| `websocket` | WebSocket |
| `other` | 其他 |

**示例**：
```json
{ "type": "resourceType", "values": ["xhr", "fetch"] }
{ "type": "resourceType", "values": ["script", "stylesheet", "image"] }
```

### 6.6 Header 条件

| type | 必填字段 | 说明 |
|------|---------|------|
| `headerExists` | `name` | Header 存在 |
| `headerNotExists` | `name` | Header 不存在 |
| `headerEquals` | `name`, `value` | Header 值精确匹配 |
| `headerContains` | `name`, `value` | Header 值包含 |
| `headerRegex` | `name`, `pattern` | Header 值正则匹配 |

**示例**：
```json
{ "type": "headerExists", "name": "Authorization" }
{ "type": "headerEquals", "name": "Content-Type", "value": "application/json" }
{ "type": "headerContains", "name": "Content-Type", "value": "json" }
{ "type": "headerRegex", "name": "Accept", "pattern": "text/.*" }
```

### 6.7 Query 条件

| type | 必填字段 | 说明 |
|------|---------|------|
| `queryExists` | `name` | Query 参数存在 |
| `queryNotExists` | `name` | Query 参数不存在 |
| `queryEquals` | `name`, `value` | Query 参数精确匹配 |
| `queryContains` | `name`, `value` | Query 参数包含 |
| `queryRegex` | `name`, `pattern` | Query 参数正则匹配 |

**示例**：
```json
{ "type": "queryExists", "name": "debug" }
{ "type": "queryEquals", "name": "id", "value": "123" }
{ "type": "queryRegex", "name": "id", "pattern": "\\d+" }
```

### 6.8 Cookie 条件

| type | 必填字段 | 说明 |
|------|---------|------|
| `cookieExists` | `name` | Cookie 存在 |
| `cookieNotExists` | `name` | Cookie 不存在 |
| `cookieEquals` | `name`, `value` | Cookie 精确匹配 |
| `cookieContains` | `name`, `value` | Cookie 包含 |
| `cookieRegex` | `name`, `pattern` | Cookie 正则匹配 |

**示例**：
```json
{ "type": "cookieExists", "name": "session" }
{ "type": "cookieRegex", "name": "session", "pattern": "^prod-" }
```

### 6.9 Body 条件

| type | 必填字段 | 说明 |
|------|---------|------|
| `bodyContains` | `value` | Body 包含文本 |
| `bodyRegex` | `pattern` | Body 正则匹配 |
| `bodyJsonPath` | `path`, `value` | JSON Path 取值匹配 |

**示例**：
```json
{ "type": "bodyContains", "value": "error" }
{ "type": "bodyRegex", "pattern": "\"code\":\\s*500" }
{ "type": "bodyJsonPath", "path": "$.data.status", "value": "failed" }
```

### 6.10 条件类型完整清单

| type | 必填字段 | 说明 |
|------|---------|------|
| `urlEquals` | `value` | URL 精确匹配 |
| `urlPrefix` | `value` | URL 前缀匹配 |
| `urlSuffix` | `value` | URL 后缀匹配 |
| `urlContains` | `value` | URL 包含匹配 |
| `urlRegex` | `pattern` | URL 正则匹配 |
| `method` | `values` | HTTP 方法 |
| `resourceType` | `values` | 资源类型 |
| `headerExists` | `name` | Header 存在 |
| `headerNotExists` | `name` | Header 不存在 |
| `headerEquals` | `name`, `value` | Header 精确匹配 |
| `headerContains` | `name`, `value` | Header 包含 |
| `headerRegex` | `name`, `pattern` | Header 正则 |
| `queryExists` | `name` | Query 存在 |
| `queryNotExists` | `name` | Query 不存在 |
| `queryEquals` | `name`, `value` | Query 精确匹配 |
| `queryContains` | `name`, `value` | Query 包含 |
| `queryRegex` | `name`, `pattern` | Query 正则 |
| `cookieExists` | `name` | Cookie 存在 |
| `cookieNotExists` | `name` | Cookie 不存在 |
| `cookieEquals` | `name`, `value` | Cookie 精确匹配 |
| `cookieContains` | `name`, `value` | Cookie 包含 |
| `cookieRegex` | `name`, `pattern` | Cookie 正则 |
| `bodyContains` | `value` | Body 包含 |
| `bodyRegex` | `pattern` | Body 正则 |
| `bodyJsonPath` | `path`, `value` | JSON Path 匹配 |

### 6.11 字段规律总结

| 字段 | 用途 | 出现在 |
|------|------|--------|
| `type` | 条件类型标识 | 所有条件 |
| `value` | 匹配目标值 | 字符串匹配类条件 |
| `values` | 匹配目标列表 | method, resourceType |
| `pattern` | 正则表达式 | *Regex 类条件 |
| `name` | 键名 | header*, query*, cookie* |
| `path` | JSON Path | bodyJsonPath |

### 6.12 Go 类型定义参考

```go
type Condition struct {
    Type    string   `json:"type"`
    Value   string   `json:"value,omitempty"`
    Values  []string `json:"values,omitempty"`
    Pattern string   `json:"pattern,omitempty"`
    Name    string   `json:"name,omitempty"`
    Path    string   `json:"path,omitempty"`
}
```

### 6.13 完整 Match 示例

**示例 1：匹配特定 API 的 POST 请求**
```json
{
  "match": {
    "allOf": [
      { "type": "urlPrefix", "value": "https://api.example.com/payment" },
      { "type": "method", "values": ["POST"] },
      { "type": "resourceType", "values": ["xhr", "fetch"] }
    ]
  }
}
```

**示例 2：匹配多个 CDN 域名的静态资源**
```json
{
  "match": {
    "allOf": [
      { "type": "method", "values": ["GET"] },
      { "type": "resourceType", "values": ["script", "stylesheet", "image"] }
    ],
    "anyOf": [
      { "type": "urlContains", "value": "cdn.example.com" },
      { "type": "urlContains", "value": "static.example.com" }
    ]
  }
}
```

**示例 3：匹配带调试参数的请求**
```json
{
  "match": {
    "allOf": [
      { "type": "queryExists", "name": "debug" },
      { "type": "headerContains", "name": "User-Agent", "value": "Chrome" }
    ]
  }
}
```

---

## 七、执行行为 (actions)

**核心原则**：
1. 每条规则可包含**多个行为**，按数组顺序依次执行
2. 每种行为类型字段固定，职责单一
3. 不同阶段有不同的可用行为

### 7.1 请求阶段行为

#### 7.1.1 基础操作

| type | 必填字段 | 说明 | 终结性 |
|------|---------|------|:------:|
| `setUrl` | `value` | 设置请求 URL | 否 |
| `setMethod` | `value` | 设置请求方法 | 否 |
| `setHeader` | `name`, `value` | 设置请求头 | 否 |
| `removeHeader` | `name` | 移除请求头 | 否 |
| `setQueryParam` | `name`, `value` | 设置查询参数 | 否 |
| `removeQueryParam` | `name` | 移除查询参数 | 否 |
| `setCookie` | `name`, `value` | 设置 Cookie | 否 |
| `removeCookie` | `name` | 移除 Cookie | 否 |

**示例**：
```json
// 设置请求 URL
{ "type": "setUrl", "value": "https://new-api.example.com/path" }

// 设置请求方法
{ "type": "setMethod", "value": "PUT" }

// 设置请求头
{ "type": "setHeader", "name": "X-Debug", "value": "true" }

// 移除请求头
{ "type": "removeHeader", "name": "X-Useless" }

// 设置查询参数
{ "type": "setQueryParam", "name": "version", "value": "2" }

// 移除查询参数
{ "type": "removeQueryParam", "name": "temp" }

// 设置 Cookie
{ "type": "setCookie", "name": "session", "value": "abc123" }

// 移除 Cookie
{ "type": "removeCookie", "name": "tracking" }
```

#### 7.1.2 Body 操作

| type | 必填字段 | 可选字段 | 说明 |
|------|---------|---------|------|
| `setBody` | `value` | `encoding` | 完全替换请求体 |
| `replaceBodyText` | `search`, `replace` | `replaceAll` | 字符串替换 |
| `patchBodyJson` | `patches` | - | JSON Patch 修改 |
| `setFormField` | `name`, `value` | - | 设置表单字段（form/urlencoded） |
| `removeFormField` | `name` | - | 移除表单字段 |

**encoding 取值**：
- `text`（默认）：纯文本内容
- `base64`：Base64 编码的二进制内容

**示例**：
```json
// 完全替换请求体（文本）
{ "type": "setBody", "value": "{\"data\": \"new\"}" }

// 完全替换请求体（Base64 编码的二进制）
{ "type": "setBody", "value": "SGVsbG8gV29ybGQ=", "encoding": "base64" }

// 字符串替换（替换第一个匹配）
{ "type": "replaceBodyText", "search": "old_value", "replace": "new_value" }

// 字符串替换（替换所有匹配）
{ "type": "replaceBodyText", "search": "foo", "replace": "bar", "replaceAll": true }

// JSON Patch 修改
{ "type": "patchBodyJson", "patches": [
    { "op": "replace", "path": "/data/id", "value": "123" },
    { "op": "add", "path": "/debug", "value": true }
  ]
}

// 设置表单字段（适用于 multipart/form-data 或 application/x-www-form-urlencoded）
{ "type": "setFormField", "name": "username", "value": "test_user" }

// 移除表单字段
{ "type": "removeFormField", "name": "password" }
```

#### 7.1.3 拦截请求

| type | 必填字段 | 可选字段 | 说明 | 终结性 |
|------|---------|---------|------|:------:|
| `block` | `statusCode` | `headers`, `body`, `bodyEncoding` | 拦截请求，返回自定义响应 | **是** |

**示例**：
```json
// 拦截请求，返回 JSON 响应
{ 
  "type": "block", 
  "statusCode": 403, 
  "headers": {
    "Content-Type": "application/json",
    "X-Blocked": "true"
  },
  "body": "{\"error\": \"forbidden\"}" 
}

// 拦截请求，返回纯文本
{ 
  "type": "block", 
  "statusCode": 200, 
  "headers": { "Content-Type": "text/plain" },
  "body": "OK" 
}

// 拦截请求，返回二进制内容（Base64 编码）
{ 
  "type": "block", 
  "statusCode": 200, 
  "headers": { "Content-Type": "image/png" },
  "body": "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "bodyEncoding": "base64"
}
```

### 7.2 响应阶段行为

#### 7.2.1 基础操作

| type | 必填字段 | 说明 | 终结性 |
|------|---------|------|:------:|
| `setStatus` | `value` | 设置响应状态码 | 否 |
| `setHeader` | `name`, `value` | 设置响应头 | 否 |
| `removeHeader` | `name` | 移除响应头 | 否 |

**示例**：
```json
// 设置响应状态码
{ "type": "setStatus", "value": 200 }

// 设置响应头
{ "type": "setHeader", "name": "X-Modified", "value": "true" }

// 移除响应头
{ "type": "removeHeader", "name": "Server" }
```

#### 7.2.2 Body 操作

| type | 必填字段 | 可选字段 | 说明 |
|------|---------|---------|------|
| `setBody` | `value` | `encoding` | 完全替换响应体 |
| `replaceBodyText` | `search`, `replace` | `replaceAll` | 字符串替换 |
| `patchBodyJson` | `patches` | - | JSON Patch 修改 |

**示例**：
```json
// 完全替换响应体
{ "type": "setBody", "value": "{\"data\": \"mocked\"}" }

// 字符串替换（修改 JS/CSS/HTML 等文本内容）
{ "type": "replaceBodyText", "search": "production", "replace": "development", "replaceAll": true }

// JSON Patch 修改
{ "type": "patchBodyJson", "patches": [
    { "op": "add", "path": "/debug", "value": true },
    { "op": "replace", "path": "/data/status", "value": "success" }
  ]
}
```

### 7.3 行为类型完整清单

| type | 适用阶段 | 必填字段 | 可选字段 | 说明 |
|------|---------|---------|---------|------|
| `setUrl` | 请求 | `value` | - | 设置请求 URL |
| `setMethod` | 请求 | `value` | - | 设置请求方法 |
| `setHeader` | 请求/响应 | `name`, `value` | - | 设置头部 |
| `removeHeader` | 请求/响应 | `name` | - | 移除头部 |
| `setQueryParam` | 请求 | `name`, `value` | - | 设置查询参数 |
| `removeQueryParam` | 请求 | `name` | - | 移除查询参数 |
| `setCookie` | 请求 | `name`, `value` | - | 设置 Cookie |
| `removeCookie` | 请求 | `name` | - | 移除 Cookie |
| `setBody` | 请求/响应 | `value` | `encoding` | 完全替换 Body |
| `replaceBodyText` | 请求/响应 | `search`, `replace` | `replaceAll` | 字符串替换 |
| `patchBodyJson` | 请求/响应 | `patches` | - | JSON Patch 修改 |
| `setFormField` | 请求 | `name`, `value` | - | 设置表单字段 |
| `removeFormField` | 请求 | `name` | - | 移除表单字段 |
| `setStatus` | 响应 | `value` | - | 设置状态码 |
| `block` | 请求 | `statusCode` | `headers`, `body`, `bodyEncoding` | 拦截请求（终结性） |

### 7.4 阶段与行为对照表

| 行为 | 请求阶段 | 响应阶段 |
|------|:-------:|:-------:|
| `setUrl` | ✅ | ❌ |
| `setMethod` | ✅ | ❌ |
| `setHeader` | ✅ | ✅ |
| `removeHeader` | ✅ | ✅ |
| `setQueryParam` | ✅ | ❌ |
| `removeQueryParam` | ✅ | ❌ |
| `setCookie` | ✅ | ❌ |
| `removeCookie` | ✅ | ❌ |
| `setBody` | ✅ | ✅ |
| `replaceBodyText` | ✅ | ✅ |
| `patchBodyJson` | ✅ | ✅ |
| `setFormField` | ✅ | ❌ |
| `removeFormField` | ✅ | ❌ |
| `setStatus` | ❌ | ✅ |
| `block` | ✅ | ❌ |

### 7.5 Body 操作适用场景

| 内容类型 | 推荐操作 | 说明 |
|---------|---------|------|
| JSON | `patchBodyJson` | 按路径精确修改 |
| JSON | `setBody` | 完全替换 |
| 纯文本 (JS/CSS/HTML) | `replaceBodyText` | 字符串替换 |
| 纯文本 | `setBody` | 完全替换 |
| 表单 (form/urlencoded) | `setFormField` / `removeFormField` | 修改表单字段 |
| 二进制 | `setBody` + `encoding: base64` | 完全替换 |

### 7.6 字段规律总结

| 字段 | 类型 | 用途 |
|------|------|------|
| `type` | string | 行为类型标识 |
| `value` | string/number | 设置的目标值 |
| `name` | string | 头部/参数/Cookie/表单字段的键名 |
| `encoding` | string | Body 编码方式: `text`(default) / `base64` |
| `search` | string | 字符串替换的搜索内容 |
| `replace` | string | 字符串替换的目标内容 |
| `replaceAll` | boolean | 是否替换所有匹配，默认 false |
| `patches` | array | JSON Patch 操作列表 |
| `statusCode` | number | HTTP 状态码 |
| `headers` | object | 响应头集合（key-value） |
| `body` | string | 响应体内容 |
| `bodyEncoding` | string | block 行为的 body 编码: `text`(default) / `base64` |

### 7.7 终结性行为说明

- **终结性行为**（`block`）执行后：
  - 当前规则的后续行为**不再执行**
  - 其他规则也**不再执行**
- **非终结性行为**执行后，继续执行后续行为和其他规则

```json
// 示例：终结性行为中断后续
"actions": [
  { "type": "setHeader", "name": "X-Debug", "value": "true" },  // ✅ 执行
  { "type": "block", "statusCode": 403, "headers": {"Content-Type": "text/plain"}, "body": "forbidden" },  // ✅ 执行，终结
  { "type": "setHeader", "name": "X-After", "value": "..." }    // ❌ 不执行
]
```

### 7.8 Go 类型定义参考

```go
type Action struct {
    Type         string            `json:"type"`
    Value        any               `json:"value,omitempty"`        // string 或 number
    Name         string            `json:"name,omitempty"`
    Encoding     string            `json:"encoding,omitempty"`     // text(default) / base64
    Search       string            `json:"search,omitempty"`
    Replace      string            `json:"replace,omitempty"`
    ReplaceAll   bool              `json:"replaceAll,omitempty"`
    Patches      []JSONPatchOp     `json:"patches,omitempty"`
    StatusCode   int               `json:"statusCode,omitempty"`
    Headers      map[string]string `json:"headers,omitempty"`
    Body         string            `json:"body,omitempty"`
    BodyEncoding string            `json:"bodyEncoding,omitempty"` // text(default) / base64
}

type JSONPatchOp struct {
    Op    string `json:"op"`
    Path  string `json:"path"`
    Value any    `json:"value,omitempty"`
    From  string `json:"from,omitempty"`
}
```

---

## 八、完整示例

### 8.1 开发环境配置示例

```json
{
  "id": "debug-config-001",
  "name": "开发环境调试配置",
  "version": "2.0",
  "description": "用于本地开发时调试 API 请求和响应",
  "settings": {},
  "rules": [
    {
      "id": "rule-001",
      "name": "API 请求添加调试信息",
      "enabled": true,
      "priority": 100,
      "stage": "request",
      "match": {
        "allOf": [
          { "type": "urlPrefix", "value": "https://api.example.com" },
          { "type": "method", "values": ["POST", "PUT"] },
          { "type": "resourceType", "values": ["xhr", "fetch"] }
        ]
      },
      "actions": [
        { "type": "setHeader", "name": "X-Debug", "value": "true" },
        { "type": "setHeader", "name": "X-Env", "value": "development" },
        { "type": "removeHeader", "name": "X-Production-Only" },
        { "type": "setCookie", "name": "debug", "value": "1" }
      ]
    },
    {
      "id": "rule-002",
      "name": "修改 API 响应",
      "enabled": true,
      "priority": 90,
      "stage": "response",
      "match": {
        "allOf": [
          { "type": "urlPrefix", "value": "https://api.example.com" }
        ]
      },
      "actions": [
        { "type": "setHeader", "name": "X-Modified", "value": "true" },
        { "type": "patchBodyJson", "patches": [
            { "op": "add", "path": "/_debug", "value": true }
          ]
        }
      ]
    }
  ]
}
```

### 8.2 拦截请求示例

```json
{
  "id": "block-config-001",
  "name": "拦截特定请求",
  "version": "2.0",
  "description": "拦截特定 API 并返回 Mock 数据",
  "settings": {},
  "rules": [
    {
      "id": "rule-001",
      "name": "拦截支付接口",
      "enabled": true,
      "priority": 100,
      "stage": "request",
      "match": {
        "allOf": [
          { "type": "urlContains", "value": "/payment" },
          { "type": "method", "values": ["POST"] }
        ]
      },
      "actions": [
        { 
          "type": "block", 
          "statusCode": 200, 
          "headers": {
            "Content-Type": "application/json",
            "X-Mock": "true"
          },
          "body": "{\"success\": true, \"orderId\": \"mock-12345\"}" 
        }
      ]
    }
  ]
}
```

### 8.3 Body 操作示例

```json
{
  "id": "body-modify-config",
  "name": "Body 修改示例",
  "version": "2.0",
  "description": "展示各种 Body 操作方式",
  "settings": {},
  "rules": [
    {
      "id": "rule-001",
      "name": "修改 JSON 请求体",
      "enabled": true,
      "priority": 100,
      "stage": "request",
      "match": {
        "allOf": [
          { "type": "urlContains", "value": "/api/user" },
          { "type": "headerContains", "name": "Content-Type", "value": "json" }
        ]
      },
      "actions": [
        { "type": "patchBodyJson", "patches": [
            { "op": "replace", "path": "/userId", "value": "test-user-001" },
            { "op": "add", "path": "/debug", "value": true }
          ]
        }
      ]
    },
    {
      "id": "rule-002",
      "name": "修改表单请求",
      "enabled": true,
      "priority": 100,
      "stage": "request",
      "match": {
        "allOf": [
          { "type": "urlContains", "value": "/api/upload" },
          { "type": "headerContains", "name": "Content-Type", "value": "form" }
        ]
      },
      "actions": [
        { "type": "setFormField", "name": "source", "value": "debug" },
        { "type": "removeFormField", "name": "tracking_id" }
      ]
    },
    {
      "id": "rule-003",
      "name": "修改 JS 响应",
      "enabled": true,
      "priority": 100,
      "stage": "response",
      "match": {
        "allOf": [
          { "type": "resourceType", "values": ["script"] },
          { "type": "urlContains", "value": "main.js" }
        ]
      },
      "actions": [
        { "type": "replaceBodyText", "search": "production", "replace": "development", "replaceAll": true }
      ]
    }
  ]
}
```

### 8.4 多规则协同示例

```json
{
  "id": "multi-rule-config",
  "name": "多规则协同工作",
  "version": "2.0",
  "description": "多条规则匹配同一请求，行为叠加执行",
  "settings": {},
  "rules": [
    {
      "id": "rule-001",
      "name": "请求阶段 - 添加调试头",
      "enabled": true,
      "priority": 100,
      "stage": "request",
      "match": {
        "allOf": [
          { "type": "urlPrefix", "value": "https://api.example.com" }
        ]
      },
      "actions": [
        { "type": "setHeader", "name": "X-Debug", "value": "true" }
      ]
    },
    {
      "id": "rule-002",
      "name": "请求阶段 - 添加版本参数",
      "enabled": true,
      "priority": 90,
      "stage": "request",
      "match": {
        "allOf": [
          { "type": "urlPrefix", "value": "https://api.example.com" }
        ]
      },
      "actions": [
        { "type": "setQueryParam", "name": "_v", "value": "2" }
      ]
    },
    {
      "id": "rule-003",
      "name": "响应阶段 - 修改状态码",
      "enabled": true,
      "priority": 100,
      "stage": "response",
      "match": {
        "allOf": [
          { "type": "urlPrefix", "value": "https://api.example.com" }
        ]
      },
      "actions": [
        { "type": "setStatus", "value": 200 }
      ]
    },
    {
      "id": "rule-004",
      "name": "响应阶段 - 修改响应体",
      "enabled": true,
      "priority": 90,
      "stage": "response",
      "match": {
        "allOf": [
          { "type": "urlPrefix", "value": "https://api.example.com" }
        ]
      },
      "actions": [
        { "type": "patchBodyJson", "patches": [
            { "op": "add", "path": "/_modified", "value": true }
          ]
        }
      ]
    }
  ]
}
```

**说明**：上例中 4 条规则都匹配 `https://api.example.com` 的请求：
- 请求阶段：rule-001 和 rule-002 依次执行，添加调试头和版本参数
- 响应阶段：rule-003 和 rule-004 依次执行，修改状态码和响应体

---

## 九、与旧版对比

| 方面 | 旧版 (v1) | 新版 (v2) |
|------|----------|----------|
| 配置元信息 | 仅 version | id, name, version, description, settings |
| version 语义 | 配置内容版本 | **配置格式规范版本**（用于选择解析器） |
| 阶段指定 | stage 是条件之一，可省略 | stage 是规则必填属性，决定行为执行时机 |
| 匹配条件 | 根据 stage 不同而不同 | **统一基于请求信息**，与 stage 无关 |
| 条件设计 | 万能 Condition 结构，字段可空 | **细粒度条件类型**，字段固定 |
| 启用控制 | 无 | enabled 字段 |
| 行为数量 | 多字段可并存，隐式优先级 | **多行为数组**，按顺序执行 |
| 行为设计 | 粗粒度 rewrite/respond | **细粒度行为类型**，字段固定 |
| 执行模式 | short_circuit（短路） | **aggregate（聚合）**，终结性行为中断 |
| 组合逻辑 | allOf/anyOf/noneOf | 保留 allOf/anyOf |
| 审批功能 | pause 行为 | **移除**，简化复杂度 |
| 延迟功能 | delay 行为 | **移除**，简化复杂度 |

---

## 十、后续工作

### 10.1 已完成

- [x] 配置 (Config) 结构设计
- [x] 规则 (Rule) 结构设计
- [x] 匹配规则 (match) 具体设计（25 种细粒度条件类型）
- [x] 执行行为 (actions) 具体设计（15 种细粒度行为类型）
- [x] 多行为支持设计
- [x] Cookie 操作（setCookie/removeCookie）
- [x] Body 操作优化（setBody/replaceBodyText/patchBodyJson/setFormField）
- [x] block 行为 headers 支持
- [x] 完整示例

### 10.2 待实现

1. **代码实现**
   - [ ] Go 类型定义（pkg/rulespec/types.go）
   - [ ] 规则引擎重构（internal/rules/engine.go）
   - [ ] 配置加载/保存逻辑
   - [ ] GUI 编辑器适配
   - [ ] 阶段与行为校验（确保行为适用于当前 stage）

2. **辅助工具**
   - [ ] JSON Schema 定义
   - [ ] 旧版配置迁移工具
   - [ ] 配置校验逻辑

3. **清理工作**
   - [ ] 移除审批功能相关代码
   - [ ] 移除延迟功能相关代码

---

*文档版本: v1.0*
*最后更新: 2026-01-15*
