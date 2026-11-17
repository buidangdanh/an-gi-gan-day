# Ăn gì gần đây?

Mỗi lượt 4 thẻ luôn khác món. Quán được gom theo món và chọn luân phiên giữa các món; trong mỗi món vẫn giữ thứ tự nguồn/khoảng cách. Nút “Quán ngon khác” chuyển sang nhóm mới. Kiểm chứng: `node node_modules/tsx/dist/cli.mjs scripts/check-diverse-pages.ts`.

**Vị trí hiện tại:** trang 4 thẻ xin quyền định vị trình duyệt, cập nhật vị trí khi thiết bị di chuyển và tính khoảng cách Haversine ngay trên thiết bị. Không gửi tọa độ GPS đến API/Google/Cloudflare, không lưu vào tài khoản. Khi chưa lấy được quyền/vị trí, thẻ không hiện số khoảng cách và không tự dùng Hồ Gươm. Cần HTTPS để định vị trên điện thoại; bản thử HTTPS đi qua gateway chỉ mở chức năng khách, admin/auth/payment vẫn bị chặn. Mở bằng Chrome/Safari và chọn cho phép vị trí.

Bản HTTPS dùng Cloudflare Quick Tunnel tạm thời: cần giữ các tiến trình Node và cloudflared hoạt động; hostname đổi khi tạo tunnel mới. `PHONE_PREVIEW_HOST=127.0.0.1`, `PHONE_PREVIEW_PORT=3181`, `PHONE_PREVIEW_ORIGIN=<origin HTTPS chính xác>` cho gateway HTTPS. cloudflared trỏ tới `http://127.0.0.1:3181` với `--http-host-header 127.0.0.1:3181`. Có thể đặt `PHONE_PREVIEW_REDIRECT=<origin HTTPS>` trên gateway LAN để chuyển trang sang HTTPS. Không đưa binary/tokens vào source; binary dùng khi thiết lập lấy từ release chính thức Cloudflare, đã kiểm SHA-256 và chữ ký số. Đây là preview, chưa phải hosting production.

Trang mở đầu hiển thị **4 thẻ theo lưới 2×2**. Nút **Quán ngon khác** thay cả 4 thẻ bằng nhóm kế tiếp, không nối thêm thẻ; hết tập 400 hồ sơ thì quay vòng. Đổi gợi ý không tính lượt ghé thăm và không gọi API geocoding.

**Ưu tiên hiển thị:** trang mở đầu `/` là danh sách 400 địa điểm từ dữ liệu người dùng; `/ha-noi` vẫn giữ cùng danh sách. Luồng gợi ý 3 quán ở `/goi-y`. Sau khi lọc đủ điều kiện, kết quả tìm kiếm ưu tiên hồ sơ nhập từ dữ liệu người dùng, rồi quán không minh họa khác, cuối cùng quán minh họa; trong từng nhóm mới dùng điểm xếp hạng. Ưu tiên nguồn không bỏ qua bán kính, ngân sách, giờ mở, món/nhãn hoặc danh sách loại trừ.

MVP tiếng Việt, ưu tiên điện thoại, dùng **Next.js + TypeScript / NestJS + TypeScript / PostgreSQL + PostGIS**. Toàn bộ thông tin quán là chữ. Có backend và lưu trữ thật; không dùng localStorage để thay thế tài khoản, phiên hoặc cơ sở dữ liệu.

Đã sử dụng danh sách người dùng cung cấp gồm **400 địa điểm Hà Nội / 20 nhóm món** trong ứng dụng, độc lập với 30 quán seed hư cấu ở TP.HCM. Xem đủ danh sách tại `/ha-noi`, hoặc mở trang 4 thẻ và cho phép vị trí để tính khoảng cách từ nơi bạn đang đứng. Tra địa chỉ miễn phí qua **Photon/OpenStreetMap** một lần có cache, không dùng key Google. Chỉ hồ sơ khớp địa chỉ rõ mới được gán tọa độ để tính khoảng cách; còn lại vẫn hiển thị nhưng ghi chưa tính được. Toàn bộ quán Hà Nội vẫn được ghi **chưa xác minh hoạt động**. Xem [nguồn danh sách](data/imports/ha-noi-2026-11-17/README.md) và [quy trình/giấy phép tọa độ](data/geocoding/README.md).

