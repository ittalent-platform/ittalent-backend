# Hướng Dẫn Chạy Demo Backend với SQLite (School Project Demo)

Tài liệu này hướng dẫn cách chạy toàn bộ hệ thống backend **ITTalent** sử dụng **SQLite** thay vì MongoDB, phục vụ mục đích chấm bài và thuyết trình môn học.

---

## 1. Giới thiệu Kiến trúc & Mục đích

- **Nhánh chính (`dev`)**: Sử dụng **MongoDB + Mongoose**, yêu cầu ReplicaSet `rs0` và cấu hình hạ tầng phân tán.
- **Nhánh demo (`demo/sqlite-migration`)**: Chuyển đổi tầng lưu trữ sang **SQLite** (sử dụng `better-sqlite3` và `drizzle-orm`).
  - **Zero-configuration**: Toàn bộ database gói gọn trong file `./data/demo.sqlite`.
  - **Không phụ thuộc dịch vụ ngoài**: Không cần Docker, không cần cài đặt hay bật MongoDB service.
  - **Khởi động tức thì**: Chạy lệnh seed trong ~1 giây là có đầy đủ toàn bộ dữ liệu mẫu.
  - **Tương thích 100%**: Sử dụng ID 24 ký tự hex (tương thích MongoDB ObjectId), giữ nguyên toàn bộ contract API, Zod validations và client frontend.

---

## 2. Mô hình Thực thể Quan hệ (SQLite ERD)

Toàn bộ 20 bảng cơ sở dữ liệu được định nghĩa type-safe tại `src/db/schema/`:

- **Identity & Auth**: `users`, `accounts`, `tokens`, `user_audits`, `user_invitations`, `user_email_changes`
- **Enterprise & Jobs**: `enterprises`, `enterprise_registrations`, `job_postings`, `job_posting_audits`
- **Hồ sơ & Ứng tuyển**: `applications`, `interviews`, `documents`, `wishlists`
- **Tiện ích & Thông báo**: `notifications`, `device_tokens`, `broadcast_notifications`, `reports`, `certificate_links`, `portfolio_links`

---

## 3. Các Bước Chạy Demo Nhanh

### Bước 1: Cài đặt thư viện
```bash
npm install
```

### Bước 2: Khởi tạo và nạp dữ liệu mẫu
Lệnh này tự động tạo schema SQLite và nạp tài khoản admin, công ty mẫu, tin tuyển dụng, đơn ứng tuyển:
```bash
npm run seed:demo
```

### Bước 3: Khởi động Backend Server
```bash
npm run dev
```

Server sẽ lắng nghe tại:
- **API Server**: `http://localhost:3000`
- **Swagger UI Interactive Docs**: `http://localhost:3000/docs`

---

## 4. Danh Sách Tài Khoản Demo

Tất cả tài khoản đều sử dụng chung mật khẩu: **`Password123456!`**

| Vai trò | Email đăng nhập | Tên hiển thị | Ghi chú |
| :--- | :--- | :--- | :--- |
| **System Admin** | `admin@example.com` | System Administrator | Toàn quyền quản trị hệ thống |
| **Enterprise Admin** | `enterprise_admin@example.com` | FPT Tech Lead | Quản trị viên doanh nghiệp (FPT Software) |
| **Recruiter** | `recruiter@example.com` | FPT Recruiter | Nhà tuyển dụng thuộc FPT Software |
| **Candidate / Applicant** | `candidate@example.com` | Nguyen Van Candidate | Ứng viên (đã có sẵn hồ sơ ứng tuyển mẫu) |

---

## 5. Kiểm tra Chất lượng Mã Nguồn

```bash
# Kiểm tra TypeScript type safety
npm run typecheck

# Chạy toàn bộ Unit Tests
npm run test:unit
```
