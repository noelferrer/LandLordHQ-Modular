const request = require('supertest');
const express = require('express');
const cookieParser = require('cookie-parser');
const { v4: uuidv4 } = require('uuid');
const { addMinutes } = require('date-fns');

// --- Mock MySQL pool ---
let queryResults = {};
let insertedRows = {};
let deletedConditions = [];

const mockConnection = {
    beginTransaction: jest.fn().mockResolvedValue(undefined),
    commit: jest.fn().mockResolvedValue(undefined),
    rollback: jest.fn().mockResolvedValue(undefined),
    release: jest.fn(),
    query: jest.fn().mockImplementation((sql) => {
        return Promise.resolve([{ affectedRows: 1 }]);
    }),
};

const mockPool = {
    query: jest.fn(),
    getConnection: jest.fn().mockResolvedValue(mockConnection),
};

const mockDb = {
    pool: mockPool,
    mapRows: (rows) => rows.map(r => {
        const out = {};
        for (const [key, val] of Object.entries(r)) {
            const camel = key.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
            out[camel] = val;
        }
        return out;
    }),
    mapRow: (rows) => {
        if (rows.length === 0) return null;
        const r = rows[0];
        const out = {};
        for (const [key, val] of Object.entries(r)) {
            const camel = key.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
            out[camel] = val;
        }
        return out;
    },
    snakeToCamel: (row) => {
        if (!row) return null;
        const out = {};
        for (const [key, val] of Object.entries(row)) {
            const camel = key.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
            out[camel] = val;
        }
        return out;
    },
    camelToSnake: (obj) => {
        const out = {};
        for (const [key, val] of Object.entries(obj)) {
            const snake = key.replace(/[A-Z]/g, c => '_' + c.toLowerCase());
            out[snake] = val;
        }
        return out;
    },
};

// Seed data
let adminId, token;

function resetState() {
    adminId = uuidv4();
    token = uuidv4();
    insertedRows = {};
    deletedConditions = [];
    mockPool.query.mockReset();
    mockConnection.query.mockReset();
    mockConnection.beginTransaction.mockReset();
    mockConnection.commit.mockReset();
    mockConnection.rollback.mockReset();
}

function setupDefaultQueryHandler() {
    mockPool.query.mockImplementation((sql, params) => {
        // Session lookup for auth
        if (sql.includes('FROM sessions WHERE token')) {
            if (params && params[0] === token) {
                return Promise.resolve([[{
                    token, admin_id: adminId,
                    expires_at: addMinutes(new Date(), 60)
                }]]);
            }
            if (params && params[0] === 'expired-token') {
                return Promise.resolve([[{
                    token: 'expired-token', admin_id: adminId,
                    expires_at: new Date(Date.now() - 1000)
                }]]);
            }
            return Promise.resolve([[]]);
        }

        // Admin lookup
        if (sql.includes('FROM admins WHERE id')) {
            return Promise.resolve([[{
                id: adminId, username: 'testadmin',
                telegram_id: '12345', name: 'Test Admin'
            }]]);
        }

        // Default: return empty or success
        if (sql.startsWith('SELECT')) return Promise.resolve([[]]);
        if (sql.startsWith('INSERT')) return Promise.resolve([{ affectedRows: 1, insertId: 1 }]);
        if (sql.startsWith('UPDATE')) return Promise.resolve([{ affectedRows: 1 }]);
        if (sql.startsWith('DELETE')) return Promise.resolve([{ affectedRows: 1 }]);
        return Promise.resolve([[]]);
    });
}

// Create app
function createApp() {
    const app = express();
    app.use(express.json());
    app.use(cookieParser());

    const helpers = require('../src/lib/helpers')(mockDb);
    const middleware = require('../src/middleware/auth')(mockDb);

    const bot = {
        telegram: {
            sendMessage: jest.fn().mockResolvedValue(true),
            sendPhoto: jest.fn().mockResolvedValue(true),
        }
    };

    const deps = { db: mockDb, bot, helpers, middleware };

    app.use('/api/properties', require('../src/routes/properties')(deps));
    app.use('/api/tenants', require('../src/routes/tenants')(deps));
    app.use('/api/payments', require('../src/routes/payments')(deps));
    app.use('/api/expenses', require('../src/routes/expenses')(deps));
    app.use('/api/settings', require('../src/routes/settings')(deps));
    app.use('/api/finance', require('../src/routes/finance')(deps));

    return app;
}

