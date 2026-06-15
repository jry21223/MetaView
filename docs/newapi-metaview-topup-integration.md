# NewAPI 真实站点兼容 MetaView 充值接入说明

本文面向 NewAPI 站点技术人员，说明如何把 NewAPI 钱包充值入口接入 MetaView 收银台。示例域名使用 `https://newapi.example.com` 与 `https://metaview.example.com`，生产部署请替换为自己的 HTTPS 域名。

首版接入采用 **signed intent + MetaView receipt + NewAPI 幂等加 quota**。不要把 NewAPI 原生 redemption code 作为主路径：原生兑换码仍保留给后台批量发码，本接入只把 MetaView 支付结果作为一次性 receipt 凭证，NewAPI 服务端验真后直接给当前用户增加 quota。

## 1. 总体流程

```text
NewAPI 用户选择充值金额
  -> NewAPI 服务端生成 signed intent
  -> 浏览器跳转到 MetaView 收银台
  -> MetaView 微信支付成功
  -> MetaView 携带 receipt_code 跳回 NewAPI callback
  -> NewAPI 服务端调用 MetaView verify
  -> NewAPI 事务内记录 topup 并 users.quota += quota_delta
  -> NewAPI 调用 MetaView ack
  -> 回到 NewAPI 钱包页展示成功
```

关键边界：

- 金额由 NewAPI 生成的 signed intent 决定，MetaView 不接受浏览器临时改金额。
- NewAPI 不信任浏览器回调参数，必须服务端调用 MetaView verify。
- `intent_id` 是唯一业务流水，重复 callback、重复 verify、刷新页面都不能重复加 quota。
- MetaView 不保存 NewAPI 用户 token，不要求 NewAPI 用户登录 MetaView。

## 2. 环境变量

NewAPI 生产环境需要增加：

```bash
METAVIEW_CHECKOUT_URL=https://metaview.example.com/api/v1/newapi/topups/start
METAVIEW_RETURN_URL=https://newapi.example.com/api/user/metaview/topup/callback
METAVIEW_INTENT_SECRET=<METAVIEW_INTENT_SECRET>
METAVIEW_RECEIPT_VERIFY_URL=https://metaview.example.com/api/v1/internal/newapi/topup-receipts/verify
METAVIEW_RECEIPT_ACK_URL=https://metaview.example.com/api/v1/internal/newapi/topup-receipts/ack
METAVIEW_RECEIPT_TOKEN=<METAVIEW_RECEIPT_TOKEN>
```

安全要求：

- `<METAVIEW_INTENT_SECRET>` 与 MetaView 的 `METAVIEW_NEWAPI_TOPUP_INTENT_SECRET` 必须一致。
- `<METAVIEW_RECEIPT_TOKEN>` 与 MetaView 的 `METAVIEW_NEWAPI_TOPUP_RECEIPT_TOKEN` 必须一致。
- 密钥只放服务端环境变量，不返回给前端，不写日志，不放仓库。
- MetaView 侧需要把 `https://newapi.example.com` 加入 `METAVIEW_NEWAPI_TOPUP_ALLOWED_RETURN_ORIGINS`。

## 3. Public Interfaces

### 3.1 NewAPI 发起跳转

NewAPI 前端钱包选择 `metaview_topup` 支付方式后，请调用 NewAPI 后端：

```http
POST /api/user/metaview/topup/start
Content-Type: application/json

{
  "amount": 5
}
```

`amount` 单位为人民币元，必须取整并满足 NewAPI 的最小充值金额规则。

成功响应：

```json
{
  "success": true,
  "message": "",
  "data": {
    "jump_url": "https://metaview.example.com/api/v1/newapi/topups/start?payload=...&sig=..."
  }
}
```

前端收到 `jump_url` 后直接跳转：

```ts
window.location.href = response.data.jump_url;
```

### 3.2 MetaView 收银台

NewAPI 后端生成的跳转地址：

```http
GET https://metaview.example.com/api/v1/newapi/topups/start?payload=<base64url-json>&sig=<hmac-sha256>
```

`payload` 解码后的 JSON：

