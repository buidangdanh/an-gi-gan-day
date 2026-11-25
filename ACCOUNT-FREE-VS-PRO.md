# Thiết kế Chi tiết Hệ thống Tài khoản Thường (Free) & Pro — Tìm quán ngon (`timquanngon.com`)

Tài liệu đặc tả nghiệp vụ, quyền lợi phân tầng, mô hình dữ liệu, bảo mật xác thực và luồng nâng cấp đã triển khai trực tiếp trong sản phẩm **Tìm quán ngon** (`timquanngon.com`).

---

## 1. Triết lý phân tầng (Freemium Product Strategy)

- **Không chặn nhu cầu cốt lõi:** Người dùng mới (Khách) mở web lên vẫn thấy ngay **4 gợi ý ăn/uống tách biệt kèm ảnh, thời tiết và nhãn yêu thích** trong 5 giây đầu tiên.
- **Tài khoản Thường (Free — 0đ) giữ chân người dùng quay lại:** Sau khi mở bản đồ ghé thăm 4 quán khác nhau trong 1 phiên, người dùng đăng ký tài khoản miễn phí trong 10 giây để **mở chỉ đường không giới hạn**, **đồng bộ tối đa 30 quán yêu thích lên đám mây** và xem lại **15 quán vừa ghé**.
- **Tài khoản Pro (`Quán Ngon · Pro` — 29.000đ/tháng hoặc 199.000đ/năm, có dùng thử 14 ngày miễn phí):** Phục vụ nhóm người dùng ăn ngoài thường xuyên (dân văn phòng, cặp đôi, nhóm bạn, foodie) muốn **cá nhân hóa sâu & quản lý danh sách quán ruột chuyên nghiệp**.

---

## 2. Bảng Ma trận Quyền lợi Chi tiết: Khách vs Thường vs Pro

| Nhóm tính năng | Khách (Chưa đăng nhập) | Tài khoản Thường (`Free` — 0đ) | Tài khoản `Quán Ngon · Pro` |
| --- | --- | --- | --- |
| **Gợi ý 4 thẻ (Ăn riêng / Uống riêng)** | ✅ Không giới hạn lượt đổi | ✅ Không giới hạn lượt đổi | ✅ Không giới hạn + **Chế độ `⚡ Ưu tiên quán Top Yêu thích`** |
| **Xem ảnh quán, thời tiết & nhãn ưa chuộng** | ✅ Đầy đủ | ✅ Đầy đủ | ✅ Đầy đủ |
| **Mở chỉ đường Google Maps (`visit`)** | Tối đa **4 quán khác nhau / phiên** | ✅ **Không giới hạn** | ✅ **Không giới hạn** |
| **Lưu quán yêu thích (`♥`)** | Tạm trên máy (tối đa 10 quán) | ✅ **Đồng bộ tài khoản tối đa 30 quán** | ✅ **Lưu không giới hạn** |
| **Bộ sưu tập cá nhân (Collections)** | ❌ | ❌ | ✅ **Tạo tối đa 20 Bộ sưu tập có biểu tượng riêng** (*Ăn trưa công ty*, *Hẹn hò*, *Quán ruột ngày mưa*…) |
| **Ghi chú bí kíp riêng tại từng quán** | ❌ | ❌ | ✅ **Ghi chú cá nhân hóa trên từng quán** (*“Gọi tái gầu, gửi xe ngõ 12, né giờ 12h15”*) |
| **Hồ sơ Khẩu vị & Tự động Né món** | ❌ | Lưu khu vực mặc định | ✅ **Ẩn tự động các nhóm món không ăn / dị ứng** khỏi toàn bộ lượt gợi ý 4 thẻ |
| **Khay So sánh trực quan 2–4 quán** | ❌ | ❌ | ✅ **So sánh ngang 2–4 quán** (ảnh, khoảng cách, thời tiết hiện tại, mức độ yêu thích, ghi chú riêng) |
| **Lịch sử mở bản đồ ghé quán** | Không lưu | ✅ **15 quán gần nhất** | ✅ **100 quán gần nhất** |
| **Viết đánh giá 4 tiêu chí & Huy hiệu** | Chỉ xem | Chỉ xem | ✅ Viết đánh giá (Vị · Giá trị · Phục vụ · Không gian) + **Huy hiệu `PRO ✦` xanh ngọc** |

---

## 3. Nhãn “Độ yêu thích” trên Thẻ quán (`popularity_badge`)

Dựa trên tín hiệu lượt lưu (`TotalSaves`), số lượng phản hồi (`TotalReviews`), mức điểm cộng đồng và danh sách tuyển chọn, hệ thống tính `popularity_score` (thang `0..100`) và gắn nhãn trực quan ngay trên thẻ:

1. **`🔥 Rất được yêu thích` (`top_fav`):** Các quán nổi bật có lượng lưu cao (`≥ 40` lượt lưu) hoặc điểm đánh giá tốt kèm lượng phản hồi dày (`≥ 40–120` lượt).
2. **`❤️ Nhiều người ưa chuộng` (`popular`):** Các quán quen thuộc có từ `10+` lượt lưu hoặc điểm ổn định từ `12+` phản hồi, hoặc nằm trong danh sách tuyển chọn Hà Nội.
3. **`⭐ Đánh giá tốt` (`good_rating`):** Các quán có mức điểm phản hồi tích cực (`≥ 7.2/10`).
4. **`✨ Quán đáng thử` (`worth_try`):** Quán đã có tương tác/hình ảnh thực tế từ cộng đồng.
5. **Không gắn nhãn ảo:** Các quán mới chưa có tương tác giữ nguyên `NULL` (minh bạch, không bịa đặt độ hot).

---

## 4. Kiến trúc Bảo mật & Cơ sở dữ liệu (`Migration 010`)

- **Xác thực mật khẩu chuẩn OWASP (`apps/api/src/password.ts`):**
  - Mật khẩu băm bằng **`scrypt` (`N=16384, r=8, p=1`, salt ngẫu nhiên 16 byte, khóa dẫn xuất 64 byte)**.
  - Kiểm tra bằng `timingSafeEqual`; khi tên đăng nhập không tồn tại vẫn chạy hàm băm giả (`DUMMY_SALT`) để chống dò tài khoản qua thời gian phản hồi (timing enumeration).
  - Đăng nhập/Đăng ký tự động **quay vòng Session Cookie (`HttpOnly`, `SameSite=Lax`, `Secure`)** và chuyển toàn bộ lịch sử phiên khách sang tài khoản mới.
- **Kiểm tra quyền nghiêm ngặt ở tầng Backend API:**
  - Mọi đặc quyền Pro (`collections`, `place_notes`, `excluded_groups`, `pro_boost`, `compare`, `reviews`) đều kiểm tra trực tiếp `subscriptions.expires_at > now()` trên PostgreSQL — không bao giờ tin trạng thái từ trình duyệt.
  - Khi hết hạn Pro: dữ liệu Bộ sưu tập, Ghi chú và Đánh giá đã duyệt của người dùng **không bị xóa** (chỉ tạm khóa quyền thêm/sửa cho đến khi gia hạn lại).
- **Dùng thử 14 ngày minh bạch (`pro_trials`) & Webhook Thanh toán (`payment_events`):**
  - Mỗi `account_id` được kích hoạt **1 lần dùng thử Pro 14 ngày miễn phí** (ràng buộc khóa chính `pro_trials(account_id)` trong giao dịch ACID).
  - Hệ thống thanh toán chính thức kết nối qua `POST /api/payments/webhook` ký `HMAC-SHA256` kèm kiểm tra chống phát lại (replay window 5 phút) và idempotency.
