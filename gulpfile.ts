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
  api: () => 'api/swagger/' + paths.swagger,
  bin: 'bin',
  conf: () => ['src/**/*.json', paths.templates + '/*.json'],
  coverage: () => paths.reports + '/coverage',
  reports: 'reports',
  sam: 'sam.yaml',
  src: 'src/**/!(*.spec).ts',
  specs: 'src/*.spec.ts',
  swagger: 'swagger.yaml',
  templates: 'templates',
  tmp: 'tmp',
};

let watching = false;
let failed = false;

gulp.task('watch', () => {
  watching = true;
  gulp.watch(paths.api(), ['test']);
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
    .src(paths.api())
    .pipe(replace(/^/gm, '        '))
    .pipe(gulp.dest(paths.tmp))
    .pipe(yaml())
    .pipe(gulp.dest(paths.bin))
    .on('end', () => {
      gulp
        .src([paths.templates + '/' + paths.sam, paths.tmp + '/' + paths.swagger])
        .pipe(concat(paths.sam))
        .pipe(gulp.dest(paths.tmp));
    });
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
      dir: paths.coverage(),
      reporters: ['json'],
      coverageVariable: coverageVariable,
    }))
    .on('end', remapCoverageFiles);
});

gulp.task('default', ['watch', 'test']);