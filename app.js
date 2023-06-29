var createError = require('http-errors');
var express = require('express');
var path = require('path');
var cookieParser = require('cookie-parser');
var logger = require('morgan');

var indexRouter = require('./routes/index');
var usersRouter = require('./routes/users');
var log = require('./modules/log');
const fs = require('fs');

var app = express();

// view 엔진 설정
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'pug');

// data 폴더 존재 확인
if (!fs.existsSync('data')) {
  // 없으면 폴더 생성
  fs.mkdirSync('data');
}

app.all('*', function(req, res, next){
  log.req(req)
  // if(req.hostname == 'api.bbforest.net') {
    next()
  // }
})

// app.use(logger('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());

app.use('/', indexRouter);
app.use('/users', usersRouter);
app.use('/dl', require('./routes/dl.js'))
app.use('/ai', require('./routes/ai.js'))
app.use('/vrc', require('./routes/VRChat.js'))

app.use(express.static(path.join(__dirname, 'public')));

// 404 오류 발생
app.use(function(req, res, next) {
  next(createError(404));
});

// 오류 핸들링
app.use(function(err, req, res, next) {
  // set locals, only providing error in development
  res.locals.message = err.message;
  res.locals.error = req.app.get('env') === 'development' ? err : {};

  console.log(err.stack)

  // render the error page
  res.status(err.status || 500);
  res.render('error');
});

module.exports = app;