Trang 4 thẻ tính khoảng cách từ GPS hiện tại ngay trên thiết bị bằng Haversine; không có GPS thì không hiện khoảng cách. Luồng tìm theo điểm chọn thủ công ở /goi-y dùng PostGIS. Cả hai đều là đường thẳng ước tính, không phải quãng đường/thời gian đi xe. Tìm địa điểm phía người dùng chỉ tra dữ liệu quán có tọa độ đã lưu (miễn phí, không gọi dịch vụ ngoài); vẫn nhập lat/lng thủ công được.

**30 quán seed hoàn toàn hư cấu** trong vùng tọa độ trung tâm TP.HCM. Tên, địa chỉ, món, bestseller, giá và giờ đều minh họa, chưa xác minh. Không dùng để tìm đến quán thật. Không có ảnh, upload ảnh, image storage, dữ liệu cào mạng hoặc sao/đánh giá Google. Không seed review.

## Chạy thử nhanh trên máy này

### Xem trên điện thoại cùng Wi-Fi

Bản LAN đã thiết lập tại `http://192.168.1.87:3180` khi máy tính giữ IP này. Điện thoại phải cùng Wi-Fi và máy tính phải bật/không ngủ. Gateway chỉ bind vào IP Wi-Fi, chuyển đến Next/Nest trên loopback. Không cần đưa Google key vào điện thoại.

Để chạy lại: khởi động DB, `npm run start:api` với `ENABLE_DEV_AUTH=false`, `npm run start:web` trong hai terminal riêng (build nếu source thay đổi), rồi terminal thứ ba:

```powershell
$env:PHONE_PREVIEW_HOST='192.168.1.87'
npm run preview:phone
```

Nếu IP Wi-Fi máy tính đổi, cập nhật biến và địa chỉ trên điện thoại. Không dùng địa chỉ WSL/localhost trên điện thoại. Gateway LAN chỉ mở trang tìm quán, chi tiết, đổi gợi ý, nhập tọa độ thủ công và ý định ghé thăm; chặn admin, auth, payment, Geocoding có tính phí và file dữ liệu nguồn. Không có đăng nhập development trên LAN. HTTP nội bộ có thể không được trình duyệt cho định vị tự động; chọn vùng minh họa hoặc nhập tọa độ vẫn dùng được.

Kiểm tra: `node scripts/check-phone-preview.mjs http://192.168.1.87:3180`. Đã đạt HTTP và quan sát trình duyệt qua địa chỉ LAN trên máy này. Việc điện thoại truy cập từ thiết bị khác còn tùy tường lửa Windows/router; máy đang dùng mạng Public và phiên hiện tại không có quyền quản trị để thêm rule tường lửa. Không tự đổi chính sách hoặc tắt tường lửa. Nếu điện thoại không vào được, cần cho phép riêng Node/port 3180 từ mạng nội bộ bằng tài khoản Windows có quyền quản trị, hoặc dùng đường preview HTTPS khác.

Yêu cầu: Node.js 22.21 trở lên, npm và Docker Desktop đang chạy (Linux containers). Các phiên bản đã kiểm tra: Node 22.23.2, PostgreSQL 16.9, PostGIS 3.5. Không cần Google key để chạy seed hoặc tìm bằng tọa độ.

Mở terminal tại thư mục chứa README này:

```powershell
npm ci
npm run demo
```

Lệnh `demo` tự khởi động DB, chạy các migration còn thiếu, seed nếu DB chưa có quán, rồi mở hai dịch vụ development. Nó bật rõ tài khoản development Free; từ chối chạy khi `NODE_ENV=production`. Chờ cả API và WEB sẵn sàng, rồi mở:

- Website: http://127.0.0.1:3100
- Quản trị: http://127.0.0.1:3100/admin (API từ chối nếu chưa có khóa riêng).
- Health API: http://127.0.0.1:4100/api/health

