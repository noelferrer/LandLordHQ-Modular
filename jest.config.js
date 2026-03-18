module.exports = {
    testEnvironment: 'node',
    testMatch: ['**/tests/**/*.test.js'],
    verbose: true,
    forceExit: true,
    detectOpenHandles: true,
    testTimeout: 10000,
    transformIgnorePatterns: [
        '/node_modules/(?!(uuid|date-fns)/)',
    ],
    transform: {
        '^.+\\.js$': ['babel-jest', {
            presets: [
                ['@babel/preset-env', { targets: { node: 'current' } }],
            ],
        }],
    },
};
