# Tiến độ MVP

- [x] Đọc hướng dẫn Sites, kiểm tra môi trường; Docker hoạt động.
- [x] Chọn Next.js + NestJS + PostgreSQL/PostGIS, repository riêng.
- [x] Migration 001/002/003, seed 30 quán hư cấu chỉ text; PostGIS thật; bộ lọc không lưu tọa độ.
- [x] Tìm, bộ lọc cùng món, ranking (CTR tắt rõ), chi tiết, giờ qua đêm.
- [x] Session server, gate 4 quán, race, tiếp tục sau login Free, quay vòng cookie.
- [x] Adapter kiểm tra token thật fail closed, auth development rõ, quyền Free/Pro trên API. OAuth/OTP UI thật còn thiếu credentials và tích hợp client.
- [x] Review chờ 30 phút + tự xác nhận, moderation/history, audit, admin CRUD, geocoding adapter có hạn mức và không lưu Google coords.
- [x] UI điện thoại chỉ chữ, font Việt tự host, empty/error/loading, so sánh/yêu thích/lịch sử/bộ lọc Pro.
- [x] 11 nhóm tests đạt trên DB thật; smoke Next→Nest→PostGIS đạt; typecheck/build/audit đạt; preview desktop/mobile; README/QA.
- [x] Webhook adapter HMAC/timestamp/idempotency và CLI cấp thử Pro development; merchant chưa tích hợp.
- [ ] Ngoài MVP local: OAuth/SMS thật, merchant, CTR/personalization, CSV import, vận hành production/RBAC/MFA/retention và kiểm thử thiết bị thật.

Không xuất bản backend demo/admin lên Sites: runtime Workers không chạy NestJS TCP/PostGIS trực tiếp. Ưu tiên local runtime đúng stack đã duyệt.