Dùng đúng `127.0.0.1`, không đổi thành `localhost`, vì kiểm tra nguồn yêu cầu dùng `WEB_ORIGIN`. Nhấn Ctrl+C để dừng ứng dụng; DB Docker và volume vẫn còn để giữ dữ liệu. `docker compose stop` dừng riêng DB, không xóa volume. Không dùng `down -v` nếu muốn giữ dữ liệu.

Thử luồng chính: chọn vùng Bến Thành → xem 3 gợi ý → chi tiết → Ghé thăm (mở Google Maps) → quay lại và chọn các quán khác. Quán thứ 5 mở hộp đăng nhập miễn phí. Trong demo, nút **Vào tài khoản thử nghiệm** tạo tài khoản development và tiếp tục chính quán đang chờ. Không gửi OTP, không có danh tính thật, không tự cấp Pro. Tọa độ dẫn tới vùng minh họa, không xác minh có quán tại đó.

## Chạy từng phần / cấu hình

```powershell
Copy-Item .env.example .env.local
npm run db:up
npm run db:migrate
npm run db:seed
npm run dev
```

`.env.local` ở **gốc repo** được các lệnh backend/migration/CLI nạp. `demo` mặc định bật development auth; để chạy không có auth demo, dùng `npm run dev` và đặt `ENABLE_DEV_AUTH=false` trong `.env.local`. Next.js dùng giá trị mặc định API nội bộ; nếu đổi API port, truyền `API_INTERNAL_URL` vào môi trường của lệnh Next (ví dụ PowerShell `$env:API_INTERNAL_URL='http://127.0.0.1:4101'`). Không có secrets phía client.

| Biến | Mục đích |
| --- | --- |
| `DATABASE_URL` | Kết nối PostgreSQL; mặc định development trỏ DB Docker local cổng 55439. Production bắt buộc cấu hình. |
| `WEB_ORIGIN` | Nguồn duy nhất được gửi mutation, mặc định `http://127.0.0.1:3100`; production cần HTTPS. |
| `API_PORT` | NestJS, mặc định 4100, chỉ bind 127.0.0.1. |
| `API_INTERNAL_URL` | Next proxy `/api/*`, mặc định `http://127.0.0.1:4100`. Chỉ biến server. |
| `ENABLE_DEV_AUTH` | Chỉ giá trị `true` ngoài production mới bật auth thử. API từ chối khởi động production nếu bật. |
| `ADMIN_TOKEN` | Khóa Bearer riêng tối thiểu 32 ký tự; trống = toàn bộ API admin bị khóa. Không đi qua session Free/Pro. |
| `GOOGLE_CLIENT_ID` | Audience cho bộ kiểm tra Google ID token server. |
| `FIREBASE_PROJECT_ID` | Audience/issuer cho Firebase Phone ID token server. |
| `FACEBOOK_APP_ID`, `FACEBOOK_APP_SECRET` | Bộ kiểm tra Facebook token qua `debug_token`. |
| `GOOGLE_MAPS_GEOCODING_API_KEY` | Chỉ server dùng khi người dùng/admin yêu cầu tìm địa chỉ. Không dùng `NEXT_PUBLIC`, không hardcode. |
| `PAYMENT_WEBHOOK_SECRET` | Secret HMAC tối thiểu 32 ký tự cho adapter webhook mẫu, chưa kết nối merchant. |
| `POSTGRES_PASSWORD` | Mật khẩu DB container nếu muốn đổi mặc định local; đồng thời cập nhật `DATABASE_URL`. |

`.env*` đã ignore, chỉ `.env.example` được đưa vào source. Không đọc lại hoặc sử dụng key từng gửi trong chat. Mọi tích hợp đang thiếu credentials đều hiển thị trạng thái chưa cấu hình hoặc trả lỗi rõ ràng.

Build và chạy bản tối ưu:

```powershell
npm run build
# Hai terminal riêng:
npm run start:api
npm run start:web
```

`start:api` không tự đặt `NODE_ENV=production`; cấu hình biến này rõ ràng khi phát hành. Tài khoản demo bị chặn theo `NODE_ENV` trên server, không phụ thuộc build giao diện. Không bật demo auth trên dịch vụ có người dùng thật.

## Các tính năng đã triển khai

