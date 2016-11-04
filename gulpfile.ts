const gulp = require('gulp');
const istanbul = require('gulp-istanbul');
const jasmineTest = require('gulp-jasmine');
const remapIstanbul = require('remap-istanbul/lib/gulpRemapIstanbul');
const reporters = require('jasmine-reporters');
const sourcemaps = require('gulp-sourcemaps');
const ts = require('gulp-typescript');

const tsProject = ts.createProject('tsconfig.json');

const paths = {
  bin: 'bin',
  src: 'src/!(*.spec).ts',
  specs: 'src/*.spec.ts',
  reports: 'reports',
  coverage: () => paths.reports + '/coverage',
};

let watching = false;
let failed = false;

gulp.task('watch', () => {
  watching = true;
  gulp.watch(paths.src, ['test']);
  gulp.watch(paths.specs, ['test']);
});

const handleError = function(error: Error) {
  error.stack && console.error(error.stack);
  failed = true;
  watching || process.exit(1);
  this.emit('end');
};

gulp.task('compile', () => {
  failed = false;
  return tsProject.src()
    .pipe(sourcemaps.init())
    .pipe(tsProject())
    .on('error', handleError)
    .js
    .pipe(sourcemaps.write())
    .pipe(gulp.dest(paths.bin));
});

const remapCoverageFiles = () => {
  const reports: { [key: string]: string } = {
    'html': paths.coverage(),
  };
  watching || (reports['text-summary'] = null);
  return failed || gulp
    .src(paths.coverage() + '/coverage-final.json')
    .pipe(remapIstanbul({
      reports: reports,
    }));
};

let coverageVariable: string;

gulp.task('coverage', ['compile'], () => {
  coverageVariable = '$$cov_' + new Date().getTime() + '$$';
  return failed || gulp
    .src(paths.bin + '/!(*.spec).js')
    .pipe(istanbul({
      coverageVariable: coverageVariable,
    }))
    .pipe(istanbul.hookRequire());
});

gulp.task('test', ['coverage'], () => {
  return failed || gulp
    .src(paths.bin + '/*.spec.js')
    .pipe(jasmineTest(watching ? {} : {
      reporter: new reporters.TerminalReporter({
        verbosity: 3,
        color: true,
      }),
    }))
    .on('error', handleError)
    .pipe(istanbul.writeReports({
      dir: paths.coverage(),
      reporters: ['json'],
      coverageVariable: coverageVariable,
    }))
    .on('end', remapCoverageFiles);
});

gulp.task('default', ['watch', 'test']);