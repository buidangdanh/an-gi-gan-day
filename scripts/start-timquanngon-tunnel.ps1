# Khởi chạy cổng bảo vệ cục bộ (3181) và đường hầm cố định Cloudflare cho https://timquanngon.com
$ErrorActionPreference = 'Stop'

$env:PHONE_PREVIEW_HOST = '127.0.0.1'
$env:PHONE_PREVIEW_PORT = '3181'
$env:PHONE_PREVIEW_ORIGIN = 'https://timquanngon.com'
$env:PHONE_PREVIEW_EXTRA_ORIGINS = 'https://www.timquanngon.com'

Start-Process -NoNewWindow -FilePath "node" -ArgumentList "scripts/phone-preview.mjs"

$cf = "C:\Users\Vimass\Documents\Codex\2026-11-17\an-gi-gan-day\work\downloads\cloudflared.exe"
& $cf --config "$HOME\.cloudflared\config.yml" --no-autoupdate tunnel run timquanngon