- Hai cách tìm: chưa biết ăn gì (3 gợi ý) và tìm món/tên quán, hỗ trợ tiếng Việt không dấu. Đổi 3 quán khác loại các quán đã xem trong lượt gợi ý, không tính là visit.
- Vị trí trình duyệt theo yêu cầu, preset có nhãn minh họa, nhập địa chỉ qua adapter nếu có key, hoặc nhập lat/lng thủ công. Từ chối định vị vẫn dùng được. Không tự thay địa điểm nhập không thành công bằng vị trí mặc định.
- Bán kính, ngân sách tối đa trên **món**, đang mở, nhóm món và các nhãn đa chiều. Mọi điều kiện phải cùng khớp một món, không ghép nhãn của hai món khác nhau. Quán được phép có nhiều nhóm món. Giá chưa biết không vượt qua bộ lọc ngân sách; giờ chưa biết không vượt qua bộ lọc đang mở.
- Giờ mở nhiều ca, giờ nghỉ, ngày trong tuần và ca qua nửa đêm, tính theo `Asia/Ho_Chi_Minh`. Chỉ khoảng cách đường thẳng, không bịa thời gian di chuyển. Empty state giữ điều kiện và cho người dùng chủ động tăng bán kính.
- Thẻ/chi tiết chỉ chữ: địa chỉ, khoảng cách, món, bestseller có nguồn nếu có, nhãn, giá, giờ, điểm và số bài nội bộ, lý do gợi ý, nguồn/ngày cập nhật, menu và đánh giá. Nội dung người dùng được React escape.
- Cookie HttpOnly/SameSite, mã ngẫu nhiên 256 bit, DB chỉ lưu SHA-256. Phiên idle 30 phút và tối đa 24 giờ. Các tab cùng cookie dùng chung phiên server. Cookie có Secure ở production.
- **Gate 4 quán khác nhau**: khóa hàng phiên bằng `SELECT … FOR UPDATE`, count và insert trong cùng transaction, unique `(session_id, restaurant_id)`. Click lặp/race không vượt gate. Chi tiết và impression không tính lượt. Quán thứ 5 lưu pending trên server; đăng nhập quay vòng cookie, gắn lịch sử, tiếp tục đúng ý định còn hạn. Không cần Pro.
- `users`, `accounts`, `auth_identities` riêng. Danh tính ghép theo `(provider, subject)`, không gộp theo email. Google/Firebase kiểm tra chữ ký qua JWKS, issuer, audience, tuổi token; Facebook kiểm tra app, validity và expiry server.
- Free: yêu thích và lịch sử chọn ghé thăm. Pro active: so sánh 2–3 quán theo nhóm món cụ thể do người dùng chọn, lưu bộ lọc, tạo/cập nhật đánh giá. Bộ lọc chỉ lưu sở thích, không lưu tọa độ hay danh sách loại trừ; áp dụng lại quanh vị trí hiện tại của trang. Ràng buộc DB cũng cấm trường tọa độ trong bộ lọc. Mọi quyền đều kiểm tra lại ở API.
- Đánh giá cần ý định ghé thăm trước ít nhất 30 phút và người dùng tự xác nhận đã ăn. Không gọi là verified visit. 1 bài hiện hành/user/quán, bản sửa có lịch sử và chuyển về chờ duyệt; rate limit. Quán minh họa có review minh họa. Không tăng tin cậy do trả Pro. Hết Pro không xóa bài hợp lệ.
- Admin CRUD quán/chi nhánh/menu/nhãn/giờ/toạ độ/nguồn; ẩn quán để giữ lịch sử; duyệt/ẩn review có lý do; xử lý báo sai; audit. UI sửa dữ liệu text dạng JSON với validation strict server; trường ảnh hoặc trường lạ bị từ chối.
- Webhook adapter có HMAC trên raw body, cửa sổ timestamp 5 phút, event idempotency trong transaction, phát hiện cùng event ID khác payload. Không có checkout hoặc merchant thật.

## Điểm và thứ tự gợi ý

Điểm mỗi bài: `vị*0.50 + giá trị*0.25 + phục vụ*0.15 + không gian*0.10`, mỗi tiêu chí nguyên 1–5. Chỉ bài `approved` hợp lệ được đưa vào view `review_aggregates`, nên thay đổi moderation phản ánh ngay, không có cache aggregate cũ. UI hiển thị trung bình thô và số bài, có trạng thái ít mẫu; không có bài thì hiện **Chưa có đánh giá**.

