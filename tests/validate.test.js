const {
    validateString,
    validateEmail,
    validatePhone,
    validatePositiveNumber,
    MAX_STRING_LENGTH,
    MAX_SHORT_STRING,
} = require('../src/middleware/validate');

describe('Validation Middleware', () => {
    describe('validateString', () => {
        it('accepts valid strings', () => {
            expect(validateString('hello')).toBe(true);
            expect(validateString('a')).toBe(true);
        });

        it('rejects empty strings', () => {
            expect(validateString('')).toBe(false);
            expect(validateString('   ')).toBe(false);
        });

        it('rejects non-strings', () => {
            expect(validateString(123)).toBe(false);
            expect(validateString(null)).toBe(false);
            expect(validateString(undefined)).toBe(false);
        });

        it('rejects strings exceeding max length', () => {
            expect(validateString('a'.repeat(501))).toBe(false);
            expect(validateString('a'.repeat(500))).toBe(true);
        });

        it('uses custom max length', () => {
            expect(validateString('hello', 3)).toBe(false);
            expect(validateString('hi', 3)).toBe(true);
        });
    });

    describe('validateEmail', () => {
        it('accepts valid emails', () => {
            expect(validateEmail('test@example.com')).toBe(true);
            expect(validateEmail('user.name@domain.co')).toBe(true);
        });

        it('rejects invalid emails', () => {
            expect(validateEmail('notanemail')).toBe(false);
            expect(validateEmail('@no-user.com')).toBe(false);
            expect(validateEmail('user@')).toBe(false);
        });

        it('allows empty/null (optional field)', () => {
            expect(validateEmail('')).toBe(true);
            expect(validateEmail(null)).toBe(true);
            expect(validateEmail(undefined)).toBe(true);
        });

        it('rejects overly long emails', () => {
            expect(validateEmail('a'.repeat(90) + '@example.com')).toBe(false);
        });
    });

    describe('validatePhone', () => {
        it('accepts valid phone numbers', () => {
            expect(validatePhone('+1 (555) 123-4567')).toBe(true);
            expect(validatePhone('09171234567')).toBe(true);
        });

        it('rejects invalid phone numbers', () => {
            expect(validatePhone('not-a-phone!')).toBe(false);
            expect(validatePhone('abc123')).toBe(false);
        });

        it('allows empty/null (optional field)', () => {
            expect(validatePhone('')).toBe(true);
            expect(validatePhone(null)).toBe(true);
        });

        it('rejects overly long phone numbers', () => {
            expect(validatePhone('1'.repeat(31))).toBe(false);
        });
    });

    describe('validatePositiveNumber', () => {
        it('accepts positive numbers', () => {
            expect(validatePositiveNumber(100)).toBe(true);
            expect(validatePositiveNumber('50.5')).toBe(true);
            expect(validatePositiveNumber(0)).toBe(true);
        });

        it('rejects negative numbers', () => {
            expect(validatePositiveNumber(-1)).toBe(false);
        });

        it('rejects non-numbers', () => {
            expect(validatePositiveNumber('abc')).toBe(false);
            expect(validatePositiveNumber(NaN)).toBe(false);
        });
    });

    describe('Constants', () => {
        it('has correct max lengths', () => {
            expect(MAX_STRING_LENGTH).toBe(500);
            expect(MAX_SHORT_STRING).toBe(100);
        });
    });
});
