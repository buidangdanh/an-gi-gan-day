# Danh sách quán Hà Nội được người dùng cung cấp

**Cập nhật sử dụng trong app:** 400 hồ sơ đã được đưa vào danh sách `/ha-noi` theo yêu cầu tiếp theo của người dùng. Trạng thái `publishable=false`/lat,lng=null trong JSON/CSV dưới đây là **bản chụp dữ liệu nguồn ban đầu**, không phải trạng thái ứng dụng hiện tại. Tọa độ và kết quả đối chiếu mới ở `../../geocoding/hanoi-location-report.json`; bản cache/giấy phép tại `../../geocoding/README.md`. Hồ sơ không khớp rõ vẫn giữ tọa độ null trên app và không tính khoảng cách. Chưa xác minh hoạt động của quán.

Đã lưu ngày 17/11/2026 từ [tài liệu nguồn](https://docs.google.com/document/d/1AowweHdwdHUNa-nKYxlSTJKugRM-01tM/edit). File nguồn trên Drive là Word .docx. Chỉ trích xuất và lưu chữ; không tải/lưu ảnh hoặc bản nhị phân tài liệu.

- **400 dòng địa điểm**, 20 nhóm món × 20 địa điểm, 400 cặp tên–địa chỉ khác nhau theo đối chiếu chính xác. Chưa xác minh các tên gần giống có phải cùng quán.
- Phân loại nguồn theo tài liệu: 278 bài viết/website, 4 TikTok Notes, 39 hồ sơ sơ bộ, 62 danh bạ/tra cứu, 17 đại lý nguồn 2024. Đây là nhãn do tài liệu cung cấp, chưa kiểm tra độc lập các website.
- Giữ nguyên tên, địa chỉ, thứ tự trong nhóm, nhóm món, giá tham khảo **theo món**, loại nguồn, ghi chú và ngày sửa tài liệu. Liên kết nguồn chung được lưu; bản trích chữ không chứa URL nhúng của từng “Bài viết” hoặc “Tra Maps”, nên không tự dựng URL đó.
- `source.txt`: bản chữ nguồn; `restaurants.json`: dữ liệu có cấu trúc và lưu ý; `restaurants.csv`: bản tiện xem/trao đổi; `summary.json`: số lượng, thống kê, SHA-256 bản chữ.
- Chưa có tọa độ, giờ mở cửa, menu xác minh, giá riêng từng quán, bestseller hoặc điểm nội bộ: giữ `null`. Không lấy mức giá chung làm giá bán từng quán; không biến thứ tự tài liệu thành xếp hạng.
- Tất cả đặt `pending_verification`, `missing_coordinates`, `publishable=false`. 17 đại lý Kem Tràng Tiền từ năm 2024 cần kiểm tra còn hoạt động; không gán “đang mở”.

Lưu vào PostgreSQL của dự án:

```powershell
npm run db:up
npm run db:migrate
npm run data:import:hanoi
```

Đã thực hiện nhập và chạy lại kiểm tra không trùng. Migration 004 tạo `import_documents` và `restaurant_candidates`, tách khỏi bảng `restaurants` hiển thị trong app. Quán seed hư cấu không bị thay thế. Dữ liệu này không được tự gọi là minh họa/hư cấu: đây là thông tin do người dùng cung cấp và **chưa xác minh**. Cần bổ sung tọa độ có nguồn phù hợp, xác minh hồ sơ và ánh xạ nhóm món trước khi đưa vào tìm gần đây.

Lệnh tạo lại JSON/CSV từ bản chữ: `node scripts/prepare-hanoi-import.mjs`. Lệnh nhập kiểm tra đủ 400 dòng, 20 nhóm, hash nguồn; khóa theo tài liệu và unique key để chạy lại không nhân đôi. Nếu nội dung nguồn đổi, phải đối chiếu phiên bản trước khi thay thế.
