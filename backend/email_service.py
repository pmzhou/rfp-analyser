"""SMTP email sending + simple key encryption (Fernet)."""
import os
import asyncio
import base64
import hashlib
from typing import Optional
import aiosmtplib
from email.message import EmailMessage
from cryptography.fernet import Fernet


def _fernet() -> Fernet:
    secret = os.environ.get('JWT_SECRET', 'rfp-default-secret').encode('utf-8')
    key = base64.urlsafe_b64encode(hashlib.sha256(secret).digest())
    return Fernet(key)


def encrypt(text: Optional[str]) -> Optional[str]:
    if not text:
        return ""
    return _fernet().encrypt(text.encode('utf-8')).decode('utf-8')


def decrypt(token: Optional[str]) -> Optional[str]:
    if not token:
        return ""
    try:
        return _fernet().decrypt(token.encode('utf-8')).decode('utf-8')
    except Exception:
        return ""


def mask(text: Optional[str]) -> str:
    """Return a masked preview (last 4 chars) for display."""
    if not text:
        return ""
    s = decrypt(text)
    if len(s) <= 4:
        return "****"
    return "*" * (len(s) - 4) + s[-4:]


async def send_smtp(
    *, host: str, port: int, username: str, password: str, use_tls: bool,
    from_name: str, from_email: str, to_email: str, subject: str,
    body_text: str, body_html: Optional[str] = None,
) -> None:
    msg = EmailMessage()
    msg["From"] = f"{from_name} <{from_email}>" if from_name else from_email
    msg["To"] = to_email
    msg["Subject"] = subject
    msg.set_content(body_text)
    if body_html:
        msg.add_alternative(body_html, subtype="html")
    await aiosmtplib.send(
        msg, hostname=host, port=int(port),
        username=username or None, password=password or None,
        start_tls=use_tls and int(port) != 465,
        use_tls=int(port) == 465,
        timeout=15,
    )
