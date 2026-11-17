# Tọa độ từ địa chỉ Hà Nội — Photon / OpenStreetMap

**Kết quả lượt 17/11/2026:** đã tra đủ 400 địa chỉ khác nhau; 77 khớp rõ để tính khoảng cách, 309 cần xem lại, 7 mơ hồ, 7 không có kết quả. 323 hồ sơ còn lại vẫn hiện trong danh sách với tọa độ null. Không đánh đồng “API có phản hồi” với “đã tìm được vị trí quán”.

Đây là cache của một lượt tra danh sách 400 địa điểm người dùng cung cấp, không phải cơ sở dữ liệu quán được xác minh độc lập. Nguồn địa chỉ trong `../imports/ha-noi-2026-11-17/`. `photon-hanoi.json` giữ câu hỏi và kết quả tra để không gửi lại cùng địa chỉ. `hanoi-location-report.json` là kết quả đối chiếu số nhà/đường và tình trạng từng địa điểm.

Nominatim public không phân giải DNS được từ máy này khi thử. Đã chuyển sang [Photon của komoot](https://github.com/komoot/photon), sử dụng dữ liệu OpenStreetMap. API demo được cho phép dùng ở mức hợp lý, có thể bị giới hạn và không đảm bảo sẵn sàng. Lượt này chạy một máy, một luồng, nghỉ ít nhất 2.1 giây **sau mỗi phản hồi**, có timeout, dừng khi lỗi mạng/HTTP bất thường. Không thử lách giới hạn hoặc tự chạy định kỳ. App không gọi API này theo từng lần gõ hay từng lượt mở trang. Không dùng key Google và không thu phí API cho lượt tra này.

**Attribution và giấy phép:** © [OpenStreetMap contributors](https://www.openstreetmap.org/copyright), dữ liệu theo **Open Database License (ODbL)**. Các trường kết quả OSM trong thư mục này và tập tọa độ dẫn xuất phải giữ nguồn/giấy phép ODbL khi chia sẻ. Nội dung tài liệu quán do người dùng cung cấp được lưu riêng; mã ứng dụng không bị trộn vào giấy phép dữ liệu. Không lưu ảnh.

## Kiểm tra độ khớp

- Chỉ chấp nhận tọa độ Việt Nam trong vùng Hà Nội, có metadata thành phố/tỉnh Hà Nội; không nhận địa chỉ trùng số nhà/tên đường ở tỉnh khác.
- Số nhà và tên đường phải khớp sau chuẩn hóa dấu, chữ hoa/thường và tiền tố phố/đường; hoặc tên POI khớp rõ với đường nguồn, không có số nhà mâu thuẫn.
- Không dùng tọa độ trung tâm phố/phường/thành phố hoặc một số nhà khác dù tên đường giống nhau.
- Nếu có node POI và polygon cùng địa chỉ, chỉ gộp khi các điểm trong cụm 30 m, giữ một điểm thật từ kết quả API. Các ứng viên xa nhau giữ `ambiguous`.
- Khớp địa chỉ chỉ cung cấp điểm để tính khoảng cách đường thẳng ước tính; không chứng minh quán còn mở hay địa chỉ đã được người vận hành kiểm tra.
- Quán chưa khớp vẫn có trong danh sách `/ha-noi`, hiện “Chưa tính được khoảng cách”. Chỉ đường dùng địa chỉ nguồn và được nói rõ là tìm theo địa chỉ; không gán điểm giả.

## Chạy lại

```powershell
npm run data:geocode:hanoi
npm run data:activate:hanoi
```

Lệnh đầu chỉ tra các record chưa có cache, không tự tra lại record đã lưu, kể cả khi kết quả không khớp. Không chạy nhiều tiến trình. `photon.lock` chỉ tồn tại trong lúc tra; nếu máy bị tắt đột ngột, cần xác nhận không còn tiến trình trước khi xóa lock cũ. Muốn sử dụng dài hạn/tải lớn, tự host Photon hoặc cấu hình nhà cung cấp có chính sách phù hợp (`PHOTON_ENDPOINT`); không phụ thuộc demo public cho production.

Lệnh activate không gọi dịch vụ ngoài: đọc cache, đối chiếu và cập nhật tọa độ vào PostgreSQL. `npm run demo` tự nạp 400 hồ sơ cùng tọa độ đã cache, không tự chạy lượt API mới. Các trường giá bán, menu chi tiết, giờ, bestseller và điểm vẫn không được tự suy ra.