Điểm chất lượng dùng riêng khi xếp hạng: `(n*R + 10*C)/(n+10)`. `C` chỉ từ review được duyệt trong DB và chỉ có khi toàn hệ thống đủ ít nhất 10 bài. Không dùng điểm nền giả hoặc dữ liệu sao ngoài. Khi quán chưa có review hoặc chưa có `C`, thành phần chất lượng được bỏ và trọng số còn lại chuẩn hóa.

Lọc bắt buộc trước bằng PostGIS `ST_DWithin` + bộ lọc món/giờ, sau đó mới xếp hạng:

| Thành phần | Trọng số ban đầu | MVP |
| --- | ---: | --- |
| Gần | 35 | `max(0,1-distance/radius)` |
| Chất lượng | 25 | Bayesian/5 khi đủ cơ sở nội bộ |
| Khớp nhu cầu | 20 | 1 khi có yêu cầu món/nhãn, 0.7 khi tìm mở |
| Quan tâm | 10 | **TẮT**: chưa có CTR impression/visit đủ mẫu và dedup |
| Mới dữ liệu | 10 | `exp(-ageDays/180)` |

Mẫu số chuẩn hóa là tổng trọng số thực sự hoạt động (90 hoặc 65). Không dùng raw total clicks để xếp hạng hoặc biến lượt chọn thành sao. Các quán mới không bị loại vì thiếu review, vẫn cạnh tranh theo gần/khớp/độ mới. Chưa có thuật toán exploration quota hoặc cá nhân hóa giảm lặp lâu dài; đổi 3 gợi ý là dedup trong lượt tìm hiện tại.

## Quản trị & cấp thử Pro

Tạo một khóa ngẫu nhiên riêng vào `.env.local` dưới `ADMIN_TOKEN`, không dùng khóa API Google và không commit khóa. Khởi động lại API, vào `/admin`, nhập khóa vào trường password. Khóa chỉ ở state bộ nhớ của tab; không lưu localStorage/cookie. Đừng chia sẻ khóa hay chạy admin trên máy chủ public. `GET /api/admin` và mọi mutation admin đều cần Bearer hợp lệ; Pro không có quyền admin.

Đăng nhập development ở UI trước, rồi dùng CLI trên máy có quyền DB:

```powershell
npm run admin -- accounts
npm run admin -- grant-pro <account_id-trong-danh-sach> 7
```

CLI cấp 1–30 ngày, ghi audit, bị cấm production. Tải lại trang để nhận trạng thái Pro mới. Không có nút UI tự cấp Pro. Để thử review, chọn Ghé thăm rồi đợi 30 phút; bài chờ duyệt ở admin. Tests tự tạo dữ liệu thời gian trong DB test riêng, không sửa thời gian thật trong app.

## API chính

Mọi route dưới `/api`. Mutations JSON bắt buộc `Origin=WEB_ORIGIN`; proxy Next giúp trình duyệt gọi cùng nguồn. Không bật CORS tùy ý. API chỉ lắng nghe loopback. Rate limit lưu trong PostgreSQL, có session/login/OTP/review/report/geocode và hạn chung API. Qua Next proxy local, các client hiện có thể chia sẻ bucket IP backend; cần cấu hình proxy đáng tin cậy trước khi mở rộng.

