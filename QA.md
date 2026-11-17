# Biên bản kiểm chứng MVP — 17/11/2026

## Bản giao diện món lên đầu

Đã bỏ các phần giới thiệu, form, đổi điểm tính khoảng cách và thống kê dài người dùng chỉ định. Trang `/` và `/ha-noi` bắt đầu bằng thẻ món, tên món trước tên quán. Giữ nhãn chưa xác minh trong thẻ, khoảng cách có ghi mốc Hồ Gươm và attribution tối giản ở chân trang. Build/typecheck và smoke LAN đạt; quan sát trình duyệt xác nhận đầu trang là Phở bò, Kem Tràng Tiền, Bún đậu mắm tôm, không còn khối giới thiệu. Luồng lọc/tìm theo điểm khác vẫn ở `/goi-y`.

## Ưu tiên danh sách người dùng

Trang mở đầu `/` hiển thị danh sách 400 hồ sơ, `/ha-noi` giữ nguyên và `/goi-y` chứa luồng gợi ý 3 quán. API tìm quán sắp nhóm nguồn `user_import → non_demo → demo` sau khi áp dụng đầy đủ bộ lọc; mỗi nhóm vẫn xếp theo điểm. Kiểm thử mới dùng quán dữ liệu ở xa hơn quán minh họa, xác nhận dữ liệu lên trước nhưng không vượt bán kính, ngân sách, giờ hoặc exclude.

## Sử dụng 400 địa điểm và API miễn phí

Đã bổ sung trang `/ha-noi` và endpoint `/api/directory`, nạp 400 hồ sơ do người dùng cung cấp vào `restaurants` với nhãn chưa xác minh hoạt động. Hồ sơ thiếu tọa độ vẫn có trong danh sách; PostGIS chỉ tính khoảng cách và tìm gần với tọa độ khớp rõ. Tọa độ mặc định là Hồ Gươm, ghi rõ điểm tham chiếu. Có thể nhập lại lat/lng để đổi điểm xuất phát. Quán seed TP.HCM vẫn được ghi nhãn hư cấu riêng.

Lượt tra miễn phí dùng Photon/OSM (Nominatim public không phân giải DNS được), một máy/một luồng, nghỉ 2.1 giây sau phản hồi, cache các lần tra và không tự chạy định kỳ. Chỉ đối chiếu số nhà/đường hoặc POI rõ, thành phố Hà Nội; loại sai số nhà, sai phố/tỉnh, tâm phố và ứng viên mơ hồ. Không dùng Google key cho lượt này. Attribution và giấy phép ODbL được giữ trong UI và `data/geocoding/README.md`.

Kết quả cuối: **400 địa chỉ khác nhau đã được tra**; **77 khớp rõ**, 309 cần xem lại, 7 mơ hồ và 7 không có kết quả. SQL đọc lại xác nhận 400 hồ sơ Hà Nội, 77 có tọa độ, 323 tọa độ null; tất cả vẫn chưa xác minh hoạt động. Báo cáo từng dòng: `data/geocoding/hanoi-location-report.json`. Không dùng tâm phố để nâng giả số lượng thành công. Giao diện cuối hiện đúng 77/400, 323 cần đối chiếu.

**13/13 nhóm kiểm thử backend đạt**, gồm 11 nhóm ban đầu và 2 nhóm mới: chống nhận tọa độ sai/mơ hồ; danh sách với tọa độ null, khoảng cách thật PostGIS, giá/giờ chưa biết, chỉ đường fallback bằng địa chỉ và tra địa chỉ cục bộ không gọi Google. Build và typecheck đạt.

Đã kiểm tra trình duyệt trên địa chỉ LAN ở 390×844: đủ 400 hồ sơ, không ảnh/không tràn ngang; lọc “Bát Đàn” thấy quán nguồn; Phở Gia Truyền Bát Đàn cách Hồ Gươm khoảng 992 m, sau nhập điểm 21.0336/105.8463 thì còn 9 m. Phở bò Quân Hà 368 Đội Cấn không có điểm khớp và hiện “Chưa tính được khoảng cách”, không nhận kết quả API sai số nhà 179 cùng phố. Trang chủ chuyển sang vùng Hồ Gươm và gợi ý quán trong tài liệu. Smoke LAN đạt; admin/auth/payment/file nguồn riêng vẫn bị chặn.

## Kiểm tra key Geocoding người dùng cung cấp

Đã lưu key vào `.env.local` riêng trên máy, Git ignore; không đưa vào mã nguồn, client hay ZIP. Gọi thật một địa chỉ từ danh sách (368 Đội Cấn, Hà Nội). Google trả HTTP 200 nhưng trạng thái `REQUEST_DENIED`: `API keys with referer restrictions cannot be used with this API.` Vì key đang dùng hạn chế referrer, chưa thể sử dụng cho Geocoding web service phía server. Không tiếp tục gọi 400 địa chỉ, không ghi tọa độ giả và không đổi trạng thái xác minh. Có thể chạy lại sau khi cấu hình key server với hạn chế IP phù hợp và API restriction cho Geocoding: `node --env-file=.env.local scripts/check-geocoding.mjs`.

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

Kiểm chứng bản ưu tiên: 14/14 nhóm test đạt; build/typecheck và smoke LAN đạt; trình duyệt tại URL gốc hiện 400 địa điểm cùng liên kết /goi-y.

