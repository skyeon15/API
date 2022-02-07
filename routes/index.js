var express = require('express');
var router = express.Router();
var requestIp = require('request-ip');
const https = require('https');

/* GET home page. */
router.get('/', function (req, res, next) {
  res.render('index', { title: '에케 API' });
});

//접속자 IP 구하기
router.get('/ip', function (req, res) {
  let ip = requestIp.getClientIp(req);
  if (ip.startsWith('::ffff:')) ip = ip.replace('::ffff:', '');
  res.send(ip)
});

//서버 시간 구하기
router.get('/time/:url', function (req, res) {
  var url = req.params.url
  //요청 옵션
  https.request({
    method: 'GET',
    host: url,
    path: ''
  }, function (ress) {
    //데이터 받을 때
    ress.on('data', function (chunk) {
      console.log(chunk.toString())
    })
    //데이터 다 받았을 때
    ress.on('end', function () {
      res.status(200).json({
        "url": url,
        "server": new Date(ress.headers.date),
        "local": new Date()
      });
    })
  }).end() //전송
});

//URL 미입력시 bbforest
router.get('/time', function (req, res){
  res.redirect('/time/bbforest.net')
})

module.exports = router;
