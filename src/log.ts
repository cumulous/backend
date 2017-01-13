export import log = require('winston');

log.configure({
  transports: [
    new log.transports.Console({
      timestamp: true,
      level: process.env['LOG_LEVEL'],
    }),
  ],
});