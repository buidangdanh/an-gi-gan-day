import type { Metadata } from 'next';
import { BrandLogo } from '../brand-logo';
import { contactEmail, copyrightText, siteName, siteUrl } from '../brand';

export const metadata: Metadata = {
 title: `Bản quyền, Điều khoản & Bảo mật · ${siteName}`,
 description: `Tuyên bố bản quyền sở hữu trí tuệ, điều khoản sử dụng, chính sách bảo vệ dữ liệu cá nhân và thông tin liên hệ chính thức của ${siteName} (${siteUrl}).`,
};

export default function AboutLegalPage() {
 return (
  <main className="about-page">
   <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', marginBottom: 32 }}>
    <a href="/" style={{ display: 'inline-flex', alignItems: 'center', gap: 10, textDecoration: 'none', fontWeight: 700 }}>
     <BrandLogo size="header" />
     <span style={{ fontSize: 18 }}>{siteName}</span>
    </a>
    <a href="/" className="back" style={{ margin: 0 }}>← Quay lại trang khám phá quán ngon</a>
   </div>

   <p className="eyebrow">BẢN QUYỀN SỞ HỮU TRÍ TUỆ · ĐIỀU KHOẢN · BẢO MẬT</p>
   <h1 style={{ fontSize: 'clamp(32px, 4.4vw, 50px)' }}>
    Bản quyền &amp; Điều khoản sử dụng.
   </h1>
   <p style={{ color: 'var(--muted)', fontSize: 15 }}>
    Áp dụng cho toàn bộ nền tảng trực tuyến <strong>{siteName}</strong> tại tên miền chính thức{' '}
    <a href={siteUrl}>{siteUrl}</a> và <code>https://www.timquanngon.com</code>.
   </p>

   <h2>1. Tuyên bố Bản quyền &amp; Quyền sở hữu trí tuệ</h2>
   <ul>
    <li>
     <strong>Chủ sở hữu quyền tác giả:</strong> Toàn bộ mã nguồn phần mềm, kiến trúc hệ thống, thiết kế giao diện người dùng (UI/UX), biểu trưng nhận diện thương hiệu (logo kính lúp chữ <code>Q</code> kết hợp hình ảnh chiếc bát và đôi đũa), tên sản phẩm <strong>{siteName}</strong>, gói thành viên <strong>Quán Ngon · Pro</strong> và thuật toán xếp hạng gợi ý món ăn thuộc quyền sở hữu hợp pháp của <strong>{siteName} ({siteUrl})</strong>, được bảo hộ theo Luật Sở hữu trí tuệ Việt Nam và Công ước Berne.
    </li>
    <li>
     <strong>Bảo lưu mọi quyền:</strong> <code>{copyrightText}</code> Mọi hành vi sao chép giao diện, làm giả tên miền/thương hiệu hoặc phát tán lại mã nguồn dưới bất kỳ hình thức nào khi chưa có sự chấp thuận bằng văn bản của chủ sở hữu đều là hành vi xâm phạm quyền sở hữu trí tuệ.
    </li>
   </ul>

   <h2>2. Nghiêm cấm sao chép &amp; Thu thập dữ liệu tự động (Anti-Scraping)</h2>
   <ul>
    <li>
     Người dùng chỉ được sử dụng <strong>{siteName}</strong> cho mục đích tra cứu cá nhân, tìm kiếm địa điểm ăn uống hợp pháp.
    </li>
    <li>
     <strong>Nghiêm cấm tuyệt đối</strong> việc sử dụng công cụ tự động (bot, spider, crawler, scraper, script) để trích xuất hàng loạt danh sách địa điểm, sao chép cơ sở dữ liệu được tuyển chọn/phân loại trên {siteUrl}, hoặc thực hiện tấn công gây quá tải dịch vụ (DDoS).
    </li>
   </ul>

   <h2>3. Minh bạch dữ liệu địa điểm &amp; Miễn trừ trách nhiệm</h2>
   <ul>
    <li>
     <strong>Tính chất tham khảo:</strong> Thông tin nhóm món, khoảng giá, khung giờ mở cửa và thời tiết quanh quán được tổng hợp và phân loại nhằm hỗ trợ người dùng ra quyết định nhanh trước bữa ăn. Tình trạng hoạt động hoặc thực đơn thực tế tại quán có thể thay đổi theo thời điểm mà không báo trước.
    </li>
    <li>
     <strong>Bản đồ &amp; Tọa độ:</strong> Tọa độ địa lý mở tham chiếu dữ liệu từ{' '}
     <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">
      © OpenStreetMap contributors (ODbL)
     </a>
     . Tính năng mở đường đi chuyển hướng trực tiếp sang ứng dụng Google Maps chính thức theo điều khoản sử dụng của Google.
    </li>
    <li>
     <strong>Font chữ hợp chuẩn:</strong> Sử dụng bộ chữ mã nguồn mở <em>Be Vietnam Pro</em> và <em>Lora</em> theo giấy phép <strong>SIL Open Font License 1.1 (OFL-1.1)</strong>.
    </li>
   </ul>

   <h2>4. Bảo vệ Dữ liệu cá nhân &amp; An toàn thông tin (Nghị định 13/2023/NĐ-CP)</h2>
   <ul>
    <li>
     <strong>Quyền riêng tư vị trí GPS:</strong> Khoảng cách từ bạn đến quán được tính trực tiếp trên trình duyệt. Khi truy vấn danh sách gần nhất, tọa độ được lượng tử hóa theo ô lưới ~150 m để bảo vệ vị trí chính xác của người dùng và <strong>không lưu trữ lịch sử di chuyển GPS</strong>.
    </li>
    <li>
     <strong>Bảo mật tài khoản:</strong> Mật khẩu được băm một chiều bằng thuật toán <code>scrypt</code>; phiên đăng nhập bảo vệ bằng cookie <code>HttpOnly</code>, <code>Secure</code>, <code>SameSite=Lax</code>, kết hợp xác thực Google OAuth chính chủ và lớp chống bot Cloudflare Turnstile.
    </li>
   </ul>

   <h2>5. Liên hệ Bản quyền, Hợp tác &amp; Đính chính / Gỡ bỏ thông tin</h2>
   <p>
    Chủ quán ăn, đối tác hoặc cá nhân/tổ chức có nhu cầu cập nhật thông tin địa điểm, yêu cầu đính chính/gỡ bỏ nội dung (Notice &amp; Takedown) hoặc trao đổi về bản quyền &amp; hợp tác vui lòng sử dụng nút <strong>Báo thông tin chưa đúng</strong> ngay trên thẻ quán hoặc gửi email trực tiếp về địa chỉ chính thức:
   </p>
   <p
    style={{
     padding: '14px 18px',
     background: 'var(--surface)',
     border: '1px solid var(--line)',
     borderRadius: 12,
     fontWeight: 600,
    }}
   >
    📧 Email liên hệ chính thức:{' '}
    <a href={`mailto:${contactEmail}`} style={{ color: 'var(--green)' }}>
     {contactEmail}
    </a>
   </p>

   <hr />
   <footer style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, fontSize: 13, color: 'var(--muted)' }}>
    <span>{copyrightText}</span>
    <a href={`mailto:${contactEmail}`}>{contactEmail}</a>
   </footer>
  </main>
 );
}
