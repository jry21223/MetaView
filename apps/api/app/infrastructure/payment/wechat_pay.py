from __future__ import annotations

import base64
import json
import secrets
import time
from pathlib import Path
from typing import Any

import httpx

from app.config import Settings
from app.domain.models.account import NativePaymentOrder, PaymentTransaction


class WeChatPayConfigError(RuntimeError):
    pass


class WeChatPayGatewayError(RuntimeError):
    pass


class WeChatPayClient:
    def __init__(self, settings: Settings) -> None:
        self._settings = settings

    @property
    def configured(self) -> bool:
        s = self._settings
        return all(
            [
                s.wechat_pay_appid,
                s.wechat_pay_mchid,
                s.wechat_pay_merchant_serial_no,
                s.wechat_pay_notify_url,
                s.wechat_pay_api_v3_key,
                s.wechat_pay_private_key_path or s.wechat_pay_private_key,
                s.wechat_pay_platform_public_key_path,
            ]
        )

    async def create_native_order(
        self,
        *,
        order_id: str,
        amount_cents: int,
        description: str,
    ) -> NativePaymentOrder:
        if not self.configured:
            raise WeChatPayConfigError("WeChat Pay is not configured")

        path = "/v3/pay/transactions/native"
        body = {
            "appid": self._settings.wechat_pay_appid,
            "mchid": self._settings.wechat_pay_mchid,
            "description": description[:127],
            "out_trade_no": order_id,
            "notify_url": self._settings.wechat_pay_notify_url,
            "amount": {"total": amount_cents, "currency": "CNY"},
        }
        body_json = json.dumps(body, ensure_ascii=False, separators=(",", ":"))
        headers = {
            "Authorization": self._authorization("POST", path, body_json),
            "Accept": "application/json",
            "Content-Type": "application/json",
            "User-Agent": "MetaView/2.0",
        }
        async with httpx.AsyncClient(timeout=20.0) as client:
            resp = await client.post(
                f"{self._settings.wechat_pay_api_base.rstrip('/')}{path}",
                content=body_json.encode("utf-8"),
                headers=headers,
            )
        if resp.status_code >= 400:
            raise WeChatPayGatewayError(f"WeChat Pay order failed: {resp.status_code} {resp.text}")
        payload = resp.json()
        code_url = payload.get("code_url")
        if not isinstance(code_url, str) or not code_url:
            raise WeChatPayGatewayError("WeChat Pay response missing code_url")
        return NativePaymentOrder(code_url=code_url)

    def decode_notification(self, headers: dict[str, str], body: bytes) -> PaymentTransaction:
        if not self._settings.wechat_pay_api_v3_key:
            raise WeChatPayConfigError("METAVIEW_WECHAT_PAY_API_V3_KEY is required")
        self._verify_notification(headers, body)

        payload = json.loads(body.decode("utf-8"))
        resource = payload.get("resource")
        if not isinstance(resource, dict):
            raise WeChatPayGatewayError("WeChat Pay notification missing resource")

        ciphertext = resource.get("ciphertext")
        nonce = resource.get("nonce")
        associated_data = resource.get("associated_data", "")
        if not isinstance(ciphertext, str) or not isinstance(nonce, str):
            raise WeChatPayGatewayError("WeChat Pay notification resource is malformed")

        try:
            from cryptography.hazmat.primitives.ciphers.aead import AESGCM
        except ModuleNotFoundError as exc:
            raise WeChatPayConfigError(
                "Install cryptography to decrypt WeChat Pay callbacks"
            ) from exc

        aesgcm = AESGCM(self._settings.wechat_pay_api_v3_key.encode("utf-8"))
        plaintext = aesgcm.decrypt(
            nonce.encode("utf-8"),
            base64.b64decode(ciphertext),
            associated_data.encode("utf-8"),
        )
        transaction = json.loads(plaintext.decode("utf-8"))
        return self._transaction_from_payload(transaction)

    def _transaction_from_payload(self, payload: dict[str, Any]) -> PaymentTransaction:
        trade_state = payload.get("trade_state")
        order_id = payload.get("out_trade_no")
        provider_order_id = payload.get("transaction_id")
        amount = payload.get("amount")
        amount_cents = amount.get("total") if isinstance(amount, dict) else None
        if not isinstance(trade_state, str):
            raise WeChatPayGatewayError("WeChat Pay notification missing trade_state")
        if not isinstance(order_id, str):
            raise WeChatPayGatewayError("WeChat Pay notification missing order id")
        if trade_state != "SUCCESS":
            return PaymentTransaction(
                order_id=order_id,
                amount_cents=0,
                provider_order_id=provider_order_id if isinstance(provider_order_id, str) else "",
                trade_state=trade_state,
            )
        if not isinstance(provider_order_id, str):
            raise WeChatPayGatewayError("WeChat Pay notification missing transaction id")
        if not isinstance(amount_cents, int):
            raise WeChatPayGatewayError("WeChat Pay notification missing amount")
        return PaymentTransaction(
            order_id=order_id,
            amount_cents=amount_cents,
            provider_order_id=provider_order_id,
            trade_state=trade_state,
        )

    def _authorization(self, method: str, path: str, body: str) -> str:
        timestamp = str(int(time.time()))
        nonce = secrets.token_urlsafe(16)
        message = f"{method}\n{path}\n{timestamp}\n{nonce}\n{body}\n"
        signature = self._sign(message.encode("utf-8"))
        return (
            'WECHATPAY2-SHA256-RSA2048 '
            f'mchid="{self._settings.wechat_pay_mchid}",'
            f'nonce_str="{nonce}",'
            f'timestamp="{timestamp}",'
            f'serial_no="{self._settings.wechat_pay_merchant_serial_no}",'
            f'signature="{signature}"'
        )

    def _sign(self, message: bytes) -> str:
        try:
            from cryptography.hazmat.primitives import hashes, serialization
            from cryptography.hazmat.primitives.asymmetric import padding
        except ModuleNotFoundError as exc:
            raise WeChatPayConfigError("Install cryptography to sign WeChat Pay requests") from exc

        private_key_source = self._settings.wechat_pay_private_key
        if not private_key_source and self._settings.wechat_pay_private_key_path:
            try:
                private_key_source = Path(self._settings.wechat_pay_private_key_path).read_text()
            except OSError as exc:
                raise WeChatPayConfigError("WeChat Pay merchant private key is unreadable") from exc
        if not private_key_source:
            raise WeChatPayConfigError("WeChat Pay merchant private key is required")

        key = serialization.load_pem_private_key(private_key_source.encode("utf-8"), password=None)
        signature = key.sign(message, padding.PKCS1v15(), hashes.SHA256())
        return base64.b64encode(signature).decode("ascii")

    def _verify_notification(self, headers: dict[str, str], body: bytes) -> None:
        public_key_path = self._settings.wechat_pay_platform_public_key_path
        if not public_key_path:
            raise WeChatPayConfigError("METAVIEW_WECHAT_PAY_PLATFORM_PUBLIC_KEY_PATH is required")

        timestamp = headers.get("wechatpay-timestamp") or headers.get("Wechatpay-Timestamp")
        nonce = headers.get("wechatpay-nonce") or headers.get("Wechatpay-Nonce")
        signature = headers.get("wechatpay-signature") or headers.get("Wechatpay-Signature")
        if not timestamp or not nonce or not signature:
            raise WeChatPayGatewayError("WeChat Pay notification signature headers missing")

        try:
            from cryptography.hazmat.primitives import hashes, serialization
            from cryptography.hazmat.primitives.asymmetric import padding
        except ModuleNotFoundError as exc:
            raise WeChatPayConfigError(
                "Install cryptography to verify WeChat Pay callbacks"
            ) from exc

        message = f"{timestamp}\n{nonce}\n{body.decode('utf-8')}\n".encode("utf-8")
        try:
            public_key_source = Path(public_key_path).read_bytes()
        except OSError as exc:
            raise WeChatPayConfigError("WeChat Pay platform public key is unreadable") from exc
        public_key = serialization.load_pem_public_key(public_key_source)
        public_key.verify(base64.b64decode(signature), message, padding.PKCS1v15(), hashes.SHA256())
