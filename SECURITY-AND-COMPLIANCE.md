# Bảo mật & Tuân thủ Bản quyền — Tìm quán ngon (`timquanngon.com`)

Tài liệu này tổng hợp các biện pháp bảo mật đã triển khai trong mã nguồn và lộ trình tuân thủ bản quyền bắt buộc trước khi thương mại hóa.

---

## 1. Các lớp bảo mật đã triển khai trong mã nguồn

| Lớp bảo vệ | Giải pháp đã áp dụng | Vị trí triển khai |
| --- | --- | --- |
| **HTTP Security Headers & CSP** | `Content-Security-Policy` chặt (`default-src 'self'`, `frame-ancestors 'none'`, `object-src 'none'`), `HSTS` (production), `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `COOP: same-origin`, `CORP: same-origin`, `Permissions-Policy`, tắt `x-powered-by`. | [next.config.ts](apps/web/next.config.ts), [main.ts](apps/api/src/main.ts) |
| **Chống CSRF & Origin Enforcement** | Mọi request thay đổi trạng thái (`POST`/`PUT`/`PATCH`/`DELETE`) bắt buộc `Origin === WEB_ORIGIN`, kiểm tra thêm `Sec-Fetch-Site`, yêu cầu `Content-Type: application/json`. | [main.ts](apps/api/src/main.ts) |
| **Session & Cookie Hardening** | Mã ngẫu nhiên 256-bit, DB chỉ lưu `SHA-256`, `HttpOnly`, `SameSite=Lax`, `Secure` ở production, quay vòng cookie khi đăng nhập, hết hạn idle 30 phút / tối đa 24 giờ. **Đọc công khai không tạo session/cookie.** | [service.ts](apps/api/src/service.ts) |
| **Chống SQL Injection & Wildcard DoS** | 100% truy vấn dùng parameterized queries (`$1, $2...`), escape toàn bộ ký tự đặc biệt `LIKE` (`%`, `_`, `\`), chuẩn hóa đầu vào bằng `zod` `.strict()`. | [cache.ts](apps/api/src/cache.ts), [catalogue.ts](apps/api/src/catalogue.ts), [service.ts](apps/api/src/service.ts) |
| **Chống Payload DoS & OOM** | Giới hạn body JSON `64kb`, loại bỏ truy vấn tải toàn bộ 71k bản ghi vào RAM ở `/locations/resolve` và `/admin`, đặt `statement_timeout` (8s) ở PostgreSQL pool. | [main.ts](apps/api/src/main.ts), [db.ts](apps/api/src/db.ts), [service.ts](apps/api/src/service.ts) |
| **Admin Hardening** | Token riêng ≥ 32 ký tự, so sánh bằng `timingSafeEqual(sha256(key), sha256(given))` không rò rỉ độ dài token, rate-limit brute-force (10 lần sai / 15 phút), audit log mọi thao tác, tách biệt hoàn toàn với tài khoản Free/Pro. | [service.ts](apps/api/src/service.ts) |
| **Webhook Security** | Xác thực `HMAC-SHA256` trên `rawBody`, cửa sổ thời gian ±5 phút chống replay, idempotency theo `event_id` + phát hiện xung đột `payload_hash` (HTTP 409). | [service.ts](apps/api/src/service.ts), [main.ts](apps/api/src/main.ts) |
| **Rate Limiting & Trusted Proxy** | In-memory lock-free limiter cho public reads (chuyển sang Redis Cluster khi mở rộng nhiều pod); hỗ trợ `TRUST_PROXY=true` đọc IP thật từ Cloudflare/LB đáng tin cậy; strict rate limit cho login/OTP/review/report/geocode. | [cache.ts](apps/api/src/cache.ts), [service.ts](apps/api/src/service.ts) |

---

## 2. Tuân thủ Bản quyền & Sở hữu trí tuệ (IP Compliance)

### Những rủi ro bản quyền cần kiểm soát tuyệt đối
1. **Dữ liệu cào từ Foody.vn (`foody_import_records` / `foody_id`):**
   - Trong giai đoạn thử nghiệm local, repo có tích hợp tập dữ liệu từ Foody.vn. **KHÔNG ĐƯỢC PHÉP thương mại hóa hoặc công khai tập dữ liệu cào chưa có văn bản cấp phép** vì vi phạm Điều khoản dịch vụ của nền tảng gốc và Luật Sở hữu trí tuệ Việt Nam (quyền tác giả đối với sưu tập dữ liệu).
   - **Biện pháp kỹ thuật đã áp dụng ngay trong code:**
     - `publicRestaurant()` tự động loại bỏ `foody_id`, `external_url` (liên kết sâu về Foody) và nhãn nguồn bên thứ ba khỏi API công khai và giao diện thẻ.
     - Migration `008` thêm cột `data_license` (`first_party`, `odbl`, `cdla_permissive`, `cc0`, `partner_licensed`, `demo`, `unverified_import`).
     - Biến môi trường **`STRICT_LICENSE_MODE=true`** (bắt buộc bật khi phát hành production) tự động chặn toàn bộ bản ghi `unverified_import` và `demo` ngay ở tầng SQL.

### Nguồn dữ liệu hợp pháp thay thế cho Production (Không vi phạm bản quyền)
1. **Overture Maps Foundation — Places Dataset** (giấy phép **CDLA-Permissive-2.0**): Dữ liệu địa điểm toàn cầu miễn phí, dùng thương mại hợp pháp, không yêu cầu chia sẻ lại cơ sở dữ liệu phái sinh (share-alike).
2. **OpenStreetMap — Overpass / Planet** (giấy phép **ODbL 1.0**): Hợp pháp với yêu cầu ghi rõ attribution `© OpenStreetMap contributors · ODbL` (đã có sẵn ở footer và `/about`).
3. **Dữ liệu tự thu thập & Chủ quán tự đăng ký (`first_party`)**: Form đăng ký quán miễn phí cho chủ quán tự xác nhận tên, địa chỉ, thực đơn chữ, giờ mở cửa.
4. **Đánh giá nội bộ (UGC)**: Do người dùng tự viết, kèm điều khoản cấp quyền hiển thị không độc quyền cho nền tảng.

### Tài sản giao diện & Dịch vụ ngoài
- **Hình ảnh:** 0 ảnh cào mạng (100% Text-first & CSS thuần).
- **Fonts:** `Be Vietnam Pro` & `Lora` — giấy phép **SIL OFL 1.1**, tự host từ `@fontsource/*`.
- **Google Maps:** Chỉ sử dụng chuẩn [Google Maps URLs](https://developers.google.com/maps/documentation/urls/get-started) (`https://www.google.com/maps/search/?api=1&query=...`), không cào sao/ảnh/review Google, không lưu cache vĩnh viễn tọa độ từ Google Geocoding API.
- **Quyền riêng tư (Nghị định 13/2023/NĐ-CP):** Không lưu tọa độ GPS người dùng trên máy chủ; tọa độ gợi ý được lượng tử hóa theo ô lưới ~150 m; cung cấp quy trình Notice & Takedown và xóa tài khoản trước khi go-live.