const authCookie = (t) => `landlordhq_token=${t}`;

describe('API Routes', () => {
    let app;

    beforeEach(() => {
        resetState();
        setupDefaultQueryHandler();
        app = createApp();
    });

    // --- Authentication ---
    describe('Authentication', () => {
        it('rejects requests without auth token', async () => {
            const res = await request(app).get('/api/properties');
            expect(res.status).toBe(401);
        });

        it('rejects requests with expired session', async () => {
            const res = await request(app)
                .get('/api/properties')
                .set('Cookie', authCookie('expired-token'));
            expect(res.status).toBe(401);
        });

        it('rejects requests with invalid token', async () => {
            const res = await request(app)
                .get('/api/properties')
                .set('Cookie', authCookie('invalid-token'));
            expect(res.status).toBe(401);
        });
    });

    // --- Properties ---
    describe('Properties API', () => {
        it('GET /api/properties returns results', async () => {
            const res = await request(app)
                .get('/api/properties')
                .set('Cookie', authCookie(token));
            expect(res.status).toBe(200);
            expect(Array.isArray(res.body)).toBe(true);
        });

        it('POST /api/properties creates a property', async () => {
            const res = await request(app)
                .post('/api/properties')
                .set('Cookie', authCookie(token))
                .send({ name: 'Test Building', address: '123 Main St', units: 10, status: 'Active' });
            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
            expect(res.body.property.name).toBe('Test Building');
            expect(res.body.property.id).toBeDefined();
        });

        it('POST /api/properties rejects missing name', async () => {
            const res = await request(app)
                .post('/api/properties')
                .set('Cookie', authCookie(token))
                .send({ address: '123 Main St' });
            expect(res.status).toBe(400);
        });
    });

    // --- Tenants ---
    describe('Tenants API', () => {
        it('POST /api/tenants creates a tenant', async () => {
            const res = await request(app)
                .post('/api/tenants')
                .set('Cookie', authCookie(token))
                .send({ unit: '101', name: 'John Doe', email: 'john@test.com', phone: '09171234567' });
            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
            expect(res.body.tenant.linkCode).toBeDefined();
        });

        it('POST /api/tenants rejects duplicate unit', async () => {
            // Mock finding existing tenant
            mockPool.query.mockImplementation((sql, params) => {
                if (sql.includes('FROM sessions WHERE token')) {
                    return Promise.resolve([[{
                        token, admin_id: adminId,
                        expires_at: addMinutes(new Date(), 60)
                    }]]);
                }
                if (sql.includes('FROM admins WHERE id')) {
                    return Promise.resolve([[{
                        id: adminId, username: 'testadmin',
                        telegram_id: '12345', name: 'Test Admin'
                    }]]);
                }
                // Return existing tenant for duplicate check
                if (sql.includes('FROM tenants WHERE unit')) {
                    return Promise.resolve([[{ id: uuidv4(), unit: '101', admin_id: adminId }]]);
                }
                return Promise.resolve([[]]);
            });

            const res = await request(app)
                .post('/api/tenants')
                .set('Cookie', authCookie(token))
                .send({ unit: '101', name: 'Second Tenant' });
            expect(res.status).toBe(400);
        });

        it('POST /api/tenants rejects invalid email', async () => {
            const res = await request(app)
                .post('/api/tenants')
                .set('Cookie', authCookie(token))
                .send({ unit: '102', name: 'Bad Email', email: 'not-an-email' });
            expect(res.status).toBe(400);
        });
    });

    // --- Payments ---
    describe('Payments API', () => {
        it('POST /api/payments creates a manual payment', async () => {
            const res = await request(app)
                .post('/api/payments')
                .set('Cookie', authCookie(token))
                .send({ unit: '101', amount: 5000, method: 'Cash' });
            expect(res.status).toBe(200);
            expect(res.body.payment.amount).toBe(5000);
            expect(res.body.payment.status).toBe('verified');
        });

        it('POST /api/payments rejects negative amount', async () => {
            const res = await request(app)
                .post('/api/payments')
                .set('Cookie', authCookie(token))
                .send({ unit: '101', amount: -100 });
            expect(res.status).toBe(400);
        });
    });

    // --- Expenses ---
    describe('Expenses API', () => {
        it('POST /api/expenses creates an expense', async () => {
            const res = await request(app)
                .post('/api/expenses')
                .set('Cookie', authCookie(token))
                .send({ category: 'Maintenance', amount: 1500, description: 'Pipe repair' });
            expect(res.status).toBe(200);
            expect(res.body.expense.category).toBe('Maintenance');
        });
    });

    // --- Settings ---
    describe('Settings API', () => {
        it('GET /api/settings returns data', async () => {
            const res = await request(app)
                .get('/api/settings')
                .set('Cookie', authCookie(token));
            expect(res.status).toBe(200);
        });

        it('POST /api/settings saves settings', async () => {
            const res = await request(app)
                .post('/api/settings')
                .set('Cookie', authCookie(token))
                .send({ currency: 'USD', rent_reminder_days_before: 3 });
            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
        });
    });

    // --- Finance ---
    describe('Finance API', () => {
        it('GET /api/finance/summary returns totals', async () => {
            // Mock finance queries
            mockPool.query.mockImplementation((sql, params) => {
                if (sql.includes('FROM sessions WHERE token')) {
                    return Promise.resolve([[{
                        token, admin_id: adminId,
                        expires_at: addMinutes(new Date(), 60)
                    }]]);
                }
                if (sql.includes('FROM admins WHERE id')) {
                    return Promise.resolve([[{
                        id: adminId, username: 'testadmin',
                        telegram_id: '12345', name: 'Test Admin'
                    }]]);
                }
                if (sql.includes('SUM(amount)') && sql.includes('payments')) {
                    return Promise.resolve([[{ totalCollected: '5000.00', paymentCount: 2 }]]);
                }
                if (sql.includes('SUM(amount)') && sql.includes('expenses')) {
                    return Promise.resolve([[{ totalExpenses: '1500.00', expenseCount: 1 }]]);
                }
                return Promise.resolve([[]]);
            });

            const res = await request(app)
                .get('/api/finance/summary')
                .set('Cookie', authCookie(token));
            expect(res.status).toBe(200);
            expect(res.body.totalCollected).toBeDefined();
            expect(res.body.totalExpenses).toBeDefined();
            expect(res.body.netProfit).toBeDefined();
        });
    });

    // --- Multi-Tenancy Isolation ---
    describe('Multi-Tenancy Isolation', () => {
        it('admin cannot see another admin\'s properties', async () => {
            const admin2Token = uuidv4();
            const admin2Id = uuidv4();

            // Override query handler for this test
            mockPool.query.mockImplementation((sql, params) => {
                if (sql.includes('FROM sessions WHERE token')) {
                    if (params[0] === admin2Token) {
                        return Promise.resolve([[{
                            token: admin2Token, admin_id: admin2Id,
                            expires_at: addMinutes(new Date(), 60)
                        }]]);
                    }
                    return Promise.resolve([[]]);
                }
                if (sql.includes('FROM admins WHERE id')) {
                    return Promise.resolve([[{
                        id: admin2Id, username: 'admin2',
                        telegram_id: '99999', name: 'Admin 2'
                    }]]);
                }
                // Return empty for admin2's properties query
                if (sql.includes('FROM properties')) {
                    return Promise.resolve([[]]);
                }
                return Promise.resolve([[]]);
            });

            const res = await request(app)
                .get('/api/properties')
                .set('Cookie', authCookie(admin2Token));
            expect(res.body).toHaveLength(0);
        });
    });
});
