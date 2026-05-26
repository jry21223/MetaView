from __future__ import annotations

from typing import Any
from urllib.parse import urlencode

import httpx

from app.config import Settings
from app.domain.models.account import OAuthIdentity


class WeChatOAuthError(RuntimeError):
    pass


class WeChatOAuthClient:
    def __init__(self, settings: Settings) -> None:
        self._settings = settings

    @property
    def configured(self) -> bool:
        return bool(
            self._settings.wechat_login_appid
            and self._settings.wechat_login_secret
            and self._settings.wechat_login_redirect_uri
        )

    def build_login_url(self, state: str) -> str:
        if not self.configured:
            raise WeChatOAuthError("WeChat login is not configured")
        query = urlencode(
            {
                "appid": self._settings.wechat_login_appid,
                "redirect_uri": self._settings.wechat_login_redirect_uri,
                "response_type": "code",
                "scope": "snsapi_login",
                "state": state,
            }
        )
        return f"https://open.weixin.qq.com/connect/qrconnect?{query}#wechat_redirect"

    async def fetch_identity(self, code: str) -> OAuthIdentity:
        if not self.configured:
            raise WeChatOAuthError("WeChat login is not configured")
        token_payload = await self._wechat_get(
            "https://api.weixin.qq.com/sns/oauth2/access_token",
            {
                "appid": self._settings.wechat_login_appid or "",
                "secret": self._settings.wechat_login_secret or "",
                "code": code,
                "grant_type": "authorization_code",
            },
        )
        access_token = token_payload.get("access_token")
        openid = token_payload.get("openid")
        unionid = token_payload.get("unionid")
        if not isinstance(access_token, str) or not isinstance(openid, str):
            raise WeChatOAuthError("微信登录换取 access_token 失败")

        userinfo = await self._wechat_get(
            "https://api.weixin.qq.com/sns/userinfo",
            {"access_token": access_token, "openid": openid, "lang": "zh_CN"},
        )
        avatar_url = userinfo.get("headimgurl")
        nickname = userinfo.get("nickname")
        userinfo_unionid = userinfo.get("unionid")
        return OAuthIdentity(
            provider="wechat",
            provider_user_id=openid,
            union_id=unionid if isinstance(unionid, str) else _str_or_none(userinfo_unionid),
            display_name=nickname if isinstance(nickname, str) else None,
            avatar_url=avatar_url if isinstance(avatar_url, str) else None,
        )

    async def _wechat_get(self, url: str, params: dict[str, str]) -> dict[str, Any]:
        async with httpx.AsyncClient(timeout=12.0) as client:
            resp = await client.get(url, params=params)
        payload = resp.json()
        if resp.status_code >= 400 or payload.get("errcode"):
            raise WeChatOAuthError(f"微信接口调用失败: {payload}")
        return payload


def _str_or_none(value: object) -> str | None:
    return value if isinstance(value, str) else None
