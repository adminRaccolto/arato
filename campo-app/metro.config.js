const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

// Fixa a raiz do projeto neste diretório para evitar que o Metro
// percorra os diretórios pais (agrofield → agrofield/..) em busca de package.json.
const config = getDefaultConfig(__dirname);

config.projectRoot = __dirname;
config.watchFolders = [__dirname];

module.exports = config;
