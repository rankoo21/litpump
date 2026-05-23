// Stub used by Turbopack `resolveAlias` to silently no-op the optional deps
// (pino-pretty / lokijs / encoding / @react-native-async-storage/async-storage)
// that wagmi + WalletConnect + MetaMask SDK reference but never invoke in a
// browser context.
module.exports = {};
