const MAX_STRING_LENGTH = 500;
const MAX_SHORT_STRING = 100;

function validateString(val, maxLen = MAX_STRING_LENGTH) {
    return typeof val === 'string' && val.trim().length > 0 && val.length <= maxLen;
}

function validateEmail(val) {
    if (!val) return true; // optional field
    return typeof val === 'string' && val.length <= MAX_SHORT_STRING && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val);
}

function validatePhone(val) {
    if (!val) return true; // optional field
    return typeof val === 'string' && val.length <= 30 && /^[\d\s\-+().]+$/.test(val);
}

function validatePositiveNumber(val) {
    const n = parseFloat(val);
    return !isNaN(n) && n >= 0;
}

module.exports = {
    MAX_STRING_LENGTH,
    MAX_SHORT_STRING,
    validateString,
    validateEmail,
    validatePhone,
    validatePositiveNumber,
};