| Route | Công dụng / quyền |
| --- | --- |
| `GET /session` | Khởi tạo/đọc phiên, user, Pro và cấu hình khả dụng |
| `GET /restaurants?lat=&lng=&radius=&q=&budget=&open=&group=&tags=&exclude=` | Tìm, khách dùng được |
| `GET /directory?lat=&lng=&q=&group=` | Toàn bộ 400 hồ sơ Hà Nội; điểm đã khớp được tính khoảng cách, còn lại distance=null; không áp dụng bán kính ngầm |
| `GET /restaurants/:id` | Chi tiết, khách dùng được |
| `POST /restaurants/:id/visit` | Gate, trả `requiresLogin` hoặc URL chỉ đường |
| `POST /auth/login` | `{provider, token}`; development chỉ khi bật ngoài production |
| `POST /auth/logout`, `POST /auth/otp` | Logout; OTP hiện trả 503 sau rate limit |
| `POST /locations/resolve` | Tra tên/địa chỉ trong tọa độ quán đã lưu; không gọi dịch vụ ngoài; 5/10 phút/phiên + 10/10 phút/IP |
| `GET /library`, `POST/DELETE /restaurants/:id/favorite` | Free đã đăng nhập |
| `GET /compare?ids=id1,id2&group=phở`, `POST /filters` | Pro active |
| `GET /restaurants/:id/eligibility`, `POST /restaurants/:id/reviews` | Điều kiện review, tạo/cập nhật Pro |
| `POST /restaurants/:id/reports` | Báo sai quán/review, giới hạn tần suất |
| `GET /admin`, `POST /admin/restaurants`, `PUT/DELETE /admin/restaurants/:id` | Bearer admin |
| `PATCH /admin/reviews/:id`, `PATCH /admin/reports/:id`, `POST /admin/geocode` | Moderation / báo sai / geocode admin |
| `POST /payments/webhook` | Chỉ chữ ký hợp lệ; không dùng cookie để cấp Pro |

Webhook mẫu: JSON `{id, account_id, expires_at}` (ISO UTC), header `x-payment-timestamp` Unix seconds và `x-payment-signature=hex(HMAC_SHA256(secret, timestamp + '.' + rawBody))`. Đây là giao thức adapter nội bộ, **không phải** PayOS/VNPay/MoMo/Stripe; phải bổ sung adapter đúng merchant, kiểm tra giao dịch/giá tiền/sản phẩm, hoàn tiền và hủy trước khi bán gói. Chưa có nút thu tiền.

## Tích hợp chưa cấu hình & chính sách Google

