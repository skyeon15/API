var express = require('express');
var router = express.Router();
var requestIp = require('request-ip');
const { https } = require('follow-redirects');
const time = require('../modules/time');
const EKE = require('../modules/EKE');
const convert = require('xml-js');
const cheerio = require('cheerio');
const fs = require('fs');
const { default: axios } = require('axios');

/* GET home page. */
router.get('/', function (req, res, next) {
  // res.status(200).render('index', { title: '에케 API' });
  res.redirect("https://docs.api.bbforest.net")
});

router.get('/news', function (req, res, next) {
  res.status(200).render('news', { title: '에케 API' });
});

//접속자 IP 구하기
router.get('/ip', function (req, res) {
  let ip = requestIp.getClientIp(req);
  if (ip.startsWith('::ffff:')) ip = ip.replace('::ffff:', '');
  res.status(200).send(ip)
});

//서버 시간 구하기
router.get('/time/:url', function (req, res) {
  var url = req.params.url.replace('http://', '').replace('https://', '')
  var send = new Date().getTime()

  axios.get('https://' + url)
    .then(function (ress) {
      res.status(200).json({
        status: "정상",
        "url": url,
        "abbreviation": "KST",
        "timezone": "Asia/Seoul",
        "utc_offset": "UTC+09:00",
        "url_time": time.format("YYYY-MM-DD hh:mm:ss.CCC", ress.headers.date),
        "server_time": time.format("YYYY-MM-DD hh:mm:ss.CCC"),
        "latency": new Date().getTime() - send + 'ms'
      });
    })
    .catch(function (error) {
      console.log(error)
      res.status(200).json({
        status: "오류",
        "url": url,
        "abbreviation": "KST",
        "timezone": "Asia/Seoul",
        "utc_offset": "UTC+09:00",
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
  axios.get(encodeURI('https://open.neis.go.kr/hub/schoolInfo?Type=json&SCHUL_NM=' + req.params.name))
    .then(function (ress) {
      var json = ress.data
      if (json.schoolInfo) {
        name = json.schoolInfo[1].row[0].SCHUL_NM //학교이름
        education = json.schoolInfo[1].row[0].ATPT_OFCDC_SC_CODE //교육청코드
        school = json.schoolInfo[1].row[0].SD_SCHUL_CODE  //학교코드
      }
      else {
        res.status(200).json({
          STATUS: "오류-학교이름",
          NAME: req.params.name,
          DATE: time.format("YYMMDD")
        })
        return
      }

      // 급식 정보 확인 구간
      axios.get('https://open.neis.go.kr/hub/mealServiceDietInfo?Type=json&ATPT_OFCDC_SC_CODE=' + education + '&SD_SCHUL_CODE=' + school + '&MLSV_YMD=' + time.format("YYMMDD"))
        .then(function (ress) {
          var json = ress.data
          // 급식 정보 있으면
          if (json.mealServiceDietInfo) {

            var meal = []
          
            for(var m of json.mealServiceDietInfo[1].row){
              meal.push({
                "meal": m.MMEAL_SC_NM,
                "dish": m.DDISH_NM
              })
            }
            
            //JSON 반환
            res.status(200).json({
              STATUS: "정상",
              NAME: name,
              DATE: time.format("YYMMDD"),
              MEALS: meal
            })
            return
          } else {
            res.status(200).json({
              STATUS: "오류-급식없음",
              NAME: name,
              DATE: time.format("YYMMDD")
            })
            return
          }
        })
        .catch(function (error) {
          console.log(error)
          res.status(200).json({
            STATUS: "오류-급식서버오류",
            NAME: name,
            DATE: time.format("YYMMDD")
          })
        })
    })
    .catch(function (error) {
      console.log(error)
      res.status(200).json({
        STATUS: "오류-학교서버오류",
        NAME: name,
        DATE: time.format("YYMMDD")
      })
    })
})

//네이버 날씨
router.get('/weather', function (req, res) {
  //지역이 입력되지 않으면
  if (req.query.city == undefined) {
    res.send('사용법: ?city=<지역명>&type=[json, text]')
    return
  }
  axios.get(encodeURI('https://m.search.naver.com/search.naver?query=' + req.query.city + ' 날씨'))
    .then(function (ress) {

      var s = cheerio.load(ress.data)

      //위치
      var city = s('div.title_area > div > span').text()
      //날씨
      var weather = s('span.weather.before_slash').text()
      //현재온도
      var temp = s('div.weather_info > div > div._today > div.weather_graphic > div.temperature_text > strong').text().replace('현재 온도', '');
      //최고온도
      var temp_low = s('li.week_item.today > div > div.cell_temperature > span > span.lowest').text().replace('최저기온', '');
      //최저온도
      var temp_high = s('li.week_item.today > div > div.cell_temperature > span > span.highest').text().replace('최고기온', '');
      //미세먼지
      var pm = s('div.weather_info > div > div.report_card_wrap > ul > li:nth-child(1) > a > span').text()
      //초미세먼지
      var pm_m = s('div.weather_info > div > div.report_card_wrap > ul > li:nth-child(2) > a > span').text()
      //자외선
      var ultraviolet = s('div.weather_info > div > div.report_card_wrap > ul > li.item_today.level4 > a > span').text()
      //일몰
      var sunset = s('div.weather_info > div > div.report_card_wrap > ul > li.item_today.type_sun > a > span').text()
      // 바람
      var wind = s('div._today > div.temperature_info > dl > dd:nth-child(6)').text()

      //지역을 못 받아오면
      if (city != '') {
        //요약
        var summary = s('#ct > section.sc.csm.cs_weather_new._cs_weather > div > div.content_wrap > div.flicking-viewport > div > div:nth-child(1) > div:nth-child(1) > div > div.weather_info > div > div.temperature_info > dl').text().trim().split(' ')
        //강수확률
        var precipitation = summary[1]
        //습도
        var humidity = summary[3]
        //바람
        var wind = [summary[4]?.toString()?.replace('바람(', '')?.replace(')', ''), summary[5]]
      }

      if (req.query.type == 'text') {
        if (city == '') {
          res.send('위치 정보를 찾을 수 없어요.')
          return
        }

        var result = `[ ${city.replace(city.split(' ')[0], '')}의 현재 날씨는 ${weather}! ][br]
          [br]
          기온 : ${temp}(최저 ${temp_low}/최고 ${temp_high})[br]
          바람 : ${wind[0]} ${wind[1]}[br]
          일몰시간 : ${sunset}[br]
          강수확률 : ${precipitation}[br]
          습도 : ${humidity}[br]
          (초)미세먼지 : ${pm_m}, ${pm}[br]
          자외선 : ${ultraviolet}`
        res.send(result.replace(/  +/g, ""))
      } else {
        res.send({
          city: city,
          weather: weather,
          temp: temp,
          temp_low: temp_low,
          temp_high: temp_high,
          precipitation: precipitation,
          humidity: humidity,
          pm: pm,
          pm_m: pm_m,
          ultraviolet: ultraviolet,
          sunset: sunset,
          wind: wind
        })
      }
    })
    .catch(function(error){
console.log(error)
    })
})

// var fs = require('fs')
// var olympic = JSON.parse(fs.readFileSync('./data/olympic.json'))

// olympic = result

// fs.writeFileSync('./data/olympic.json', JSON.stringify(olympic))

//올림픽 메달
router.get('/olympic', function (req, res) {
  EKE.eRequest('GET', 'https://m.search.naver.com/search.naver?query=올림픽', function (data) {
    var s = cheerio.load(data)

    //올림픽 이름
    var name = s("#ct > section.sc.mcs_common_module.case_normal.color_7._olympic > div > div.sticky_wrap._sticky_wrap > div > div.title_area._title_area > h2 > span.area_text_title > strong").text();
    //올림픽 우리나라 순위
    var grade = s("#ct > section.sc.mcs_common_module.case_normal.color_7._olympic > div > div.sticky_wrap._sticky_wrap > div > div.title_area._title_area > div > span").text();
    //우리나라 금메달 갯수
    var gold = s("#ct > section.sc.mcs_common_module.case_normal.color_7._olympic > div > div.sticky_wrap._sticky_wrap > div > div.title_area._title_area > div > div > span.ico_medal.gold").text().replace(/[^0-9]/g, '');
    //우리나라 은메달 갯수
    var silver = s("#ct > section.sc.mcs_common_module.case_normal.color_7._olympic > div > div.sticky_wrap._sticky_wrap > div > div.title_area._title_area > div > div > span.ico_medal.silver").text().replace(/[^0-9]/g, '');
    //우리나라 동메달 갯수
    var bronze = s("#ct > section.sc.mcs_common_module.case_normal.color_7._olympic > div > div.sticky_wrap._sticky_wrap > div > div.title_area._title_area > div > div > span.ico_medal.bronze").text().replace(/[^0-9]/g, '');

    if (name == '') {
      res.send('에러')
    } else {
      res.send({
        name: name,
        grade: grade,
        gold: gold,
        silver: silver,
        bronze: bronze
      })
    }
  })
})

//로스트아크 캐릭터
router.get('/lostark', function (req, res) {
  EKE.eRequest('GET', 'https://lostark.game.onstove.com/Profile/Character/' + req.query.nickname, function (data) {
    var s = cheerio.load(data)

    //닉네임
    var name = s('#lostark-wrapper > div > main > div > div.profile-character-info > span.profile-character-info__name').text()
    //서버
    var server = s('#lostark-wrapper > div > main > div > div.profile-character-info > span.profile-character-info__server').text().replace('@', '')
    //레벨
    var level = s('#lostark-wrapper > div > main > div > div.profile-character-info > span.profile-character-info__lv').text().replace('Lv.', '')
    //원정대 레벨
    var lever_expedition = s('#lostark-wrapper > div > main > div > div.profile-ingame > div.profile-info > div.level-info > div.level-info__expedition > span').text().replace('원정대 레벨Lv.', '')
    //전투 레벨
    var level_fight = s('#lostark-wrapper > div > main > div > div.profile-ingame > div.profile-info > div.level-info > div.level-info__item > span:nth-child(2)').text().replace('Lv.', '')
    //장착 아이템 레벨
    var level_item = s('#lostark-wrapper > div > main > div > div.profile-ingame > div.profile-info > div.level-info2 > div.level-info2__expedition > span:nth-child(2)').text().replace('Lv.', '')
    //달성 아이템 레벨
    var level_item2 = s('#lostark-wrapper > div > main > div > div.profile-ingame > div.profile-info > div.level-info2 > div.level-info2__item > span:nth-child(2)').text().replace('Lv.', '')

    //칭호
    var title = s('#lostark-wrapper > div > main > div > div.profile-ingame > div.profile-info > div.game-info > div.game-info__title > span:nth-child(2)').text()
    //길드
    var guild = s('#lostark-wrapper > div > main > div > div.profile-ingame > div.profile-info > div.game-info > div.game-info__guild > span:nth-child(2)').text()
    //PVP
    var pvp = s('#lostark-wrapper > div > main > div > div.profile-ingame > div.profile-info > div.game-info > div.level-info__pvp > span:nth-child(2)').text()
    //영지
    var wisdom = s('#lostark-wrapper > div > main > div > div.profile-ingame > div.profile-info > div.game-info > div.game-info__wisdom > span:nth-child(3)').text()
    var wisdom_level = s('#lostark-wrapper > div > main > div > div.profile-ingame > div.profile-info > div.game-info > div.game-info__wisdom > span:nth-child(2)').text().replace('Lv.', '')

    if (req.query.type == 'text') {
      if (name == '') {
        res.send('캐릭터 정보를 찾을 수 없어요.')
        return
      }

      var result = `[ ${name}의 로스트아크 ][br]
                    Lv.${level}[br]
                    서버 : ${server}[br]
                    PVP : ${pvp}[br]
                    칭호 : ${title}[br]
                    길드 : ${guild}[br]
                    영지 : ${wisdom} (Lv.${wisdom_level})[br]
                    [br]
                    레벨 정보[br]
                    원정대 : ${lever_expedition}[br]
                    전투 : ${level_fight}[br]
                    장착 아이템 : ${level_item}[br]
                    달성 아이템 : ${level_item2}`
      res.send(result.replace(/  +/g, ""))
    } else {
      res.send({
        name: name,
        server: server,
        level: level,
        lever_expedition: lever_expedition,
        level_fight: level_fight,
        level_item: level_item,
        level_item2: level_item2,
        title: title,
        guild: guild,
        pvp: pvp,
        wisdom: wisdom,
        wisdom_level: wisdom_level
      })
    }
  })
})

router.get('/redirect*', function (req, res, next) {
  var url = req.originalUrl.substring(10)

  if (url.startsWith('http')) {
    res.redirect(url)
  } else {
    res.send(`URL이 올바르지 않습니다. http:// 또는 https://가 포함되어야 합니다.<br>
    사용법 : api.bbforest.net/redirect/이동할주소<br>
    입력된URL : api.bbforest.net/redirect/${url}<br>
    파란대나무숲. BlueBambooForest. By.에케(@skyeon15)`)
  }
});

module.exports = router;