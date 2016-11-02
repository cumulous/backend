module.exports = {
  port: 8080,
  files: [
    'reports/**/*.html',
  ],
  snippetOptions: {
    rule: {
      match: /(<!DOCTYPE html>|^)/i,
      fn: function (snippet, match) {
          return match + '\n' + snippet;
      },
    },
  },
};