---
name: timquanngon-ops
description: >-
  Start, restart, rebuild, deploy, and troubleshoot the Tìm quán ngon (timquanngon.com)
  production stack on Windows (Docker PostgreSQL, NestJS API, Next.js Web, security gateway,
  and Cloudflare Named Tunnel). Use when the user asks to start or restart the project,
  deploy UI/API edits to https://timquanngon.com, check domain/SSL/tunnel health, or migrate to a VPS.
---

# Vận Hành & Triển Khai `timquanngon.com`

## 1. Kiến trúc 5 tầng trên máy cục bộ

1. **PostgreSQL (`127.0.0.1:55439`):** Docker container `an-gi-gan-day-db-1` (`docker compose up -d`). Nếu Docker Engine chưa chạy, khởi chạy daemon `"C:\Users\Vimass\AppData\Local\Programs\DockerDesktop\resources\com.docker.backend.exe"`.
2. **NestJS API (`127.0.0.1:4100`):** `npm.cmd run start:api`
3. **Next.js Web (`127.0.0.1:3100`):** `npm.cmd run start:web`
4. **HTTPS Security Gateway (`127.0.0.1:3181`):** Chặn `/admin` và webhook nội bộ, cho phép cả non-www và www:
   ```powershell
   $env:PHONE_PREVIEW_HOST='127.0.0.1'
   $env:PHONE_PREVIEW_PORT='3181'
   $env:PHONE_PREVIEW_ORIGIN='https://timquanngon.com'
   $env:PHONE_PREVIEW_EXTRA_ORIGINS='https://www.timquanngon.com'
   node scripts/phone-preview.mjs
   ```
5. **Cloudflare Named Tunnel (`timquanngon` — ID `450388d8-88f6-4db2-a026-727e2ef2e33c`):**
   ```powershell
   & "C:\Users\Vimass\Documents\Codex\2026-11-17\an-gi-gan-day\work\downloads\cloudflared.exe" --config "$HOME\.cloudflared\config.yml" --no-autoupdate tunnel run timquanngon
   ```
   *(Nếu thiếu khóa trong `$HOME\.cloudflared\`, khôi phục từ bản sao lưu cục bộ `secrets/cloudflared-backup/`).*

> Người dùng cũng có thể khởi động toàn bộ ngoài trình soạn thảo bằng cách nhấp đúp `KHOI-DONG-TIMQUANNGON.bat` hoặc chạy `npm.cmd run start:online`.

## 2. Quy trình Build & Cập nhật giao diện không ngắt đường hầm

1. **Giữ nguyên** Docker (`55439`), Gateway (`3181`) và `cloudflared` đang chạy để không đứt kết nối Cloudflare.
2. Chỉ dừng tiến trình Next.js Web (`3100`) đang khóa thư mục `.next` (và dừng API `4100` nếu có sửa `apps/api`).
3. Chạy kiểm tra kiểu và build:
   ```powershell
   npm.cmd run typecheck; if ($LASTEXITCODE -eq 0) { npm.cmd run build }
   ```
4. Khởi động lại `npm.cmd run start:web` (và `npm.cmd run start:api` nếu vừa dừng) ở chế độ daemon.
5. **Kiểm chứng bắt buộc:**
   ```powershell
   curl.exe -sS -I --max-time 10 http://127.0.0.1:3100/ha-noi | Select-Object -First 5
   curl.exe -sS -I --max-time 12 https://timquanngon.com/ha-noi | Select-Object -First 5
   ```
6. Kiểm tra `git status --short` (đảm bảo không lọt tệp nhạy cảm) rồi commit & push lên `origin master`.

## 3. Kiểm tra DNS / SSL & Di chuyển VPS
- **Nameserver chuẩn tại Nhân Hòa (`customer.nhanhoa.com`):** Chỉ dùng 2 dòng `jakub.ns.cloudflare.com` và `priscilla.ns.cloudflare.com` (`NS3`, `NS4` bắt buộc để trống).
- **Kiểm tra trạng thái tên miền gốc `.com`:**
  ```powershell
  (Invoke-RestMethod -Uri "https://rdap.verisign.com/com/v1/domain/timquanngon.com").nameservers
  ```
- **Sao lưu DB khi chuyển sang Cloud VPS Ubuntu 24/7:**
  ```powershell
  docker exec an-gi-gan-day-db-1 pg_dump -U angiday -Fc angiday > backup-timquanngon.dump
  ```
