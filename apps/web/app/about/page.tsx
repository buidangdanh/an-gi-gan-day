export default function About() {
 return (
  <main className="about-page">
   <a href="/" className="back">← Về trang 4 gợi ý quán</a>
   <p className="eyebrow">MINH BẠCH · BẢO MẬT · BẢN QUYỀN</p>
   <h1>Chỉ chữ.<br />Tôn trọng dữ liệu & bản quyền.</h1>

   <h2>1. Nguyên tắc không vi phạm bản quyền</h2>
   <ul>
    <li><strong>Không dùng ảnh có bản quyền:</strong> Website thiết kế thuần chữ (text-only), không cào, không lưu trữ và không hiển thị hình ảnh món ăn/không gian của bên thứ ba.</li>
    <li><strong>Không sao chép đánh giá hay thực đơn độc quyền:</strong> Điểm số, nhận xét hoặc thực đơn chi tiết từ các nền tảng khác không được sao chép vào hệ thống. Chỉ đánh giá nội bộ do người dùng tự viết và kiểm duyệt mới được tính điểm.</li>
    <li><strong>Font chữ mã nguồn mở hợp lệ:</strong> Sử dụng <em>Be Vietnam Pro</em> và <em>Lora</em> theo giấy phép <strong>SIL Open Font License 1.1 (OFL-1.1)</strong>, tự host trực tiếp trên hệ thống.</li>
    <li><strong>Cơ chế lọc bản quyền dữ liệu (<code>STRICT_LICENSE_MODE</code>):</strong> Ở môi trường thương mại (production), hệ thống hỗ trợ khóa chặt chỉ phục vụ các hồ sơ có nguồn dữ liệu hợp pháp gồm: chủ quán tự đăng ký (<code>first_party</code>), dữ liệu mở <strong>OpenStreetMap (ODbL)</strong>, <strong>Overture Maps Places (CDLA-Permissive 2.0)</strong>, hoặc dữ liệu đối tác có thỏa thuận cấp phép (<code>partner_licensed</code>). Dữ liệu tổng hợp thử nghiệm chưa xác minh bản quyền không được phép phát hành thương mại nếu chưa thay thế/xác minh.</li>
   </ul>

   <h2>2. Nguồn tọa độ & dịch vụ bản đồ</h2>
   <p>
    Tọa độ tra cứu mở sử dụng dữ liệu từ{' '}
    <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">
     © OpenStreetMap contributors (ODbL)
    </a>
    . Dữ liệu tọa độ chỉ giúp ước tính khoảng cách đường thẳng, không chứng minh quán đang mở cửa hay xác minh thực địa.
   </p>
   <p>
    Nút <strong>Mở bản đồ quán</strong> tạo liên kết ghim vị trí chuẩn theo Google Maps URLs (không lưu cache tọa độ từ Google Geocoding vào cơ sở dữ liệu). Tham khảo{' '}
    <a href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer">chính sách quyền riêng tư Google</a>,{' '}
    <a href="https://maps.google.com/help/terms_maps/" target="_blank" rel="noopener noreferrer">điều khoản Google Maps</a> và{' '}
    <a href="https://developers.google.com/maps/documentation/geocoding/policies" target="_blank" rel="noopener noreferrer">quy định Geocoding</a>.
   </p>

   <h2>3. Bảo mật & Quyền riêng tư (theo Nghị định 13/2023/NĐ-CP)</h2>
   <ul>
    <li><strong>Vị trí GPS riêng tư:</strong> Khoảng cách hiển thị trên thẻ được tính ngay trên trình duyệt thiết bị bằng công thức Haversine. Khi gửi yêu cầu xếp quán gần nhất, tọa độ được làm tròn theo ô lưới ~150 m để vừa bảo vệ vị trí chính xác vừa tăng tốc độ bộ nhớ đệm, và <strong>không lưu vào hồ sơ tài khoản</strong>.</li>
    <li><strong>Phiên & Cookie an toàn:</strong> Cookie <code>HttpOnly</code>, <code>SameSite=Lax</code>, <code>Secure</code> (HTTPS), mã ngẫu nhiên 256-bit chỉ lưu mã băm SHA-256 trên máy chủ. Đọc danh sách công khai không tạo cookie theo dõi.</li>
    <li><strong>Phòng vệ tấn công Web:</strong> Áp dụng Content-Security-Policy (CSP), kiểm tra <code>Origin</code> + <code>Sec-Fetch-Site</code> chống CSRF, giới hạn kích thước payload JSON, giới hạn tần suất (rate limiting), và bảo vệ khu vực quản trị bằng so sánh khóa chống timing-attack.</li>
   </ul>

   <h2>4. Cách gợi ý & điểm nội bộ</h2>
   <p>
    Trang mở đầu luôn gợi ý <strong>4 thẻ thuộc 4 nhóm món khác nhau</strong> để giảm phân vân khi chưa biết ăn gì. Đổi 4 món khác không tính lượt ghé thăm.
   </p>
   <p>
    Điểm mỗi đánh giá nội bộ = vị 50% + giá trị 25% + phục vụ 15% + không gian 10% (mỗi mục 1–5), điều chỉnh Bayesian (m=10) khi toàn hệ thống đủ tối thiểu 10 bài được duyệt.
   </p>

   <h2>5. Tiếp nhận chỉnh sửa & gỡ bỏ nội dung (Notice &amp; Takedown)</h2>
   <p>
    Chủ quán hoặc chủ sở hữu quyền hợp pháp có thể yêu cầu cập nhật, đính chính hoặc gỡ bỏ thông tin địa điểm thông qua chức năng <strong>Báo thông tin chưa đúng</strong> trên trang chi tiết hoặc liên hệ bộ phận vận hành trước khi công bố chính thức. Các yêu cầu hợp lệ được xử lý và ẩn hồ sơ ngay (giữ nhật ký kiểm toán).
   </p>
  </main>
 );
}
