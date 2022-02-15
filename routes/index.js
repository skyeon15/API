var express = require('express');
var router = express.Router();
var requestIp = require('request-ip');
const { https } = require('follow-redirects');
const time = require('../modules/time');
const eRequest = require('../modules/eRequest');

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
  var send = new Date().getTime()
  eRequest.eRequest('GET', url, function (data, headers) {
    res.status(200).json({
      "url": url,
      "abbreviation": "KST",
      "timezone": "Asia/Seoul",
      "utc_offset": "UTC+09:00",
      "url_time": time.format("YYYY-MM-DD hh:mm:ss.CCC", headers.date),
      "server_time": time.format("YYYY-MM-DD hh:mm:ss.CCC"),
      "latency": new Date().getTime() - send + 'ms'
    });
  })

});

//URL 미입력시 bbforest
router.get('/time', function (req, res) {
  res.redirect('/time/bbforest.net')
})

//학교 급식 알아오기
router.get('/school-lunch/:name', function (req, res) {
  //학교 정보 확인 구간
  var name, education, school
  eRequest.eRequest('GET', 'https://open.neis.go.kr/hub/schoolInfo?Type=json&SCHUL_NM=' + req.params.name, function (data) {
    var json = JSON.parse(data)
    if (json.schoolInfo) {
      name = json.schoolInfo[1].row[0].SCHUL_NM //학교이름
      education = json.schoolInfo[1].row[0].ATPT_OFCDC_SC_CODE //교육청코드
      school = json.schoolInfo[1].row[0].SD_SCHUL_CODE  //학교코드
    }
    else {
      res.status(200).json({
        "STATUS": "오류-학교이름",
        "NAME": req.params.name,
        "DATE": time.format("YYMMDD")
      })
      return
    }

    //급식 정보 확인 구간
    eRequest.eRequest('GET', 'https://open.neis.go.kr/hub/mealServiceDietInfo?Type=json&ATPT_OFCDC_SC_CODE='
      + education + '&SD_SCHUL_CODE=' + school + '&MLSV_YMD=' + time.format("YYMMDD"),
      function (data) {
        json = JSON.parse(data)
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
          return
        } else {
          res.status(200).json({
            "STATUS": "오류-급식없음",
            "NAME": name,
            "DATE": time.format("YYMMDD")
          })
          return
        }
      })
  })
})

//코로나 정보
router.get('/covid19', function (req, res) {
  https.request({
    method: 'GET',
    host: '',
    path: ''
  }, function (ress) {
    var data
    ress.on('data', function (chunk) {
      data += chunk
    })
    ress.on('end', function () {
      //fggfdfdg
    })
  })
})

module.exports = router;