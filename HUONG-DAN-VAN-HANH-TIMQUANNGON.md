# Sổ Tay Vận Hành Dự Án: Tìm Quán Ngon (`timquanngon.com`)

Tài liệu này lưu giữ toàn bộ kiến trúc, cấu hình tên miền, cổng dịch vụ và cách khởi động lại hệ thống. Khi mở cuộc hội thoại AI mới hoặc sau khi khởi động lại máy tính, chỉ cần mở tệp này (hoặc nhắn AI: *"Đọc `HUONG-DAN-VAN-HANH-TIMQUANNGON.md` và khởi động dự án giúp tôi"*).

> **Lưu ý bảo mật:** Các mật khẩu riêng tư, email quản trị và chuỗi kết nối nội bộ được lưu riêng tại tệp `THONG-TIN-BAO-MAT-RIENG.local.md` (nằm ngay cùng thư mục này trên máy tính, đã được chặn trong `.gitignore` để không bao giờ đẩy lên GitHub).

---

## 1. Địa chỉ chính thức & Kho mã nguồn

| Hạng mục | Địa chỉ / Giá trị |
| :--- | :--- |
| **Website chính thức (HTTPS + GPS)** | https://timquanngon.com và https://www.timquanngon.com |
| **Tên thương hiệu & Gói thành viên** | **Tìm quán ngon** · Gói nâng cấp: **Quán Ngon · Pro** |
| **Kho mã nguồn GitHub** | https://github.com/buidangdanh/an-gi-gan-day (nhánh `master`) |
| **Thư mục gốc trên máy tính** | `C:\Users\Vimass\Documents\Codex\2026-11-17\an-gi-gan-day\outputs\an-gi-gan-day` |
| **Nhà đăng ký tên miền** | Nhân Hòa (`https://customer.nhanhoa.com/domain` / `https://id.nhanhoa.com`) |
| **Quản trị DNS, SSL & Đường hầm** | Cloudflare Free (`https://dash.cloudflare.com`) |

---

## 2. Cấu hình Tên miền & Đường hầm Cloudflare (`Cloudflare Named Tunnel`)

Hệ thống chạy trực tiếp từ máy tính Windows thông qua **Cloudflare Named Tunnel** nên **không cần IP tĩnh** và **không cần mở port trên modem nhà mạng**.

- **Nameserver chính thức cài tại Nhân Hòa** *(lưu ý để trống hoàn toàn NS3 & NS4)*:
  - `NS1`: `jakub.ns.cloudflare.com`
  - `NS2`: `priscilla.ns.cloudflare.com`
- **Thông tin đường hầm cố định (`Cloudflare Tunnel`):**
  - **Tên Tunnel:** `timquanngon`
  - **Tunnel ID:** `450388d8-88f6-4db2-a026-727e2ef2e33c`
  - **Bản ghi CNAME trên Cloudflare:**
    - `timquanngon.com` → `450388d8-88f6-4db2-a026-727e2ef2e33c.cfargotunnel.com` (Proxied)
    - `www.timquanngon.com` → `450388d8-88f6-4db2-a026-727e2ef2e33c.cfargotunnel.com` (Proxied)
  - **Tệp thực thi `cloudflared.exe`:**
    `C:\Users\Vimass\Documents\Codex\2026-11-17\an-gi-gan-day\work\downloads\cloudflared.exe`
  - **Tệp cấu hình & khóa đường hầm trên máy:**
    - `C:\Users\Vimass\.cloudflared\config.yml`
    - `C:\Users\Vimass\.cloudflared\cert.pem`
    - `C:\Users\Vimass\.cloudflared\450388d8-88f6-4db2-a026-727e2ef2e33c.json`
    *(Đã có bản sao lưu cục bộ tại thư mục `secrets/cloudflared-backup/` trong dự án).*

---

## 3. Kiến trúc các dịch vụ đang chạy trên máy (`Ports`)

