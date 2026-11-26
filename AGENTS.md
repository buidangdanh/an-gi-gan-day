# Quy Chuẩn Dự Án: Tìm Quán Ngon (timquanngon.com)

## 1. Thương hiệu & Tên miền
- Tên sản phẩm chính thức: **Tìm quán ngon** (tên miền: `https://timquanngon.com` và `https://www.timquanngon.com`).
- Gói nâng cấp thành viên: **Quán Ngon · Pro** (tuyệt đối không dùng lại tên cũ `Ăn gì đây?` hay `angiday.vn` trong giao diện và nội dung hiển thị mới).
- Tài liệu tổng quan hệ thống nằm tại `HUONG-DAN-VAN-HANH-TIMQUANNGON.md`; thông tin nhạy cảm cục bộ nằm tại `THONG-TIN-BAO-MAT-RIENG.local.md`.

## 2. Bất biến Giao diện & Trải nghiệm người dùng (UI/UX Invariants)
- **Thanh đầu trang (`.discovery-topbar`):**
  - Bên trái: Logo hình vuông bo góc nền xanh dương `36 × 36 px` (`apps/web/app/brand-logo.tsx`) với biểu tượng kính lúp chữ `Q` đan xen **chiếc bát và đôi đũa**, chữ **Tìm quán ngon** nằm bên ngoài cạnh logo.
  - Bên phải: Mục **Tài khoản** đặt đối xứng ở góc phải.
  - Khi cập nhật logo, luôn đồng bộ cả 3 tệp: `apps/web/app/brand-logo.tsx`, `apps/web/app/icon.svg` và `apps/web/public/an-gi-day-placeholder.svg`.
- **Luồng khám phá hợp nhất (`apps/web/app/ha-noi/page.tsx`):**
  - Không hiển thị ô chọn thành phố thủ công và không tách riêng 2 trang Gợi ý / Tìm kiếm.
  - Vào trang mặc định tự động lấy định vị GPS (**Vị trí của bạn**).
  - Xếp hạng (`apps/api/src/catalogue.ts`) ưu tiên các quán nhiều lượt yêu thích và sắp xếp từ gần đến xa.
- **Hình ảnh quán ăn:**
  - Tuyệt đối không để hiển thị ảnh nền/banner mặc định của ShopeeFood hoặc Foody (sử dụng bộ lọc nhận diện ảnh mẫu `isThirdPartyPlaceholderBuffer` trong `apps/api/src/foody-images.ts`); mọi quán không có ảnh thật đều hiển thị ảnh bìa thương hiệu **Tìm quán ngon**.

## 3. Đặc thù Môi trường Windows & Bảo vệ Dữ liệu
- **PowerShell 5.1 & npm:**
  - Luôn gọi `npm.cmd` và `npx.cmd` thay vì `npm` / `npx` (tránh lỗi ExecutionPolicy chặn `.ps1`).
  - Không dùng toán tử `&&` trong PowerShell 5.1; nối lệnh phụ thuộc bằng `; if ($LASTEXITCODE -eq 0) { ... }`.
- **Cơ sở dữ liệu PostgreSQL (99.467 quán ăn):**
  - Chạy qua Docker container `an-gi-gan-day-db-1` ở cổng `127.0.0.1:55439` (volume `an-gi-gan-day_pgdata`).
  - Tuyệt đối **không** chạy `docker compose down -v`, không xóa volume hoặc làm mất dữ liệu 99.467 quán của 10 tỉnh/thành.
- **Bảo mật Git (`origin/master` — `https://github.com/buidangdanh/an-gi-gan-day`):**
  - Không bao giờ commit mật khẩu, chứng chỉ Cloudflare (`cert.pem`, `*.json`), tệp `.env*`, `*.local.md` hoặc thư mục `secrets/`.