```json
{
  "newapi_user_id": 4,
  "amount_cents": 500,
  "quota_delta": 2500000,
  "state": "random-opaque-state",
  "return_url": "https://newapi.example.com/api/user/metaview/topup/callback?newapi_user_id=4",
  "expires_at": "2026-06-04T12:00:00Z"
}
```

字段说明：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `newapi_user_id` | int | NewAPI 当前登录用户 ID |
| `amount_cents` | int | 充值金额，单位分，`5` 元即 `500` |
| `quota_delta` | int | 本次应增加的 NewAPI quota |
| `state` | string | NewAPI 生成的随机串，用于防串单 |
| `return_url` | string | MetaView 支付成功后跳回 NewAPI 的地址 |
| `expires_at` | string | ISO 8601 UTC 时间，建议 15 分钟内过期 |

换算规则固定为：

```text
1 元 = 500000 quota
quota_delta = amount_cents * 500000 / 100
```

示例：

```text
amount_cents = 500
quota_delta = 500 * 500000 / 100 = 2500000
```

### 3.3 NewAPI 回调

MetaView 支付成功后会跳回 `return_url`，并追加：

```http
GET https://newapi.example.com/api/user/metaview/topup/callback?newapi_user_id=4&state=...&intent_id=nup...&receipt_code=mvr_...
```

NewAPI callback 只把这些参数当作线索，不能直接入账。必须进入服务端 verify 流程。

### 3.4 NewAPI 服务端验真

NewAPI 服务端调用 MetaView：

```http
POST https://metaview.example.com/api/v1/internal/newapi/topup-receipts/verify
Authorization: Bearer <METAVIEW_RECEIPT_TOKEN>
Content-Type: application/json

{
  "intent_id": "nupxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
  "receipt_code": "mvr_xxxxxxxxxxxxxxxxxxxxx",
  "newapi_user_id": 4,
  "state": "random-opaque-state"
}
```

成功响应：

```json
{
  "status": "verified",
  "intent_id": "nupxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
  "order_id": "nupxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
  "newapi_user_id": 4,
  "amount_cents": 500,
  "amount_yuan": "5.00",
  "quota_delta": 2500000,
  "paid_at": "2026-06-04T04:00:00+00:00"
}
```

NewAPI 必须校验响应：

- `newapi_user_id` 等于当前回调里的用户 ID。
- `intent_id` 等于回调里的 `intent_id`。
- `quota_delta > 0`。
- `status` 为 `verified` 或 `acked`。

### 3.5 NewAPI 服务端确认入账

NewAPI 完成本地入账后调用：

```http
POST https://metaview.example.com/api/v1/internal/newapi/topup-receipts/ack
Authorization: Bearer <METAVIEW_RECEIPT_TOKEN>
Content-Type: application/json

{
  "intent_id": "nupxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
  "newapi_user_id": 4,
  "state": "random-opaque-state"
}
```

成功响应：

```json
{
  "status": "acked",
  "intent_id": "nupxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
  "acked_at": "2026-06-04T04:00:05+00:00"
}
```

如果 ack 失败但 NewAPI 已经本地入账，不能回滚用户 quota；应记录 warning，后续可人工补 ack。

## 4. 签名规则

NewAPI 生成跳转时：

```text
raw_json = JSON.stringify(payload)
payload = base64url(raw_json)     # URL-safe, no padding
sig = base64url(HMAC-SHA256(payload, METAVIEW_INTENT_SECRET))
```

注意：签名对象是最终发送的 `payload` 字符串，不是原始 JSON 字节。MetaView 收到后会用同一个 secret 对 `payload` 字符串重新计算 HMAC，并用 constant-time compare 校验。

Go 示例：

```go
func signMetaViewPayload(payload any, secret string) (string, string, error) {
    raw, err := json.Marshal(payload)
    if err != nil {
        return "", "", err
    }
    body := base64.RawURLEncoding.EncodeToString(raw)
    mac := hmac.New(sha256.New, []byte(secret))
    _, _ = mac.Write([]byte(body))
    sig := base64.RawURLEncoding.EncodeToString(mac.Sum(nil))
    return body, sig, nil
}
```

## 5. NewAPI 源码改动建议

