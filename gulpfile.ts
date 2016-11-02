const argv = require('yargs').argv;
const gulp = require('gulp');
const istanbul = require('gulp-istanbul');
const jasmineTest = require('gulp-jasmine');
const remapIstanbul = require('remap-istanbul/lib/gulpRemapIstanbul');
const reporters = require('jasmine-reporters');
const sourcemaps = require('gulp-sourcemaps');
const ts = require('gulp-typescript');

const tsProject = ts.createProject('tsconfig.json');

const paths = {
	src: ['src/!(*.spec).ts'],
	specs: ['src/*.spec.ts'],
	reports: 'reports',
	coverage: () => paths.reports + '/coverage',
};

gulp.task('watch', () => {
  gulp.watch(paths.src, ['test']);
  gulp.watch(paths.specs, ['test']);
});

const remapCoverageFiles = () => {
  const reports: { [key: string]: string } = {
    'html': paths.coverage(),
  };
  if (argv.verbose) {
    reports['text-summary'] = null;
  }
  return gulp
    .src(paths.coverage() + '/coverage-final.json')
    .pipe(remapIstanbul({
      reports: reports,
    }));
};

gulp.task('coverage', () => {
    return tsProject.src()
      .pipe(sourcemaps.init())
      .pipe(tsProject()).js
      .pipe(sourcemaps.write())
      .pipe(gulp.dest(paths.coverage()))
      .pipe(istanbul({
        includeUntested: true,
      }))
      .pipe(istanbul.hookRequire());
});

gulp.task('test', ['coverage'], () => {
  return gulp
    .src(paths.specs)
    .pipe(jasmineTest({
      reporter: new reporters.TerminalReporter({
        verbosity: argv.verbose ? 3 : 2,
        color: true,
      }),
    }))
    .pipe(istanbul.writeReports({
      dir: paths.coverage(),
      reporters: ['json'],
    })).on('end', remapCoverageFiles);
});

gulp.task('default', ['watch', 'test']);