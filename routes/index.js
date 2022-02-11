var express = require('express');
var router = express.Router();
var requestIp = require('request-ip');
const https = require('https');
const time = require('../modules/time');

/* GET home page. */
router.get('/', function (req, res, next) {
  res.status(200).render('index', { title: '에케 API' });
});
//
//접속자 IP 구하기
router.get('/ip', function (req, res) {
  let ip = requestIp.getClientIp(req);
  if (ip.startsWith('::ffff:')) ip = ip.replace('::ffff:', '');
  res.status(200).send(ip)
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
    var send = new Date().getTime()
    //데이터 받을 때
    ress.on('data', function (chunk) {
      //없음
    })
    //데이터 다 받았을 때
    ress.on('end', function () {
      res.status(200).json({
        "url": url, 
        "abbreviation": "KST",
        "timezone": "Asia/Seoul",
        "utc_offset": "UTC+09:00",
        "url_time": time.format("YYYY-MM-DD hh:mm:ss.CCC", ress.headers.date),
        "server_time": time.format("YYYY-MM-DD hh:mm:ss.CCC"),
        "latency": send - new Date().getTime()
      });
    })
  }).end() //전송
});

//URL 미입력시 bbforest
router.get('/time', function (req, res) {
  res.redirect('/time/bbforest.net')
})

//학교 급식 알아오기
router.get('/school-lunch/:name', function (req, res) {
  //학교 정보 확인 구간
  https.request({
    method: 'GET',
    host: 'open.neis.go.kr',
    path: encodeURI('/hub/schoolInfo?Type=json&SCHUL_NM=' + req.params.name)
  }, function (ress) {
    var data = ''
    //데이터 받을 때
    ress.on('data', function (chunk) {
      data += chunk
    })
    //데이터 다 받았을 때
    ress.on('end', function () {
      var json = JSON.parse(data), name, education, school
      if (json.schoolInfo) {
        name = json.schoolInfo[1].row[0].SCHUL_NM //학교이름
        education = json.schoolInfo[1].row[0].ATPT_OFCDC_SC_CODE //교육청코드
        school = json.schoolInfo[1].row[0].SD_SCHUL_CODE  //학교코드
      }
      else res.status(200).json({
        "STATUS": "오류-학교이름",
        "NAME": req.params.name,
        "DATE": time.format("YYMMDD")
      })

      //급식 정보 확인 구간
      https.request({
        method: 'GET',
        host: 'open.neis.go.kr',
        // path: encodeURI('/hub/mealServiceDietInfo?Type=json&ATPT_OFCDC_SC_CODE=' + education + '&SD_SCHUL_CODE=' + school + '&MLSV_YMD=210820')
        path: encodeURI('/hub/mealServiceDietInfo?Type=json&ATPT_OFCDC_SC_CODE=' + education + '&SD_SCHUL_CODE=' + school + '&MLSV_YMD=' + time.format("YYMMDD"))
      }, function (ress) {
        var data2 = ''
        ress.on('data', function (chuck) {
          data2 += chuck
        })
        ress.on('end', function () {
          json = JSON.parse(data2)
          if (json.mealServiceDietInfo) {
            var meal
            if (json.mealServiceDietInfo[1].row[2]) {
              meal = [{
                "meal": json.mealServiceDietInfo[1].row[0].MMEAL_SC_NM,
                "dish": json.mealServiceDietInfo[1].row[0].DDISH_NM
              }, {
                "meal": json.mealServiceDietInfo[1].row[1].MMEAL_SC_NM,
                "dish": json.mealServiceDietInfo[1].row[1].DDISH_NM
              }, {
                "meal": json.mealServiceDietInfo[1].row[2].MMEAL_SC_NM,
                "dish": json.mealServiceDietInfo[1].row[2].DDISH_NM
              }]
            }
            else if (json.mealServiceDietInfo[1].row[1]) {
              meal = [{
                "meal": json.mealServiceDietInfo[1].row[0].MMEAL_SC_NM,
                "dish": json.mealServiceDietInfo[1].row[0].DDISH_NM
              }, {
                "meal": json.mealServiceDietInfo[1].row[1].MMEAL_SC_NM,
                "dish": json.mealServiceDietInfo[1].row[1].DDISH_NM
              }]
            }
            else if (json.mealServiceDietInfo[1].row[0]) {
              meal = [{
                "meal": json.mealServiceDietInfo[1].row[0].MMEAL_SC_NM,
                "dish": json.mealServiceDietInfo[1].row[0].DDISH_NM
              }]
            }

            //JSON 반환
            res.status(200).json({
              "STATUS": "정상",
              "NAME": name,
              "DATE": time.format("YYMMDD"),
              "meals": meal
            })
          }
          res.status(200).json({
            "STATUS": "오류-급식없음",
            "NAME": name,
            "DATE": time.format("YYMMDD")
          })
        })
      }).end()
    })
  }).end()
})

module.exports = router;
