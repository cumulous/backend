const concat = require('gulp-concat');
const gulp = require('gulp');
const istanbul = require('gulp-istanbul');
const jasmineTest = require('gulp-jasmine');
const remapIstanbul = require('remap-istanbul/lib/gulpRemapIstanbul');
const replace = require('gulp-replace');
const reporters = require('jasmine-reporters');
const sourcemaps = require('gulp-sourcemaps');
const ts = require('gulp-typescript');
const yaml = require('gulp-yaml');

const tsProject = ts.createProject('tsconfig.json');

const paths = {
  api: 'api/swagger/swagger.yaml',
  bin: 'bin',
  conf: () => ['src/**/*.json', paths.templates + '/*.json'],
  coverage: 'coverage',
  backend: 'backend.yaml',
  src: 'src/**/!(*.spec).ts',
  specs: 'src/*.spec.ts',
  templates: 'templates',
};

let watching = false;
let failed = false;

gulp.task('watch', () => {
  watching = true;
  gulp.watch(paths.api, ['test']);
  gulp.watch(paths.conf(), ['test']);
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
  gulp
    .src(paths.conf())
    .pipe(gulp.dest(paths.bin));
  gulp
    .src(paths.api)
    .pipe(yaml({
      replacer: (key: string, value: any) =>
        key.startsWith('x-amazon') || key === 'options' ? undefined : value,
    }))
    .pipe(gulp.dest(paths.bin));
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
    'html': paths.coverage,
  };
  watching || (reports['text-summary'] = null);
  return failed || gulp
    .src(paths.coverage + '/coverage-final.json')
    .pipe(remapIstanbul({
      reports,
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
  const silent = watching && !process.env['LOG_LEVEL'];
  return failed || gulp
    .src(paths.bin + '/*.spec.js')
    .pipe(jasmineTest(silent ? {} : {
      reporter: new reporters.TerminalReporter({
        verbosity: 3,
        color: true,
      }),
    }))
    .on('error', handleError)
    .pipe(istanbul.writeReports({
      dir: paths.coverage,
      reporters: ['json', 'lcovonly'],
      coverageVariable: coverageVariable,
    }))
    .on('end', remapCoverageFiles);
});

gulp.task('default', ['watch', 'test']);