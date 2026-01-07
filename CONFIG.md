# 网络拦截规则 JSON 配置说明

本文档专门说明 **网络拦截器的 JSON 规则配置**，即如何通过 JSON 描述：

- 匹配哪些网络请求 / 响应（Match / Condition）
- 命中后如何修改或拦截（Action / Rewrite / BodyPatch / Respond / Fail / Pause 等）

所有示例均基于 `RuleSet` 的 JSON 结构，可直接用于配置或生成规则。

---

## 一、规则集结构（RuleSet, Rule）

规则集描述在一个会话中启用哪些规则，以及它们的优先级和执行模式。

简化结构：

```go
type RuleSet struct {
	Version string `json:"version"`
	Rules   []Rule `json:"rules"`
}

type Rule struct {
	ID       RuleID `json:"id"`
	Priority int    `json:"priority"`
	Mode     string `json:"mode"`   // "short_circuit" | "aggregate"
	Match    Match  `json:"match"`
	Action   Action `json:"action"`
}
```

### 1. Version

- 含义：规则集版本号，目前约定为字符串，如 `"1.0"`。
- 用途：用于后续 schema 版本兼容与迁移。
- 示例：

```json
{
  "version": "1.0"
}
```

### 2. Rule.ID

- 含义：规则唯一标识，用于统计和日志追踪。
- 规则：
  - 在同一 RuleSet 中必须唯一。
  - 建议使用有意义的字符串，例如 `"inject_500"`、`"manual_edit_payment"`。

### 3. Rule.Priority

- 含义：规则优先级，数值越大优先级越高。
- 规则：
  - 引擎会按优先级从高到低进行匹配。
  - 相同优先级下保证稳定排序（按声明顺序）。
- 示例：

```json
{ "id": "inject_500", "priority": 90 }
```

### 4. Rule.Mode

- 含义：规则执行模式。
- 可选值：
  - `"short_circuit"`：短路模式，某条规则命中并执行后，停止后续规则匹配。
  - `"aggregate"`：聚合模式，可将多条规则的动作组合应用（后续阶段可扩展）。

示例：

```json
{ "id": "inject_500", "mode": "short_circuit" }
```

---

## 二、匹配规则配置（Match, Condition）

### 1. Match 组合逻辑

```go
type Match struct {
    AllOf  []Condition `json:"allOf"`
    AnyOf  []Condition `json:"anyOf"`
    NoneOf []Condition `json:"noneOf"`
}
```

- `allOf`：全部条件为真才命中（逻辑 AND）。
- `anyOf`：任意一个条件为真即命中（逻辑 OR）。
- `noneOf`：所有条件均为假才命中（逻辑 NOT/排除）。

可以混合使用，例如：

```json
"match": {
  "allOf": [
    { "type": "url", "mode": "prefix", "pattern": "https://api.example.com/payment" },
    { "type": "method", "values": ["POST"] }
  ],
  "noneOf": [
    { "type": "probability", "value": "0.0" }
  ]
}
```

### 2. Condition 通用字段

```go
type Condition struct {
    Type    ConditionType `json:"type"`
    Mode    ConditionMode `json:"mode"`
    Pattern string        `json:"pattern"`
    Values  []string      `json:"values"`
    Key     string        `json:"key"`
    Op      ConditionOp   `json:"op"`
    Value   string        `json:"value"`
    Pointer string        `json:"pointer"`
}
```

不同 `Type` 会使用不同的字段，下文分别说明。

### 3. URL 条件（type = "url"）

- 字段：
  - `mode`: `"prefix" | "regex" | "exact"`
  - `pattern`: 要匹配的 URL 模式，例如前缀或正则表达式。
- 示例：

```json
{ "type": "url", "mode": "prefix", "pattern": "https://api.example.com/payment" }
```

### 4. 方法条件（type = "method"）

- 字段：
  - `values`: 方法集合，例如 `["GET", "POST"]`。
- 示例：

```json
{ "type": "method", "values": ["POST"] }
```

### 5. 头部条件（type = "header"）

- 字段：
  - `key`: 头部名（大小写不敏感），如 `"Content-Type"`。
  - `op`: `"equals" | "contains" | "regex"`。
  - `value`: 期望值或模式。
- 示例：

```json
{ "type": "header", "key": "X-Route", "op": "equals", "value": "pay" }
```

### 6. Query 条件（type = "query"）

- 字段与 header 类似：`key`, `op`, `value`。
- 针对 URL 查询参数，例如 `?user=123`。

示例：

```json
{ "type": "query", "key": "user", "op": "equals", "value": "123" }
```

### 7. Cookie 条件（type = "cookie"）

