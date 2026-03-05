var express = require('express');
var router = express.Router();
const axios = require('axios')

var AuthData = {
  apikey: 's2a5d5eujr5509ul7ea791apmoypowc6',
  userid: 'bbf1',
  token: '4201ff0479e9c7ba1b43cf5e9544131c2572fabbf7b4bdd1a9341795fa67297d15dbddd53fcffb05b1af78a93d6f253c9efba82365d36d698580bfbf13c8becbFar1kSz7AuV5n6hJsArb21MDS1AugIBPZmSAWTAELUfjY65CAOlcm0F7xt1xl2hnCH1kjuhQaAskDMKBSBaPYg=='
}

var apireq

const alimtalkSend = (callback) => {
  // 알림톡 전송
  apireq.body = {
    senderkey: 'c945d99008baa341445c02bf1890ed9d5702943b',
    tpl_code: 'TP_6467',
    sender: '01059195770',
    receiver_1: '01059195770',
    emtitle_1: '공간 햅삐',
    subject_1: '보증금 입금 안내',
    message_1: '광현님, 공간 햅삐를 예약해 주셔서 감사합니다. :D\n시설 및 청소 보증금 안내드립니다.\n- 보증금 10만원\n - 보증금 입금계좌\n - 토스뱅크 1000 - 7952 - 2781 신광현\n\n - 이용 후 돌려받으실 계좌번호도 남겨주세요~\n\n보증금은 예약 후 즉시 예약자 이름으로 입금해주셔야 예약이 확정됩니다.\n시설 확인 후 이상이 없을 경우 예약자 명의 계좌로 반환해드리오니 참고 바랍니다.\n문의사항이 있으시면 이 채팅방에 메시지를 남겨주세요.감사합니다.',
    /*** 필수값입니다 ***/
    // senddate: 예약일 // YYYYMMDDHHMMSS
    // recvname: 수신자 이름
    button_1: {
      button:
        [{
          "name": "채널추가",
          "linkType": "AC",
          "linkTypeName": "채널추가"
        }]
    }
  }
}

router.get('/', function (req, res, next) {
  alimtalkSend((data)=>{
    res.send(data)
  })
})

router.post('/bank', function (req, res, next) {
  axios.post('https://discord.com/api/webhooks/1211941661618208800/a_6P6QUZCDUV3Mv51AKOfteCMWTQUfDdFUqx12fIaZLLAfvvu8ATLzEthzBdxVvZxoh-', {
    'username': '공간 햅삐 채널 알림',
    'content': JSON.stringify(req.body.userRequest.utterance)  + JSON.stringify(req.body.action.params) 
  }).then(ress => {
    res.send({
      "answer": {
        "status": "normal",
        "sentence": "계좌번호가 확인되었습니다.",
        "dialog": "reply"
      }
    })
  })
})

module.exports = router;