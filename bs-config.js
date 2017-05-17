module.exports = {
  port: process.env['REPORTS_PORT'] || 8080,
  files: [
    'reports/**/*.html',
  ],
  server: {
    baseDir: "reports/coverage",
  },
  snippetOptions: {
    rule: {
      match: /(<!DOCTYPE html>|^)/i,
      fn: function (snippet, match) {
          return match + '\n' + snippet;
      },
    },
  },
};