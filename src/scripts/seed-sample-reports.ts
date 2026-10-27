/* eslint-disable */
import 'dotenv/config';
import { connectDatabase, disconnectDatabase } from '../config/db.js';
import { User } from '../models/user.model.js';
import { JobPosting } from '../models/job-posting.model.js';
import { Report } from '../models/report.model.js';

async function seed() {
  await connectDatabase();
  console.log('Connected to DB');

  const reporter = await User.findOne({ email: 'candidate-myapps@example.com' });
  const admin = await User.findOne({ email: 'admin@example.com' });
  const job = await JobPosting.findOne();

  if (!reporter || !admin) {
    console.error('Missing reporter or admin user');
    await disconnectDatabase();
    return;
  }

  // Clear existing reports to start fresh
  await Report.deleteMany({});

  const reports = [
    {
      ticket_id: 'REP-2026-A101',
      reporter_id: reporter._id,
      target_type: 'job',
      target_id: job?._id || reporter._id,
      target_title: job?.title || 'Tuyển dụng Senior Node.js Engineer yêu cầu đặt cọc',
      target_link: '/career/jobs/senior-nodejs-engineer',
      reason_category: 'scam_fraud',
      title: 'Dấu hiệu lừa đảo thu phí ứng tuyển ban đầu',
      description: 'Nhà tuyển dụng yêu cầu ứng viên chuyển khoản 500.000 VNĐ tiền cọc hồ sơ trước khi sắp xếp lịch phỏng vấn qua Telegram.',
      evidence_files: [
        'https://images.unsplash.com/photo-1554224155-8d04cb21cd6c?w=500',
        'https://images.unsplash.com/photo-1554224154-26032ffc0d07?w=500',
      ],
      is_anonymous: false,
      status: 'pending',
      is_deleted_by_reporter: false,
      timeline: [
        {
          status: 'pending',
          timestamp: new Date(Date.now() - 3600000 * 2),
          note: 'Báo cáo được khởi tạo bởi ứng viên.',
        },
      ],
    },
    {
      ticket_id: 'REP-2026-B202',
      reporter_id: reporter._id,
      target_type: 'job',
      target_id: job?._id || reporter._id,
      target_title: 'Chuyên viên Tư vấn Tài chính Lương 50tr/tháng',
      target_link: '/career/jobs/chuyen-vien-tai-chinh',
      reason_category: 'fee_extortion',
      title: 'Tống tiền và lừa đảo mô hình đa cấp trá hình',
      description: 'Sau khi nộp đơn, ứng viên bị ép tham gia khóa đào tạo nội bộ có đóng phí 2 triệu đồng và bị đe dọa tung thông tin cá nhân.',
      evidence_files: ['https://images.unsplash.com/photo-1554224155-8d04cb21cd6c?w=500'],
      is_anonymous: true,
      status: 'reviewing',
      assigned_admin_id: admin._id,
      reviewed_at: new Date(Date.now() - 3600000 * 5),
      is_deleted_by_reporter: false,
      timeline: [
        {
          status: 'pending',
          timestamp: new Date(Date.now() - 3600000 * 6),
          note: 'Báo cáo được khởi tạo ẩn danh.',
        },
        {
          status: 'reviewing',
          timestamp: new Date(Date.now() - 3600000 * 5),
          actor_id: admin._id,
          note: 'Quản trị viên tiếp nhận hồ sơ và bắt đầu thẩm tra chứng cứ.',
        },
      ],
    },
    {
      ticket_id: 'REP-2026-C303',
      reporter_id: reporter._id,
      target_type: 'enterprise',
      target_id: reporter._id,
      target_title: 'Công ty Cổ phần Công nghệ Toàn Cầu Apex Corp',
      target_link: '/enterprises/apex-corp',
      reason_category: 'impersonation',
      title: 'Mạo danh thương hiệu doanh nghiệp uy tín để tuyển dụng',
      description: 'Công ty này sử dụng logo và địa chỉ của tập đoàn Apex nhưng mã số thuế và tài khoản ngân hàng thụ hưởng là cá nhân.',
      evidence_files: [],
      is_anonymous: false,
      status: 'resolved',
      assigned_admin_id: admin._id,
      reviewed_at: new Date(Date.now() - 86400000),
      resolution_decision: 'resolved',
      action_taken: 'content_takedown',
      internal_notes: 'Đã xác minh qua hotline chính thức của tập đoàn Apex. Đây là tổ chức giả mạo. Đã gỡ bỏ toàn bộ tin tuyển dụng.',
      message_to_reporter: 'Cảm ơn bạn đã báo cáo. Chúng tôi đã thẩm tra và gỡ bỏ toàn bộ thông tin của đơn vị mạo danh này khỏi hệ thống.',
      resolved_at: new Date(Date.now() - 43200000),
      is_deleted_by_reporter: false,
      timeline: [
        {
          status: 'pending',
          timestamp: new Date(Date.now() - 86400000 * 2),
          note: 'Báo cáo được gửi.',
        },
        {
          status: 'reviewing',
          timestamp: new Date(Date.now() - 86400000),
          actor_id: admin._id,
          note: 'Tiếp nhận xử lý.',
        },
        {
          status: 'resolved',
          timestamp: new Date(Date.now() - 43200000),
          actor_id: admin._id,
          note: 'Xác minh thành công, thực hiện gỡ bỏ nội dung vi phạm.',
        },
      ],
    },
    {
      ticket_id: 'REP-2026-D404',
      reporter_id: reporter._id,
      target_type: 'job',
      target_id: job?._id || reporter._id,
      target_title: 'Trợ lý Giám đốc Kinh doanh Part-time',
      target_link: '/career/jobs/tro-ly-kinh-doanh',
      reason_category: 'offensive_content',
      title: 'Nội dung tuyển dụng phân biệt đối xử và không phù hợp',
      description: 'Mô tả công việc chứa các tiêu chuẩn giới tính và ngoại hình phản cảm, vi phạm quy định cộng đồng.',
      evidence_files: [],
      is_anonymous: false,
      status: 'withdrawn',
      withdrawal_reason: 'Nhà tuyển dụng đã liên hệ đính chính và sửa lại tin đăng chuẩn mực.',
      withdrawn_at: new Date(Date.now() - 10000000),
      is_deleted_by_reporter: false,
      timeline: [
        {
          status: 'pending',
          timestamp: new Date(Date.now() - 20000000),
          note: 'Báo cáo được tạo.',
        },
        {
          status: 'withdrawn',
          timestamp: new Date(Date.now() - 10000000),
          note: 'Người báo cáo chủ động rút đơn khiếu nại.',
        },
      ],
    },
    {
      ticket_id: 'REP-2026-E505',
      reporter_id: reporter._id,
      target_type: 'user',
      target_id: reporter._id,
      target_title: 'Hồ sơ người dùng NguyenVanA (Recruiter)',
      target_link: '/users/recruiter-a',
      reason_category: 'harassment',
      title: 'Hành vi quấy rối và xúc phạm ứng viên sau phỏng vấn',
      description: 'Nhắn tin qua Zalo với lời lẽ xúc phạm sau khi ứng viên từ chối offer.',
      evidence_files: ['https://images.unsplash.com/photo-1554224155-8d04cb21cd6c?w=500'],
      is_anonymous: false,
      status: 'rejected',
      assigned_admin_id: admin._id,
      reviewed_at: new Date(Date.now() - 86400000),
      resolution_decision: 'rejected',
      action_taken: 'none',
      internal_notes: 'Chứng cứ cung cấp không đủ rõ ràng để xác thực chủ tài khoản Zalo thuộc về nhà tuyển dụng này.',
      message_to_reporter: 'Sau khi rà soát, chúng tôi chưa có đủ căn cứ pháp lý để khẳng định vi phạm từ phía người dùng được báo cáo. Bạn có thể bổ sung thêm bằng chứng nếu cần.',
      resolved_at: new Date(Date.now() - 20000000),
      is_deleted_by_reporter: false,
      timeline: [
        {
          status: 'pending',
          timestamp: new Date(Date.now() - 86400000 * 2),
        },
        {
          status: 'reviewing',
          timestamp: new Date(Date.now() - 86400000),
          actor_id: admin._id,
        },
        {
          status: 'rejected',
          timestamp: new Date(Date.now() - 20000000),
          actor_id: admin._id,
          note: 'Bác bỏ báo cáo do thiếu chứng cứ xác thực.',
        },
      ],
    },
  ];

  await Report.insertMany(reports);
  console.log(`Successfully seeded ${reports.length} sample reports!`);
  await disconnectDatabase();
}

seed().catch(console.error);
