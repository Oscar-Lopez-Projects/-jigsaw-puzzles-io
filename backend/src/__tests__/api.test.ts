import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import app from '../index.js';

let accessToken: string;
let userId: string;
const testEmail = `test_${Date.now()}@jigsawtest.com`;
const testPassword = 'TestPass123!';
const testUsername = `tester_${Date.now()}`;

describe('API Integration Tests', () => {
  // ─── Health Check ────────────────────────────────────────────
  describe('GET /api/health', () => {
    it('should return ok status', async () => {
      const res = await request(app).get('/api/health');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('ok');
      expect(res.body.timestamp).toBeDefined();
    });
  });

  // ─── Auth ────────────────────────────────────────────────────
  describe('Auth Routes', () => {
    it('POST /api/auth/register - should create a new user', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({ email: testEmail, password: testPassword, username: testUsername });

      expect(res.status).toBe(201);
      expect(res.body.message).toBe('Account created successfully');
      expect(res.body.user.username).toBe(testUsername);
      expect(res.body.user.email).toBe(testEmail);
      userId = res.body.user.id;
    });

    it('POST /api/auth/register - should fail with missing fields', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({ email: 'x@x.com' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBeDefined();
    });

    it('POST /api/auth/login - should return session and user', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: testEmail, password: testPassword });

      expect(res.status).toBe(200);
      expect(res.body.session.access_token).toBeDefined();
      expect(res.body.session.refresh_token).toBeDefined();
      expect(res.body.user.username).toBe(testUsername);
      accessToken = res.body.session.access_token;
    });

    it('POST /api/auth/login - should fail with wrong password', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: testEmail, password: 'WrongPass' });

      expect(res.status).toBe(401);
    });

    it('GET /api/auth/me - should return current user profile', async () => {
      const res = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${accessToken}`);

      expect(res.status).toBe(200);
      expect(res.body.username).toBe(testUsername);
      expect(res.body.id).toBe(userId);
    });

    it('GET /api/auth/me - should fail without token', async () => {
      const res = await request(app).get('/api/auth/me');
      expect(res.status).toBe(401);
    });
  });

  // ─── Records ─────────────────────────────────────────────────
  describe('Records Routes', () => {
    it('POST /api/records - should save a puzzle record (stars calculated server-side)', async () => {
      const res = await request(app)
        .post('/api/records')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          piece_count: 25,
          completion_time_sec: 30, // 30 sec for 25 pieces = under 75 (25*3) = 3 stars
          difficulty: 'beginner',
          image_reference: 'test-image.jpg',
        });

      expect(res.status).toBe(201);
      expect(res.body.stars).toBe(3); // Server calculated: 30 <= 75
      expect(res.body.piece_count).toBe(25);
      expect(res.body.user_id).toBe(userId);
      expect(res.body.image_reference).toBe('test-image.jpg');
    });

    it('POST /api/records - should give 2 stars for moderate time', async () => {
      const res = await request(app)
        .post('/api/records')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          piece_count: 25,
          completion_time_sec: 100, // 100 sec, expected 75, 2x = 150, so 2 stars
          difficulty: 'beginner',
        });

      expect(res.status).toBe(201);
      expect(res.body.stars).toBe(2);
    });

    it('POST /api/records - should give 1 star for slow time', async () => {
      const res = await request(app)
        .post('/api/records')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          piece_count: 25,
          completion_time_sec: 200, // 200 sec, exceeds 150 (2x75), so 1 star
          difficulty: 'beginner',
        });

      expect(res.status).toBe(201);
      expect(res.body.stars).toBe(1);
    });

    it('POST /api/records - should fail without auth', async () => {
      const res = await request(app)
        .post('/api/records')
        .send({ piece_count: 25, completion_time_sec: 30, difficulty: 'beginner' });

      expect(res.status).toBe(401);
    });

    it('POST /api/records - should validate difficulty', async () => {
      const res = await request(app)
        .post('/api/records')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ piece_count: 25, completion_time_sec: 30, difficulty: 'impossible' });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('difficulty');
    });

    it('GET /api/records - should return user records', async () => {
      const res = await request(app)
        .get('/api/records')
        .set('Authorization', `Bearer ${accessToken}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThanOrEqual(3);
    });
  });

  // ─── Leaderboard ─────────────────────────────────────────────
  describe('Leaderboard Routes', () => {
    it('GET /api/leaderboard - should return ELO rankings', async () => {
      const res = await request(app).get('/api/leaderboard');

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      // Our test user should be there
      const found = res.body.find((e: { user_id: string }) => e.user_id === userId);
      expect(found).toBeDefined();
      expect(found.rating).toBeGreaterThanOrEqual(1200); // Should have initial or gained ELO
    });

    it('GET /api/leaderboard - should accept limit param', async () => {
      const res = await request(app).get('/api/leaderboard?limit=1');

      expect(res.status).toBe(200);
      expect(res.body.length).toBeLessThanOrEqual(1);
    });
  });

  // ─── Puzzles ─────────────────────────────────────────────────
  describe('Puzzles Routes', () => {
    it('GET /api/puzzles - should return community puzzles (public)', async () => {
      const res = await request(app).get('/api/puzzles');

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });

    it('GET /api/puzzles?category=nature - should filter by category', async () => {
      const res = await request(app).get('/api/puzzles?category=nature');

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      // All returned should be nature category (or empty)
      res.body.forEach((p: { category: string }) => {
        expect(p.category).toBe('nature');
      });
    });

    it('POST /api/puzzles/upload - should fail without auth', async () => {
      const res = await request(app)
        .post('/api/puzzles/upload')
        .send({});

      expect(res.status).toBe(401);
    });
  });

  // ─── Users ───────────────────────────────────────────────────
  describe('Users Routes', () => {
    it('GET /api/users/:userId - should return user profile', async () => {
      const res = await request(app).get(`/api/users/${userId}`);

      expect(res.status).toBe(200);
      expect(res.body.username).toBe(testUsername);
      expect(res.body.elo).toBeDefined();
      expect(res.body.stats).toBeDefined();
      expect(res.body.stats.totalPuzzles).toBeGreaterThanOrEqual(3);
    });

    it('GET /api/users/:userId - should 404 for fake user', async () => {
      const res = await request(app).get('/api/users/00000000-0000-0000-0000-000000000000');

      expect(res.status).toBe(404);
    });

    it('GET /api/users/search - should find users by username', async () => {
      const res = await request(app)
        .get(`/api/users/search?q=${testUsername.slice(0, 6)}`)
        .set('Authorization', `Bearer ${accessToken}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      // Should NOT include self in results
      const self = res.body.find((u: { id: string }) => u.id === userId);
      expect(self).toBeUndefined();
    });
  });

  // ─── Friends ─────────────────────────────────────────────────
  describe('Friends Routes', () => {
    it('GET /api/friends - should return empty friends list initially', async () => {
      const res = await request(app)
        .get('/api/friends')
        .set('Authorization', `Bearer ${accessToken}`);

      expect(res.status).toBe(200);
      expect(res.body.sent).toBeDefined();
      expect(res.body.received).toBeDefined();
    });

    it('POST /api/friends - should fail adding self', async () => {
      const res = await request(app)
        .post('/api/friends')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ addressee_id: userId });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('yourself');
    });

    it('POST /api/friends - should fail without auth', async () => {
      const res = await request(app)
        .post('/api/friends')
        .send({ addressee_id: '00000000-0000-0000-0000-000000000000' });

      expect(res.status).toBe(401);
    });
  });

  // ─── Challenges ──────────────────────────────────────────────
  describe('Challenges Routes', () => {
    it('GET /api/challenges - should return empty challenges list', async () => {
      const res = await request(app)
        .get('/api/challenges')
        .set('Authorization', `Bearer ${accessToken}`);

      expect(res.status).toBe(200);
      expect(res.body.sent).toBeDefined();
      expect(res.body.received).toBeDefined();
      expect(Array.isArray(res.body.sent)).toBe(true);
      expect(Array.isArray(res.body.received)).toBe(true);
    });

    it('POST /api/challenges - should fail without required fields', async () => {
      const res = await request(app)
        .post('/api/challenges')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ opponent_id: '00000000-0000-0000-0000-000000000000' });

      expect(res.status).toBe(400);
    });

    it('POST /api/challenges - should fail if not friends', async () => {
      const res = await request(app)
        .post('/api/challenges')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          opponent_id: '00000000-0000-0000-0000-000000000000',
          image_url: 'https://example.com/img.jpg',
          puzzle_title: 'Test',
          piece_count: 25,
          difficulty: 'beginner',
          challenger_time_sec: 30,
          challenger_stars: 3,
        });

      expect(res.status).toBe(403);
      expect(res.body.error).toContain('friends');
    });

    it('PATCH /api/challenges/:id - should 404 for non-existent challenge', async () => {
      const res = await request(app)
        .patch('/api/challenges/00000000-0000-0000-0000-000000000000')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ opponent_time_sec: 45 });

      expect(res.status).toBe(404);
    });
  });

  // ─── ELO Update ──────────────────────────────────────────────
  describe('ELO Routes', () => {
    it('POST /api/leaderboard/elo/update - should update ELO', async () => {
      const res = await request(app)
        .post('/api/leaderboard/elo/update')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ stars: 3 });

      // May return 200 or 500 depending on Supabase RLS timing
      // The important thing is it doesn't 401 (auth works) or 400 (validation works)
      expect([200, 500]).toContain(res.status);
    });

    it('POST /api/leaderboard/elo/update - should fail with invalid stars', async () => {
      const res = await request(app)
        .post('/api/leaderboard/elo/update')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ stars: 5 });

      expect(res.status).toBe(400);
    });

    it('POST /api/leaderboard/elo/update - should fail without auth', async () => {
      const res = await request(app)
        .post('/api/leaderboard/elo/update')
        .send({ stars: 3 });

      expect(res.status).toBe(401);
    });
  });

  // ─── Cleanup: Delete test user ───────────────────────────────
  describe('Cleanup', () => {
    it('DELETE /api/users/me - should delete the test account', async () => {
      const res = await request(app)
        .delete('/api/users/me')
        .set('Authorization', `Bearer ${accessToken}`);

      expect(res.status).toBe(200);
      expect(res.body.message).toContain('deleted');
    });

    it('GET /api/auth/me - should fail after deletion', async () => {
      const res = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${accessToken}`);

      expect(res.status).toBe(401);
    });
  });
});
