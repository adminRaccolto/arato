const { getDefaultConfig } = require('expo/metro-config');

// Fixa a raiz no campo-app/ para evitar que o Metro percorra
// os diretórios pais (agrofield/ → /Users/ginomigotto/) em busca de package.json.
const config = getDefaultConfig(__dirname);

config.projectRoot = __dirname;
config.watchFolders = [__dirname];

// Habilita resolução web (react-native-web)
config.resolver.platforms = ['ios', 'android', 'native', 'web'];

module.exports = config;