- 字段：`key`, `op`, `value`，用于匹配请求 Cookie。

示例：

```json
{ "type": "cookie", "key": "session", "op": "regex", "value": "^prod-" }
```

### 8. 文本条件（type = "text"）

- 用于匹配请求或响应 Body 文本内容（例如 `text/*` 或 JSON 转字符串）。
- 字段：
  - `op`: `"equals" | "contains" | "regex"`
  - `value`: 要匹配的文本或正则表达式。

示例：

```json
{ "type": "text", "op": "contains", "value": "ERROR" }
```

### 9. MIME 条件（type = "mime"）

- 字段：
  - `mode`: `"exact" | "prefix"`
  - `pattern`: MIME 类型或前缀，如 `"application/json"` 或 `"text/"`。

示例：

```json
{ "type": "mime", "mode": "prefix", "pattern": "application/json" }
```

### 10. 体积条件（type = "size"）

- 用于按 Body 大小进行规则控制。
- 字段：
  - `op`: `"lt" | "lte" | "gt" | "gte" | "between"`。
  - `value`: 数字或区间上限/下限（目前实现主要使用单值比较，可按需要扩展）。

示例：

```json
{ "type": "size", "op": "lt", "value": "1048576" }
```

### 11. 概率条件（type = "probability"）

- 用于按概率采样地触发规则。
- 字段：
  - `value`: 0.0–1.0 之间的字符串，如 `"0.1"` 代表 10% 概率。

示例（禁用规则）：

```json
{ "type": "probability", "value": "0.0" }
```

### 12. 时间窗口条件（type = "time_window"）

- 用于限定规则生效时间段（具体格式可根据后续扩展定义）。
- 当前可用作占位字段，为将来拓展预留。

### 13. JSON Pointer 条件（type = "json_pointer"）

- 用于按 JSON Pointer 读取 JSON Body 并匹配。
- 字段：
  - `pointer`: JSON Pointer 路径，如 `"/data/id"`。
  - `op`: 与文本相同，例如 `"equals" | "regex"`。
  - `value`: 期望值或正则表达式。

示例：

```json
{
  "type": "json_pointer",
  "pointer": "/data/id",
  "op": "equals",
  "value": "123"
}
```

---

## 三、动作配置（Action）

动作定义命中规则后如何处理请求/响应。

```go
type Action struct {
    Rewrite  *Rewrite `json:"rewrite"`
    Respond  *Respond `json:"respond"`
    Fail     *Fail    `json:"fail"`
    DelayMS  int      `json:"delayMS"`
    DropRate float64  `json:"dropRate"`
    Pause    *Pause   `json:"pause"`
}
```

### 1. Rewrite：请求/响应重写

```go
type Rewrite struct {
    URL     *string            `json:"url"`
    Method  *string            `json:"method"`
    Headers map[string]*string `json:"headers"`
    Query   map[string]*string `json:"query"`
    Cookies map[string]*string `json:"cookies"`
    Body    *BodyPatch         `json:"body"`
}
```

- `url`：重写请求的 URL。
- `method`：重写 HTTP 方法。
- `headers`：添加/修改/删除头部。
  - 值为字符串指针：
    - 非空：设置或覆盖该头部。
    - `null`：删除该头部。
- `query`：对查询参数进行 set/remove 操作（语义同 headers）。
- `cookies`：对 Cookie 进行 set/remove 操作。

#### BodyPatch

```go
type BodyPatch struct {
    JSONPatch []JSONPatchOp   `json:"jsonPatch,omitempty"`
    TextRegex *TextRegexPatch `json:"textRegex,omitempty"`
    Base64    *Base64Patch    `json:"base64,omitempty"`
}

type JSONPatchOp struct {
    Op    JSONPatchOpType `json:"op"`
    Path  string          `json:"path"`
    From  string          `json:"from,omitempty"`
    Value any             `json:"value,omitempty"`
}
```

- `jsonPatch`：按 RFC6902 对 JSON 文档进行增删改等操作。
  - `op`：`"add" | "remove" | "replace" | "move" | "copy" | "test"`。
  - `path`：JSON Pointer 路径，如 `"/data/id"`。
  - `from`：用于 `move`、`copy` 的源路径。
  - `value`：用于 `add`、`replace`、`test` 的值。

示例：在响应 JSON 根节点增加 `_cdpnetool/demo: true` 字段：

```json
"body": {
  "jsonPatch": [
    { "op": "add", "path": "/_cdpnetool/demo", "value": true }
  ]
}
```

