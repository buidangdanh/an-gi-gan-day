# Tiến độ MVP

- [x] Mỗi nhóm 4 thẻ là 4 món khác nhau; luân phiên nhóm món khi đổi quán, giữ thứ tự ưu tiên trong từng món. Đã kiểm tra đủ 400 hồ sơ thành 100 lượt không trùng món trong lượt và không trùng ID giữa các lượt.

- [x] Trang 4 thẻ dùng vị trí hiện tại của thiết bị; GPS tính khoảng cách trên client, không gửi ra ngoài, không tự dùng Hồ Gươm khi chưa có quyền. Watch vị trí không tự kéo người dùng về 4 quán đầu mỗi lần GPS rung nhẹ.
- [x] Bật preview HTTPS có gateway chặn admin/auth/payment; đã kiểm HTTP/smoke/SSL và trạng thái không lấy được vị trí trong trình duyệt. Cần người dùng chọn cho phép vị trí trên điện thoại để có GPS thực tế.

- [x] Mỗi lượt chỉ 4 thẻ bố cục 2×2, nút “Quán ngon khác” thay toàn bộ 4 quán, không cộng thêm danh sách. Xem hết 400 hồ sơ thì quay vòng; click đổi gợi ý không tính visit.

- [x] Theo yêu cầu làm gọn: xóa khối tiêu đề/giới thiệu, form tìm, đổi tọa độ và thống kê dài khỏi trang danh sách; đưa thẻ món lên sát đầu trang, tên món nổi bật trước tên quán. Nguồn chi tiết thu gọn trong thẻ, attribution ngắn ở chân trang.

- [x] Theo yêu cầu ưu tiên dữ liệu: danh sách 400 quán thành trang mở đầu; chuyển gợi ý 3 quán sang `/goi-y`; xếp dữ liệu nhập trước quán minh họa sau khi lọc đủ điều kiện. Thêm kiểm thử giữ bán kính/giá/giờ/exclude.

## Dùng danh sách thật và tính khoảng cách miễn phí

- [x] Nạp toàn bộ 400 hồ sơ vào ứng dụng, phân biệt với quán hư cấu; mở trang `/ha-noi`, 20 nhóm món, tìm tên/món/địa chỉ, xem thêm theo trang.
- [x] Migration 005 hỗ trợ tọa độ chưa biết, provenance và liên kết record nguồn. Không dùng giá chung làm giá từng quán.
- [x] Lượt Photon/OpenStreetMap một máy/một luồng có cache, tốc độ dưới 1 request/giây; dừng khi nhà cung cấp lỗi; không gọi Google.
- [x] Đối chiếu số nhà/đường, không lấy tâm phố/thành phố; chỉ điểm khớp rõ được tính PostGIS distance và đưa vào tìm gần.
- [x] Bổ sung kiểm thử geocoding/danh sách/địa chỉ thiếu tọa độ; 13 nhóm test đạt. Build/typecheck đạt. Đã kiểm tra trình duyệt điện thoại và khoảng cách đổi theo tọa độ nhập.
- [x] Hoàn tất 400/400 lượt tra; 77 địa chỉ khớp rõ, 309 cần xem lại, 7 mơ hồ, 7 không có kết quả. Đọc lại DB: 400 hồ sơ / 77 có tọa độ / 323 chưa có; báo cáo lưu ở `data/geocoding/hanoi-location-report.json`.

## Xem bằng điện thoại

- [x] Tạo gateway LAN riêng tại Wi-Fi 192.168.1.87:3180, Next/Nest vẫn loopback; bật server theo yêu cầu người dùng.
- [x] Chặn admin/auth/payment/Geocoding/file nguồn riêng ở gateway; auth development server đang tắt.
- [x] Kiểm tra HTTP và trình duyệt địa chỉ LAN, thêm smoke kiểm tra Origin/gate và route bị chặn.
- [ ] Xác nhận từ điện thoại thực tế; đã gửi link để người dùng thử cùng Wi-Fi. Firewall mạng Public chưa có quyền quản trị để chỉnh.

## Bổ sung dữ liệu ngày 17/11/2026

- [x] Cấu hình key Geocoding do người dùng gửi trong `.env.local` bị ignore và thử một địa chỉ thật. Google từ chối do key bị giới hạn referrer; chưa chạy danh sách 400. Cần key/server restriction theo IP phù hợp trước khi tiếp tục.

- [x] Đọc nguồn Word trên Drive do người dùng gửi; lưu bản trích chữ, JSON và CSV, không tải ảnh.
- [x] Chuẩn hóa đủ 400 địa điểm, 20 nhóm × 20 dòng; giữ nguồn, lưu ý, ngày và giá tham khảo ở cấp nhóm món.
- [x] Migration 004 + importer idempotent; đã nhập PostgreSQL và chạy lại không nhân đôi, đọc lại đủ 400 pending / 20 nhóm; 30 quán seed giữ nguyên.
- [ ] Xác minh hoạt động/địa chỉ, bổ sung tọa độ có nguồn phù hợp trước khi đưa danh sách vào tìm gần đây.

## MVP đã bàn giao

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
