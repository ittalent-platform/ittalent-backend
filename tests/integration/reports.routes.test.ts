import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import jwt from 'jsonwebtoken';
import { Types } from 'mongoose';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { app } from '../../src/app.js';
import { env } from '../../src/config/env.js';
import { reportsService } from '../../src/modules/reports/reports.service.js';
import { HTTP_STATUS } from '../../src/shared/constants/http-status.js';

describe('Reports API Routes (Integration)', () => {
  let server: Server;
  let baseUrl: string;
  let adminToken: string;
  let candidateToken: string;
  const adminId = new Types.ObjectId().toString();
  const candidateId = new Types.ObjectId().toString();
  const sampleReportId = new Types.ObjectId().toString();

  const mockReportDto = {
    id: sampleReportId,
    ticket_id: 'REP-2026-1042',
    target_type: 'job',
    target_id: new Types.ObjectId().toString(),
    target_title: 'Senior React Developer',
    target_link: '/career/senior-react-dev',
    reason_category: 'scam_fraud',
    title: 'Recruitment deposit requested',
    description: 'Employer asked for 2M security deposit before interview.',
    evidence_files: ['https://example.com/receipt.png'],
    is_anonymous: true,
    status: 'pending',
    timeline: [{ status: 'pending', timestamp: new Date().toISOString() }],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const mockAdminReportDto = {
    ...mockReportDto,
    reporter: {
      id: candidateId,
      email: 'candidate@test.com',
      full_name: 'Nguyen Van A',
      username: 'nguyenvana',
      created_at: new Date().toISOString(),
    },
    assigned_admin: null,
    reviewed_at: null,
    internal_notes: 'Under investigation',
  };

  beforeAll(async () => {
    adminToken = jwt.sign(
      { sub: adminId, email: 'admin@italent.com', role: 'admin' },
      env.JWT_ACCESS_SECRET,
      { expiresIn: '15m' },
    );

    candidateToken = jwt.sign(
      { sub: candidateId, email: 'candidate@test.com', role: 'user' },
      env.JWT_ACCESS_SECRET,
      { expiresIn: '15m' },
    );

    await new Promise<void>((resolve) => {
      server = app.listen(0, () => {
        const address = server.address() as AddressInfo;
        baseUrl = `http://127.0.0.1:${address.port}`;
        resolve();
      });
    });
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  });

  describe('UC-30: POST /api/v1/reports', () => {
    it('creates a report successfully when authenticated', async () => {
      vi.spyOn(reportsService, 'createReport').mockResolvedValue(mockReportDto);

      const res = await fetch(`${baseUrl}/api/v1/reports`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${candidateToken}`,
        },
        body: JSON.stringify({
          target_type: 'job',
          target_id: new Types.ObjectId().toString(),
          reason_category: 'scam_fraud',
          title: 'Recruitment deposit requested',
          description: 'Employer asked for 2M security deposit before interview.',
          evidence_files: ['https://example.com/receipt.png'],
          is_anonymous: true,
        }),
      });

      expect(res.status).toBe(HTTP_STATUS.HTTP_201_CREATED);
      const json = (await res.json()) as { success: boolean; data: { ticket_id: string } };
      expect(json.success).toBe(true);
      expect(json.data.ticket_id).toBe('REP-2026-1042');
    });

    it('rejects unauthenticated report creation', async () => {
      const res = await fetch(`${baseUrl}/api/v1/reports`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          target_type: 'job',
          target_id: new Types.ObjectId().toString(),
          reason_category: 'scam_fraud',
          title: 'Recruitment deposit requested',
          description: 'Employer asked for 2M security deposit before interview.',
        }),
      });

      expect(res.status).toBe(HTTP_STATUS.HTTP_401_UNAUTHORIZED);
    });
  });

  describe('UC-31: GET /api/v1/me/reports', () => {
    it('returns reporter history list with KPIs', async () => {
      vi.spyOn(reportsService, 'listReporterReports').mockResolvedValue({
        items: [mockReportDto],
        kpis: {
          total: 1,
          pending: 1,
          reviewing: 0,
          resolved: 0,
          rejected: 0,
          withdrawn: 0,
        },
        page: 1,
        limit: 10,
        total: 1,
        totalPages: 1,
      });

      const res = await fetch(`${baseUrl}/api/v1/me/reports?page=1&limit=10`, {
        headers: { Authorization: `Bearer ${candidateToken}` },
      });

      expect(res.status).toBe(HTTP_STATUS.HTTP_200_OK);
      const json = (await res.json()) as { success: boolean; items: unknown[]; kpis: { pending: number } };
      expect(json.success).toBe(true);
      expect(json.items.length).toBe(1);
      expect(json.kpis.pending).toBe(1);
    });
  });

  describe('UC-32: GET /api/v1/me/reports/:id', () => {
    it('returns report detail for owner', async () => {
      vi.spyOn(reportsService, 'getReporterReportDetail').mockResolvedValue(mockReportDto);

      const res = await fetch(`${baseUrl}/api/v1/me/reports/${sampleReportId}`, {
        headers: { Authorization: `Bearer ${candidateToken}` },
      });

      expect(res.status).toBe(HTTP_STATUS.HTTP_200_OK);
      const json = (await res.json()) as { success: boolean; data: { ticket_id: string } };
      expect(json.success).toBe(true);
      expect(json.data.ticket_id).toBe('REP-2026-1042');
    });
  });

  describe('UC-33: PATCH /api/v1/me/reports/:id/withdraw', () => {
    it('withdraws pending report successfully', async () => {
      vi.spyOn(reportsService, 'withdrawReport').mockResolvedValue({
        message: 'Report withdrawn successfully',
        report: { ...mockReportDto, status: 'withdrawn' },
      });

      const res = await fetch(`${baseUrl}/api/v1/me/reports/${sampleReportId}/withdraw`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${candidateToken}`,
        },
        body: JSON.stringify({ withdrawal_reason: 'Resolved privately' }),
      });

      expect(res.status).toBe(HTTP_STATUS.HTTP_200_OK);
      const json = (await res.json()) as { success: boolean; data: { status: string } };
      expect(json.success).toBe(true);
      expect(json.data.status).toBe('withdrawn');
    });
  });

  describe('UC-34: DELETE /api/v1/me/reports/:id', () => {
    it('deletes report from history view', async () => {
      vi.spyOn(reportsService, 'deleteReporterReport').mockResolvedValue({
        message: 'Report removed from your history',
        success: true,
      });

      const res = await fetch(`${baseUrl}/api/v1/me/reports/${sampleReportId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${candidateToken}` },
      });

      expect(res.status).toBe(HTTP_STATUS.HTTP_200_OK);
      const json = (await res.json()) as { success: boolean };
      expect(json.success).toBe(true);
    });
  });

  describe('UC-35: GET /api/v1/admin/reports', () => {
    it('allows admin access to violation queue', async () => {
      vi.spyOn(reportsService, 'listAdminReports').mockResolvedValue({
        items: [mockAdminReportDto],
        kpis: {
          total: 1,
          pending: 1,
          reviewing: 0,
          resolved: 0,
          rejected: 0,
          withdrawn: 0,
        },
        page: 1,
        limit: 10,
        total: 1,
        totalPages: 1,
      });

      const res = await fetch(`${baseUrl}/api/v1/admin/reports`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });

      expect(res.status).toBe(HTTP_STATUS.HTTP_200_OK);
      const json = (await res.json()) as { success: boolean; items: unknown[] };
      expect(json.success).toBe(true);
      expect(json.items.length).toBe(1);
    });

    it('forbids candidate access to admin violation queue (BR-ADM-REP-01)', async () => {
      const res = await fetch(`${baseUrl}/api/v1/admin/reports`, {
        headers: { Authorization: `Bearer ${candidateToken}` },
      });

      expect(res.status).toBe(HTTP_STATUS.HTTP_403_FORBIDDEN);
    });
  });

  describe('UC-36: Claim & Resolve in Admin', () => {
    it('claims a ticket', async () => {
      vi.spyOn(reportsService, 'claimTicket').mockResolvedValue({
        ...mockAdminReportDto,
        status: 'reviewing',
      });

      const res = await fetch(`${baseUrl}/api/v1/admin/reports/${sampleReportId}/claim`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${adminToken}` },
      });

      expect(res.status).toBe(HTTP_STATUS.HTTP_200_OK);
      const json = (await res.json()) as { success: boolean; data: { status: string } };
      expect(json.success).toBe(true);
      expect(json.data.status).toBe('reviewing');
    });

    it('finalizes resolution with atomic enforcement notes and feedback', async () => {
      vi.spyOn(reportsService, 'resolveTicket').mockResolvedValue({
        message: 'Report resolved and enforcement actions applied successfully',
        report: {
          ...mockAdminReportDto,
          status: 'resolved',
          resolution_decision: 'resolved',
          action_taken: 'content_takedown',
        },
      });

      const res = await fetch(`${baseUrl}/api/v1/admin/reports/${sampleReportId}/resolve`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({
          decision: 'resolved',
          action_taken: 'content_takedown',
          internal_notes: 'Verified policy violation from receipts.',
          message_to_reporter: 'Listing removed. Thank you.',
        }),
      });

      expect(res.status).toBe(HTTP_STATUS.HTTP_200_OK);
      const json = (await res.json()) as { success: boolean; data: { status: string } };
      expect(json.success).toBe(true);
      expect(json.data.status).toBe('resolved');
    });
  });
});
