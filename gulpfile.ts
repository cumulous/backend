const argv = require('yargs').argv;
const gulp = require('gulp');
const jasmineTest = require('gulp-jasmine');
const reporters = require('jasmine-reporters');

const paths = {
	src: ['src/*.ts'],
	specs: ['src/*.spec.ts'],
};

gulp.task('watch', () => {
  gulp.watch(paths.src, ['test']);
});

gulp.task('test', () => {
  return gulp
    .src(paths.specs)
    .pipe(jasmineTest({
      reporter: new reporters.TerminalReporter({
        verbosity: argv.verbose ? 3 : 2,
        color: true,
      }),
    }));
});

gulp.task('default', ['watch', 'test']);