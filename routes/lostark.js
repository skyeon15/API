var express = require('express');
var router = express.Router();
var requestIp = require('request-ip');
const cheerio = require('cheerio');
const EKE = require('../modules/EKE');
const logger = require('../modules/logger');

//로스트아크 캐릭터
router.get('/', function (req, res) {
  logger.info('로스트아크 캐릭터 조회', { nickname: req.query.nickname, ip: requestIp.getClientIp(req) });
  EKE.eRequest('GET', 'https://lostark.game.onstove.com/Profile/Character/' + req.query.nickname, function (data) {
    var s = cheerio.load(data)

    //닉네임
    var name = s('#lostark-wrapper > div > main > div > div.profile-character-infoWrap > div > span.profile-character-info__name').text()
    //서버
    var server = s('#lostark-wrapper > div > main > div > div.profile-character-infoWrap > div > span.profile-character-info__server').text().replace('@', '')
    //레벨
    var level = s('#lostark-wrapper > div > main > div > div.profile-character-infoWrap > div > span.profile-character-info__lv').text().replace('Lv.', '')
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

module.exports = router;