- **Phone OTP / Google / Facebook**: bộ kiểm tra token backend đã có; chưa có flow SDK/OAuth/reCAPTCHA phía trình duyệt và chưa kiểm thử credentials thật. Nút UI nhà cung cấp bị khóa, ghi “Chưa hoàn tất tích hợp”. Chỉ điền client ID chưa đủ để bật đăng nhập thật. Phone cần triển khai Firebase client/reCAPTCHA và giới hạn gửi SMS phía nhà cung cấp; endpoint OTP hiện không gửi SMS. Cần kiểm thử callback/state/nonce, revoked/disabled accounts và app review trước production.
- **Geocoding**: không có key trong repo và không gọi billable API trong lần kiểm thử này. Timeout 4 giây, tối đa 2 lần; retry chỉ lỗi mạng/server/UNKNOWN_ERROR. Có ZERO_RESULTS, REQUEST_DENIED, quota và ambiguity; người dùng chọn ứng viên rõ ràng. Không cache hoặc tự lưu tọa độ Google vào quán. Admin chỉ lưu tọa độ độc lập được nhập từ nguồn có quyền lưu; không sao chép kết quả Google vào trường nguồn nhập tay.
- Đã đối chiếu [Geocoding policies](https://developers.google.com/maps/documentation/geocoding/policies) và [Service Specific Terms](https://cloud.google.com/maps-platform/terms/maps-service-terms): caching bị giới hạn, ngoại lệ tọa độ tạm thời tối đa 30 ngày không phải quyền lưu vĩnh viễn. MVP chọn **không lưu kết quả Google**. Vị trí nhập tạm chỉ nằm trong state trang và request. Hiển thị attribution “Google Maps” nếu sử dụng ứng viên. Trang `/about` có thông tin dữ liệu, riêng tư và liên kết điều khoản; cần bản pháp lý/vận hành đầy đủ trước phát hành.
- Link chỉ đường `https://www.google.com/maps/dir/?api=1&destination=<lat,lng URL encoded>` không cần key; không chứng minh địa chỉ được xác minh.
- Tham chiếu auth: [Google ID token verification](https://developers.google.com/identity/gsi/web/guides/verify-google-id-token), [Firebase token verification](https://firebase.google.com/docs/auth/admin/verify-id-tokens).

## Kiểm thử đã thực hiện

```powershell
npm run typecheck
npm test
npm run build
# Khi đã chạy npm run demo hoặc hai dịch vụ:
npm run smoke
npm audit --omit=dev
```

Kết quả ngày 17/11/2026: **15/15 nhóm kiểm thử đạt**, typecheck đạt, build API + Next đạt, smoke xuyên **Next → Nest → PostGIS** đạt, audit production dependencies báo 0 lỗ hổng ở thời điểm kiểm tra. Tests tự tạo DB tên `angiday_test_<random>` trên PostgreSQL local và xóa đúng DB đó sau khi xong; yêu cầu user DB có CREATEDB. Không dùng in-memory/mock DB và không chỉnh dữ liệu DB demo cho nghiệp vụ test. Các lỗi token giả được kiểm tra; chưa kiểm thử xác thực nhà cung cấp hoặc Google Geocoding thành công; Photon/OpenStreetMap đã được gọi thật cho danh sách Hà Nội, xem QA.md.

Đã quan sát giao diện bằng công cụ trình duyệt ở desktop và 390×844: đúng tiếng Việt sau khi tự host font, không tràn ngang toàn trang, không có thẻ ảnh; đổi ba quán không lặp, tìm “pho”, empty giữ điều kiện, menu/giờ/nguồn, login development, lưu yêu thích và thư viện Free, địa chỉ thiếu cấu hình. Không cấp quyền vị trí hệ điều hành hoặc gọi Google API trong QA. Kiểm tra gate/race/Pro/moderation/webhook được thực hiện qua HTTP backend thật. Xem `QA.md` để biết phạm vi và giới hạn.

## Cấu trúc

```text
apps/web/app/           Next UI, modal, tìm, thư viện, so sánh, review
apps/web/app/admin/     UI quản trị chỉ chữ, khóa riêng
apps/web/app/about/     Minh bạch dữ liệu và riêng tư
apps/api/src/main.ts   Nest bootstrap, routes, Origin, bộ xử lý lỗi
apps/api/src/service.ts Nghiệp vụ / giao dịch / quyền / adapter geocode & webhook
apps/api/src/domain.ts Validation, nhãn, giờ, ranking, Maps URL
apps/api/src/auth.ts   Token adapters, cấu hình development
apps/api/src/db.ts     Pool & transaction
apps/api/test/         Kiểm thử HTTP + PostGIS thật
db/                    Migration có version, GiST, constraints, view aggregate
scripts/               Migration, seed, CLI Pro, demo, smoke
```

## Giới hạn và bước production

Đây là MVP chạy local, chưa phát hành dịch vụ thật. Không có CSV import, cá nhân hóa dài hạn, CTR, billing/merchant, OAuth UI/SMS thực tế, test thiết bị vật lý hoặc kiểm toán accessibility đầy đủ. Admin JSON editor dành cho người vận hành; chưa có form nhập dữ liệu đại trà hay RBAC/MFA nhiều quản trị viên.

Đã đọc workflow Sites. Hosting Sites chạy Cloudflare Workers, không chạy trực tiếp NestJS Node listener và PostgreSQL TCP/PostGIS của repo này. Vì yêu cầu giữ đúng stack và không đưa demo/admin lên public, **không tạo một bản deploy thay backend hoặc tuyên bố đã deploy full stack**. Local preview đã chạy thành công tại URL trên; server QA được dừng sau bàn giao. `npm run demo` khởi động lại được, dữ liệu Docker vẫn còn.

Để production: host Next và Nest trong Node/container phía sau HTTPS reverse proxy, PostgreSQL/PostGIS riêng với role ứng dụng tối thiểu quyền, migration role tách; bỏ credentials mặc định local; tắt demo; secret manager; hoàn thiện OAuth/OTP/merchant và kiểm thử thật; thay seed bằng dữ liệu được phép dùng; quy trình kiểm duyệt, retention/xóa/xuất dữ liệu; backup/restore; giám sát; rotation admin/RBAC/MFA; CSP, trusted proxy và rate limit theo IP đáng tin cậy; giới hạn tài nguyên và dọn bucket rate limit hết hạn. Health hiện kiểm tra tiến trình, chưa kiểm tra DB readiness. Không expose trực tiếp admin/API loopback ra Internet.