```text
Người dùng (4G / Wi-Fi toàn cầu)
   │  https://timquanngon.com (SSL + CDN Cloudflare)
   ▼
Cloudflare Named Tunnel ("timquanngon")
   │  httpHostHeader: 127.0.0.1:3181
   ▼
Gateway bảo vệ cục bộ (127.0.0.1:3181 — scripts/phone-preview.mjs)
   │  Chặn tuyệt đối /admin, webhook nội bộ; cho phép Web + API người dùng
   ▼
Next.js Web Server (127.0.0.1:3100 — apps/web)
   │  Rewrite /api/* sang cổng 4100
   ▼
NestJS Backend API (127.0.0.1:4100 — apps/api)
   │
   ▼
PostgreSQL Docker (127.0.0.1:55439 — container: an-gi-gan-day-db-1)
   └─ 99.467 quán ăn tại 10 tỉnh/thành lớn + Tài khoản Thường / Quán Ngon · Pro
```

---

## 4. Cách bật lại toàn bộ Website sau khi tắt / khởi động lại máy tính

### Cách nhanh nhất (Nhấp đúp 1 lần)
Mở thư mục dự án và nhấp đúp vào tệp:
- **`KHOI-DONG-TIMQUANNGON.bat`**

Tệp này sẽ tự động kiểm tra và bật lần lượt:
1. Docker Desktop & cơ sở dữ liệu PostgreSQL (`55439`)
2. Backend API (`4100`)
3. Giao diện Web (`3100`)
4. Cổng bảo vệ Gateway (`3181`)
5. Đường hầm cố định `https://timquanngon.com`

### Hoặc chạy bằng dòng lệnh PowerShell
*(Lưu ý trên máy Windows này dùng `npm.cmd` thay cho `npm` để không vướng ExecutionPolicy)*:
```powershell
npm.cmd run start:online
```

---

## 5. Quy trình khi muốn sửa giao diện hoặc tính năng

1. Chỉnh sửa mã nguồn trong `apps/web` (ví dụ logo tại `apps/web/app/brand-logo.tsx`, trang chính tại `apps/web/app/ha-noi/page.tsx`) hoặc `apps/api`.
2. Tắt tiến trình Web cổng `3100` (nếu đang chạy) để mở khóa thư mục `.next`.
3. Kiểm tra lỗi & đóng gói bản production:
   ```powershell
   npm.cmd run typecheck
   if ($LASTEXITCODE -eq 0) { npm.cmd run build }
   ```
4. Bật lại hệ thống bằng `KHOI-DONG-TIMQUANNGON.bat` (hoặc `npm.cmd run start:online`) và đẩy code lên GitHub:
   ```powershell
   git add -A
   git commit -m "Mô tả thay đổi"
   git push origin master
   ```

---

## 6. Hướng dẫn chuyển lên máy chủ Cloud VPS chạy 24/7 sau này

Khi bạn muốn tắt máy tính cá nhân đi ngủ mà `https://timquanngon.com` vẫn mở cửa 24/7 độc lập:
1. Thuê 1 gói **Cloud VPS Ubuntu 24.04 LTS** (khuyến nghị `2 vCPU – 4GB RAM – 40GB NVMe SSD`).
2. Xuất toàn bộ cơ sở dữ liệu 99.467 quán từ máy cá nhân ra file nén:
   ```powershell
   docker exec an-gi-gan-day-db-1 pg_dump -U angiday -Fc angiday > backup-timquanngon.dump
   ```
3. Trên VPS: cài Docker + Node.js 22, `git clone https://github.com/buidangdanh/an-gi-gan-day.git`, nạp lại `backup-timquanngon.dump` vào PostgreSQL trên VPS.
4. Copy thư mục `secrets/cloudflared-backup/` lên VPS (hoặc trỏ thẳng bản ghi `A` trên Cloudflare về IP tĩnh của VPS) — không cần đổi bất kỳ cài đặt nào bên Nhân Hòa.
