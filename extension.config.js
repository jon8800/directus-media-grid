const yaml = require("@rollup/plugin-yaml");
const svg = require("rollup-plugin-svg-import");

module.exports = {
  plugins: [yaml(), svg({ stringify: true })],
};