### 后端

建议新增 `controller/topup_metaview.go`：

- `RequestMetaViewTopup`：检查环境变量、读取当前 `user_id`、校验充值金额、生成 signed intent、返回 `jump_url`。
- `MetaViewTopupCallback`：接收 MetaView 回跳参数，调用 verify，校验响应，调用本地入账，再调用 ack。
- `postMetaViewJSON`：统一给 MetaView internal 接口加 `Authorization: Bearer <METAVIEW_RECEIPT_TOKEN>`。
- `completeMetaViewTopup`：在数据库事务内创建 NewAPI topup 记录并增加用户 quota。

注册路由：

```go
userRoute.GET("/metaview/topup/callback", middleware.CriticalRateLimit(), controller.MetaViewTopupCallback)
selfRoute.POST("/metaview/topup/start", middleware.CriticalRateLimit(), controller.RequestMetaViewTopup)
```

`completeMetaViewTopup` 的幂等逻辑必须满足：

```text
trade_no = intent_id
payment_method = metaview_topup
payment_provider = metaview_topup

if trade_no 已存在且属于同一 user_id + metaview_topup + success:
    return success，不再加 quota
if trade_no 已存在但属于其他用户或其他支付方式:
    return error
否则:
    事务内创建 topup success 记录
    users.quota += quota_delta
```

### 前端

钱包前端新增支付方式：

```text
type = metaview_topup
name = MetaView 微信充值
```

支付按钮逻辑：

```ts
if (paymentType === "metaview_topup") {
  const response = await requestMetaViewTopup({ amount });
  window.location.href = response.data.jump_url;
  return;
}
```

回跳结果页可以复用 `/console/topup`，通过查询参数展示结果：

```text
/console/topup?metaview_topup=success&detail=<intent_id>
/console/topup?metaview_topup=error&detail=verify_failed
```

## 6. 错误处理与安全要求

- NewAPI 不得在前端保存或展示 `METAVIEW_INTENT_SECRET`、`METAVIEW_RECEIPT_TOKEN`。
- NewAPI 日志不得打印完整 `receipt_code` 或 bearer token。
- MetaView verify 返回非 2xx 时，不得入账。
- verify 成功但本地入账失败时，不得 ack；保留错误日志，方便人工排查。
- 本地入账成功但 ack 失败时，不得重复加 quota；再次 callback 时仍应通过 `intent_id` 幂等判断。
- `return_url` 必须固定为你的 NewAPI HTTPS 域名下的 callback，不允许由浏览器传入。
- `expires_at` 建议设置为当前时间后 15 分钟，过期 intent 会被 MetaView 拒绝。

## 7. 验收测试

### 正常路径

1. NewAPI 用户在钱包选择 MetaView 微信充值。
2. 输入 `5` 元。
3. NewAPI 生成跳转并打开 MetaView 收银台。
4. MetaView 支付成功后跳回 NewAPI callback。
5. NewAPI verify 成功，本地用户增加 `2500000` quota。
6. NewAPI 调用 ack 成功，钱包页展示充值成功。

### 失败路径

- 篡改 `amount_cents`、`quota_delta`、`return_url`、`expires_at` 或 `sig`，MetaView 必须拒绝。
- 使用错误 `receipt_code`，verify 必须拒绝。
- 使用错误 `newapi_user_id` 或错误 `state`，verify 必须拒绝。
- 同一 `intent_id` 重复回调两次，NewAPI 只能加一次 quota。
- MetaView internal verify/ack 网络不可达时，NewAPI 必须返回错误或展示失败，不能静默入账。

## 8. 对账字段

建议 NewAPI 在 topup 记录中保留：

| 字段 | 建议值 |
| --- | --- |
| `trade_no` | MetaView `intent_id` |
| `payment_method` | `metaview_topup` |
| `payment_provider` | `metaview_topup` |
| `amount` | `amount_cents / 100` |
| `money` | `amount_yuan` |
| `status` | success |
| `complete_time` | NewAPI 入账时间 |

这样 NewAPI 后台可以按 `payment_provider = metaview_topup` 单独统计 MetaView 收银台带来的充值收入。

