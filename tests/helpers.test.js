// Mock pool for helpers factory
const mockPool = {
    query: jest.fn().mockResolvedValue([{ affectedRows: 1 }]),
};

describe('Helpers', () => {
    let helpers;

    beforeEach(() => {
        mockPool.query.mockClear();
        helpers = require('../src/lib/helpers')({ pool: mockPool });
    });

    describe('hashOTP', () => {
        it('returns consistent hash for same input', () => {
            const hash1 = helpers.hashOTP('123456');
            const hash2 = helpers.hashOTP('123456');
            expect(hash1).toBe(hash2);
        });

        it('returns different hash for different input', () => {
            const hash1 = helpers.hashOTP('123456');
            const hash2 = helpers.hashOTP('654321');
            expect(hash1).not.toBe(hash2);
        });

        it('returns a SHA-256 hex string (64 chars)', () => {
            const hash = helpers.hashOTP('test');
            expect(hash).toHaveLength(64);
            expect(/^[a-f0-9]+$/.test(hash)).toBe(true);
        });
    });

    describe('verifyOTP', () => {
        it('returns true for matching code', () => {
            const hash = helpers.hashOTP('123456');
            expect(helpers.verifyOTP(hash, '123456')).toBe(true);
        });

        it('returns false for wrong code', () => {
            const hash = helpers.hashOTP('123456');
            expect(helpers.verifyOTP(hash, '654321')).toBe(false);
        });
    });

    describe('generateOTP', () => {
        it('returns a 6-digit string', () => {
            const otp = helpers.generateOTP();
            expect(otp).toHaveLength(6);
            expect(/^\d{6}$/.test(otp)).toBe(true);
        });

        it('generates different codes on multiple calls', () => {
            const otps = new Set();
            for (let i = 0; i < 20; i++) otps.add(helpers.generateOTP());
            expect(otps.size).toBeGreaterThan(1);
        });
    });

    describe('generateLinkCode', () => {
        it('returns a 6-char uppercase string', () => {
            const code = helpers.generateLinkCode();
            expect(code).toHaveLength(6);
            expect(code).toBe(code.toUpperCase());
        });
    });

    describe('generateSecureCode', () => {
        it('returns code of specified length', () => {
            expect(helpers.generateSecureCode(8)).toHaveLength(8);
            expect(helpers.generateSecureCode(12)).toHaveLength(12);
        });
    });

    describe('paginate', () => {
        const items = Array.from({ length: 25 }, (_, i) => ({ id: i + 1 }));

        it('returns correct page data', () => {
            const result = helpers.paginate(items, 1, 10);
            expect(result.data).toHaveLength(10);
            expect(result.page).toBe(1);
            expect(result.total).toBe(25);
            expect(result.totalPages).toBe(3);
        });

        it('returns last page correctly', () => {
            const result = helpers.paginate(items, 3, 10);
            expect(result.data).toHaveLength(5);
            expect(result.page).toBe(3);
        });

        it('clamps page to minimum 1', () => {
            const result = helpers.paginate(items, -5, 10);
            expect(result.page).toBe(1);
        });

        it('clamps limit to max 100', () => {
            const result = helpers.paginate(items, 1, 999);
            expect(result.limit).toBe(100);
        });

        it('handles empty arrays', () => {
            const result = helpers.paginate([], 1, 10);
            expect(result.data).toHaveLength(0);
            expect(result.total).toBe(0);
            expect(result.totalPages).toBe(0);
        });
    });

    describe('auditLog', () => {
        it('fires INSERT query asynchronously', () => {
            helpers.auditLog('admin-1', 'create', 'tenant', { unit: '101' });
            expect(mockPool.query).toHaveBeenCalledTimes(1);
            const [sql, params] = mockPool.query.mock.calls[0];
            expect(sql).toContain('INSERT INTO audit_log');
            expect(params[1]).toBe('admin-1');
            expect(params[2]).toBe('create');
            expect(params[3]).toBe('tenant');
        });
    });
});
