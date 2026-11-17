# Biên bản kiểm chứng MVP — 17/11/2026

## Bổ sung nhập dữ liệu Hà Nội

Đã đọc bản chữ từ tài liệu Word do người dùng cung cấp, trích đủ 400 bản ghi thuộc 20 nhóm (mỗi nhóm 20). Parser kiểm tra cấu trúc, thứ tự và hash nguồn. Importer chạy hai lần trên PostgreSQL thật; readback vẫn 400 dòng/20 nhóm, toàn bộ `pending_verification`; bảng public `restaurants` vẫn có 30 quán seed. Tọa độ, giá từng quán, giờ, bestseller và điểm không được tự gán. Không tải ảnh hoặc gọi Geocoding. Chi tiết trong `data/imports/ha-noi-2026-11-17/README.md`.

## Môi trường đã chạy

- Windows, Node.js 22.23.2, npm 10.9.8.
- Docker Desktop đang hoạt động. Container riêng `an-gi-gan-day-db-1`, loopback cổng 55439, volume riêng.
- PostgreSQL 16.9 / PostGIS 3.5 qua truy vấn DB thật.
- Next.js 16.4.6, NestJS 12.5.1; versions chính xác trong package-lock.json.

## Backend — 11 nhóm đạt

1. PostGIS distance/radius, món cùng thỏa ngân sách và nhãn, không âm thầm mở điều kiện; validate lat/lng.
2. Giờ Việt Nam, nhiều ca/giờ nghỉ, nửa đêm/ngày tiếp theo, ranh giới đóng cửa, giờ chưa biết.
3. Ranking không có review, ưu tiên gần, công thức Bayesian/chuẩn hóa; Maps URL encode.
4. Chi tiết không tính visit; 10 click cùng quán dedup; race 7 quán mới sau một lượt chỉ cho thêm 3.
5. Quán thứ 5 pending; login Free tiếp tục chính quán; cookie quay vòng và cookie cũ mất quyền.
6. Idle 31 phút và tuổi phiên 25 giờ tạo phiên khách mới.
7. Auth nhà cung cấp thiếu cấu hình và token giả từ chối; Origin sai, admin thiếu khóa và production demo auth đều chặn; OTP rate limit.
8. Quyền Pro, so sánh cùng nhóm, chờ review 30 phút, tự xác nhận bắt buộc; pending → approved → cập nhật/pending → duyệt → hết Pro → ẩn, điểm thay đổi và lịch sử còn.
   Kiểm tra bộ lọc Pro loại bỏ lat/lng/exclude trước khi lưu để không lưu tọa độ vị trí hay kết quả Google vào tài khoản; migration 003 có CHECK tương ứng.
9. Free yêu thích/lịch sử, saved filters cần Pro; báo sai, xử lý và audit.
10. CRUD admin thật, strict text schema từ chối trường image và tọa độ sai, ẩn quán, geocode chưa cấu hình trả lỗi.
11. Webhook raw-body HMAC, timestamp, gọi đồng thời/idempotency, khác nội dung cùng event ID từ chối.

Tests dùng database tạm riêng trên PostgreSQL/PostGIS thực, HTTP Nest listener thật; không mock DB. Database test được xóa trong teardown, DB demo không bị reset.

## Xuyên hai dịch vụ

`npm run smoke` đạt qua Next proxy → Nest → DB: tìm seed, chi tiết không tăng lượt, 4 quán đầu trả chỉ đường, quán thứ 5 mở gate, login development Free tiếp tục đúng quán, yêu thích/lịch sử và logout. Script không mở Google Maps hay gửi dữ liệu cho nhà cung cấp ngoài.

`npm run typecheck`, `npm run build` đạt. `npm audit --omit=dev`: 0 vulnerabilities ở lần chạy. Kết quả audit không thay thế đánh giá bảo mật production.

## Trình duyệt thực tế

- Desktop và viewport 390×844, không có ảnh trong DOM, không tràn ngang toàn trang. Dải nhóm món cuộn riêng trên điện thoại.
- Phát hiện font hệ thống tách dấu tiếng Việt; đã sửa bằng font Lora và Be Vietnam Pro tự host từ dependencies, không tải Google Fonts khi mở trang.
- Quan sát trang chủ 3 thẻ; “Đổi 3 quán khác” đổi danh sách và giảm tập chưa xem.
- “pho” tìm được phở; truy vấn không tồn tại ra empty, vẫn giữ điều kiện và chỉ đề xuất tăng bán kính.
- Chi tiết có text menu, giờ nhiều ca, nguồn/ngày, trạng thái chưa có đánh giá.
- Khách bấm lưu yêu thích được yêu cầu đăng nhập; nhà cung cấp thật bị khóa đúng nhãn; tài khoản development Free hoạt động và lưu được quán, thấy trong thư viện.
- Hộp vị trí có preset/manual; tìm địa chỉ ngoài preset khi chưa có key hiển thị lỗi rõ. Không thử chấp nhận vị trí hệ điều hành.
- Gate/race và quyền Pro đã kiểm tra qua HTTP; không giả lập UI thay cho kiểm tra backend.
- Chạy chính lệnh `npm run demo`, xác nhận migration/seed không lặp và hai dịch vụ sẵn sàng; smoke đạt cả ở development.
- Cấp thử Pro bằng CLI cho tài khoản QA development, mở hộp chọn nhóm cụ thể, so sánh hai quán phở và lưu bộ lọc thành công trong trình duyệt.
- Phát hiện hộp thoại bị đóng bởi effect cleanup khi React Strict Mode chạy ở development; đã sửa lifecycle, kiểm tra lại hộp chọn nhóm và bảng so sánh. Không tắt Strict Mode để che lỗi.

## Chưa kiểm chứng / không triển khai

- Không có credentials thật nên chưa có OAuth/SMS/Google Geocoding/merchant live; không gọi API billable.
- Không có deploy full stack lên Sites: runtime Workers không phù hợp Nest/PostGIS TCP. Không publish demo/admin.
- Chưa test thiết bị điện thoại vật lý, browser matrix, tải lớn, hoặc audit accessibility bằng công cụ chuyên dụng.
- Chưa làm CTR, cá nhân hóa dài hạn, CSV import, merchant checkout, RBAC nhiều admin và vòng đời yêu cầu xóa dữ liệu.