```go
Body: &rulespec.BodyPatch{
    JSONPatch: []rulespec.JSONPatchOp{
        {
            Op:    rulespec.JSONPatchOpAdd,
            Path:  "/_cdpnetool/demo",
            Value: true,
        },
    },
}
```

- `textRegex`：基于正则表达式的文本替换。

```go
type TextRegexPatch struct {
    Pattern string `json:"pattern"`
    Replace string `json:"replace"`
}
```

示例：将响应体中的 `foo` 替换为 `bar`：

```json
"body": {
  "textRegex": {
    "pattern": "foo",
    "replace": "bar"
  }
}
```

- `base64`：使用 Base64 编码的二进制覆盖 Body。

```go
type Base64Patch struct {
    Value string `json:"value"`
}
```

示例：直接指定完整响应体：

```json
"body": {
  "base64": {
    "value": "eyJlcnJvciI6ICJmYWlsZWQifQ=="  // {"error":"failed"}
  }
}
```

### 2. Respond：直接返回自定义响应

```go
type Respond struct {
    Status  int               `json:"status"`
    Headers map[string]string `json:"headers"`
    Body    []byte            `json:"body"`
    Base64  bool              `json:"base64"`
}
```

- `status`：HTTP 状态码。
- `headers`：响应头键值对。
- `body`：响应体内容；按 `base64` 决定是否进行 Base64 解码。
- `base64`：为 `true` 时，`body` 以 Base64 字符串表示二进制内容。

JSON 示例：

```json
"respond": {
  "status": 500,
  "headers": { "Content-Type": "application/json" },
  "body": "eyJlcnJvciI6ICJmYWlsZWQifQ==",
  "base64": true
}
```

### 3. Fail：模拟失败

```go
type Fail struct {
    Reason string `json:"reason"`
}
```

- `reason`：描述失败原因的字符串，例如 `"ConnectionFailed"`。

### 4. DelayMS：延迟注入

- 含义：在执行动作前增加固定延迟（毫秒）。
- 用途：模拟网络抖动、服务慢响应等场景。

示例：

```json
"delayMS": 50
```

### 5. DropRate：丢弃率

- 含义：按一定概率丢弃请求或响应（可用于故障注入）。
- 取值：0.0–1.0，表示百分比。

### 6. Pause：手动审批/修改

```go
type Pause struct {
    Stage         PauseStage `json:"stage"`       // "request" | "response"
    TimeoutMS     int        `json:"timeoutMS"`
    DefaultAction struct {
        Type   PauseDefaultActionType `json:"type"`   // "continue_original"|"continue_mutated"|"fulfill"|"fail"
        Status int                    `json:"status"`
        Reason string                 `json:"reason"`
    } `json:"defaultAction"`
}
```

- `stage`：暂停阶段，`"request"` 或 `"response"`。
- `timeoutMS`：等待人工审批的最大时间，超过后执行默认动作。
- `defaultAction.type`：
  - `"continue_original"`：忽略修改，继续原始请求/响应。
  - `"continue_mutated"`：使用已应用的自动重写结果继续。
  - `"fulfill"`：使用用户提供的响应 fulfill。
  - `"fail"`：使请求失败，并使用 `reason` 描述。

简单示例：

```json
"pause": {
  "stage": "request",
  "timeoutMS": 5000,
  "defaultAction": {
    "type": "continue_original"
  }
}
```

---

## 四、规则 JSON 综合示例

### 示例 1：手动编辑支付请求

```json
{
  "version": "1.0",
  "rules": [
    {
      "id": "manual_edit_payment",
      "priority": 200,
      "mode": "short_circuit",
      "match": {
        "allOf": [
          { "type": "url", "mode": "prefix", "pattern": "https://api.example.com/payment" },
          { "type": "method", "values": ["POST"] }
        ]
      },
      "action": {
        "pause": {
          "stage": "request",
          "timeoutMS": 5000,
          "defaultAction": { "type": "continue_original" }
        }
      }
    }
  ]
}
```

### 示例 2：为所有 JSON 响应注入调试字段

```json
{
  "version": "1.0",
  "rules": [
    {
      "id": "demo_resp_patch",
      "priority": 100,
      "mode": "short_circuit",
      "match": {
        "allOf": [
          { "type": "mime", "mode": "prefix", "pattern": "application/json" }
        ]
      },
      "action": {
        "rewrite": {
          "body": {
            "jsonPatch": [
              { "op": "add", "path": "/_cdpnetool/demo", "value": true }
            ]
          }
        }
      }
    }
  ]
}
```

---

以上即为当前版本网络拦截器的 **JSON 规则配置** 说明。后续如有新的匹配类型或动作字段扩展，可在保持现有字段向后兼容的前提下，继续在本文件中补充说明。
