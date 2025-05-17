// Learn more https://docs.expo.io/guides/customizing-metro
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

// Watch both src and node_modules
config.watchFolders = [
  path.resolve(__dirname, 'src'),
  path.resolve(__dirname, 'node_modules')
];

// Add additional exclusions to reduce Metro's file watching
config.resolver.blockList = [
  /node_modules\/.*\/node_modules/,
  /.git\/.*/,
  /android\/.*/,
  /ios\/.*/,
];

// Make sure node_modules path is properly set
config.resolver.nodeModulesPaths = [
  path.resolve(__dirname, 'node_modules'),
];

module.exports = config; 