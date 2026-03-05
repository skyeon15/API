var createError = require('http-errors');
var express = require('express');
var path = require('path');
var cookieParser = require('cookie-parser');
var logger = require('morgan');
var fs = require('fs');

var indexRouter = require('./routes/index');
var usersRouter = require('./routes/users');
var log = require('./modules/log');

var app = express();

// view 엔진 설정
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'pug');

// data 폴더 존재 확인
if (!fs.existsSync('data')) {
  // 없으면 폴더 생성
  fs.mkdirSync('data');
}

app.all('*', function (req, res, next) {
  log.req(req)
  // if(req.hostname == 'api.bbforest.net') {
  next()
  // }
})

// CORS middleware
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, PATCH, DELETE');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

// app.use(logger('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());

app.use('/', indexRouter);

// 동적 라우팅: routes 폴더 및 하위 폴더의 파일들을 자동으로 라우터로 등록
const routesPath = path.join(__dirname, 'routes');

function shouldSkipByContent(filePath) {
  try {
    const fileContent = fs.readFileSync(filePath, 'utf8');
    // 최상위 레벨의 즉시 실행 코드만 건너뛰기 (함수 내부는 무시)
    const topLevelAsyncIIFE = /^\s*\(async \(\) => \{/m.test(fileContent);
    if (topLevelAsyncIIFE) {
      console.log(`건너뜀 이유: 최상위 레벨 즉시 실행 코드 (async () => {) 포함: ${filePath}`);
      return true;
    }
    if (fileContent.includes('convertProtectedExcelToCsv(')) {
      console.log(`건너뜀 이유: convertProtectedExcelToCsv 함수 포함: ${filePath}`);
      return true;
    }
    return false;
  } catch (e) {
    console.error(`파일 읽기 실패: ${filePath}`, e.message);
    return false;
  }
}

function mountRoute(routeUrlPath, requirePath, logPath) {
  try {
    const router = require(requirePath);
    app.use(routeUrlPath, router);
    console.log(`라우터 등록됨: ${routeUrlPath} -> ${logPath}`);
  } catch (error) {
    console.error(`라우터 로드 실패: ${logPath}`, error.message);
  }
}

function walkRoutes(currentFsPath, baseUrlPath = '') {
  const entries = fs.readdirSync(currentFsPath, { withFileTypes: true });

  // 폴더 우선, 그 다음 파일 처리 (안정적인 URL 생성 위해)
  for (const entry of entries) {
    if (entry.isDirectory()) {
      const dirName = entry.name;
      const nextFsPath = path.join(currentFsPath, dirName);
      const nextUrlPath = path.posix.join(baseUrlPath, dirName);

      // 해당 폴더 안에 index.js가 있으면 그 경로로 마운트
      const indexJsPath = path.join(nextFsPath, 'index.js');
      if (fs.existsSync(indexJsPath)) {
        if (!shouldSkipByContent(indexJsPath)) {
          mountRoute('/' + nextUrlPath, `./routes/${path.relative(routesPath, indexJsPath).replace(/\\/g, '/')}`, `${path.relative(__dirname, indexJsPath).replace(/\\/g, '/')}`);
        } else {
          console.log(`라우터 건너뜀 (즉시 실행 코드 포함): /${nextUrlPath} -> ${path.relative(__dirname, indexJsPath).replace(/\\/g, '/')}`);
        }
      }

      // 하위 폴더 재귀 처리
      walkRoutes(nextFsPath, nextUrlPath);
    }
  }

  for (const entry of entries) {
    if (entry.isFile() && entry.name.endsWith('.js')) {
      const fileName = entry.name;
      if (fileName === 'index.js' || fileName === 'users.js') continue; // 루트 index는 이미 app.use('/', indexRouter)로 처리됨, users.js 전역 제외

      const fileFsPath = path.join(currentFsPath, fileName);
      const relFromRoutes = path.relative(routesPath, fileFsPath).replace(/\\/g, '/');
      const routeName = path.basename(fileName, '.js');
      const urlPath = path.posix.join('/', baseUrlPath, routeName);

      if (shouldSkipByContent(fileFsPath)) {
        console.log(`라우터 건너뜀 (즉시 실행 코드 포함): ${urlPath} -> routes/${relFromRoutes}`);
        continue;
      }

      mountRoute(urlPath, `./routes/${relFromRoutes}`, `routes/${relFromRoutes}`);
    }
  }
}

walkRoutes(routesPath, '');

// 404 오류 발생
app.use(function (req, res, next) {
  next(createError(404));
});

// 오류 핸들링
app.use(function (err, req, res, next) {
  // set locals, only providing error in development
  res.locals.message = err.message;
  res.locals.error = req.app.get('env') === 'development' ? err : {};

  console.log(err.stack)

  // render the error page
  res.status(err.status || 500);
  res.render('error');
});

module.exports = app;
