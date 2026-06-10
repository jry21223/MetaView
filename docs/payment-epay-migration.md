# MetaView 支付主链路迁移：微信 APIv3 -> EasyPay

## 1. 迁移目标

1. 充值下单与回调主路径统一改为 `easypay`。
2. `wechat*` 配置保留为 `legacy/deprecated`，仅用于回滚与兼容观察，不作为主入口。
3. 形成“创建订单 → 跳转支付页 → 回调入账 → 幂等重复保护”的闭环。

## 2. 生效配置（主配置）

- `METAVIEW_PAYMENT_GATEWAY=easypay`
- `METAVIEW_EPAY_API_BASE`（网关域名，必填）
- `METAVIEW_EPAY_SUBMIT_PATH`（网关提交路径，建议 `/submit.php`）
- `METAVIEW_EPAY_PID` 或 `METAVIEW_EPAY_MERCHANT_ID`（商户标识，二选一）
- `METAVIEW_EPAY_KEY` 或 `METAVIEW_EPAY_API_KEY`（签名密钥，二选一）
- `METAVIEW_EPAY_PAY_TYPE`（默认 `wxpay`，也可按网关实际改）
- `METAVIEW_EPAY_SIGN_TYPE`（默认 `MD5`）
- `METAVIEW_EPAY_NOTIFY_URL`（回调地址，**必填**）
- `METAVIEW_EPAY_RETURN_URL`（回跳地址，**必填**）

此外保留兼容变量（不作为主路径）：

- `METAVIEW_EPAY_SUBMIT_URL`
- `METAVIEW_EASYPAY_*`（`epay` 别名回退）

`payment_enabled` 的判断已收紧为：
`epay_api_base + epay_pid + epay_key + epay_notify_url + epay_return_url` 全部有值才可用。

## 3. 回调与签名规则

`EasyPayClient.decode_notification` 同时支持：

- `GET` 查询参数回调
- `POST` form 表单回调
- `POST` JSON 回调

签名规则：

- 排序前剔除空值（`""` 或 `None`）
- 排序前剔除 `sign` 与 `sign_type`
- 拼接 `k=v`（按 key 升序）后追加商户密钥，计算 `md5` 并转小写十六进制

回调成功条件：`trade_status == TRADE_SUCCESS`。

## 4. 回调路由与返回

- 主入口：`GET /api/v1/billing/epay/notify`，同时支持 `POST`
- 兼容入口：`GET /api/v1/billing/wechat/notify`（仅复用主处理，不再依赖微信 v3 逻辑）
- 成功响应：`text/plain` `success`
- 失败响应：`text/plain` `fail`，状态码 `400`

## 5. 入账与幂等

- `trade_state != SUCCESS` 不入账，直接失败（账户主链路）
- 金额不一致、订单不存在、订单未待支付均返回失败
- 重复回调允许命中已支付订单并返回成功，但不重复记账
- `paid_at` 与 `provider_order_id` 会持久化落库

## 6. 生产环境约束

1. `METAVIEW_EPAY_NOTIFY_URL` 与 `METAVIEW_EPAY_RETURN_URL` 必须是公网可达地址，不能使用本机地址做生产回调。
2. 为避免微信 APIv3 配置泄露，`MetaView` 不应保存微信 APIv3 证书、平台公钥与私钥；相关证书与 `APIv3 Key` 由网关侧维护。

## 7. 结果页与前端行为

- 创建充值后不再渲染二维码；后端返回 `code_url` 即直接跳转；
- 结果页建议使用 `/payment/result?out_trade_no=...` 或 `...?order_id=...` 进行轮询展示“支付中 / 支付成功 / 支付失败”。

迁移完成后建议在 `.env.example` 与 `README.md` 中同步核对所有支付项为最新状态。
