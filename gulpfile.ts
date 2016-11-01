const gulp = require('gulp');
const jasmineTest = require('gulp-jasmine');

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
    .pipe(jasmineTest());
});

gulp.task('default', ['watch', 'test']);