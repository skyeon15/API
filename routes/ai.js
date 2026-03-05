var express = require('express');
var router = express.Router();
const { api, chat } = require('../config.js');
const { OpenAI } = require('openai');
const sharp = require('sharp'); // 이미지 처리 라이브러리


const openai = new OpenAI({
    organization: api.openaiOrganization,
    apiKey: api.openaiApi,
})

const multer = require("multer");
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

// get
router.get('/', function (req, res, next) {
  res.send('/chat post')
})

// AI API
router.post('/chat', function (req, res, next) {
  openai.createChatCompletion({
    model: "gpt-4o-mini",
    messages: [{ role: "system", content: chat.system },
    { role: "assistant", content: chat.assistant },
    { role: "user", content: req.body.message }]
  }).then(ress => {
    return res.send(ress.data.choices[0].message.content)
  }).catch(error => {
    console.log(error.stack)
  })
})

const Tesseract = require('tesseract.js');  // tesseract.js 추가

router.post('/tax_invoice', upload.single('image'), async function (req, res, next) {
  console.log(req.file); // 업로드된 파일 정보

  const fileBuffer = req.file.buffer; // 업로드된 파일을 메모리에서 가져옴

  try {
    // Tesseract를 사용하여 이미지에서 텍스트 추출
    const { data: { text } } = await Tesseract.recognize(
      fileBuffer,  // 이미지 파일의 버퍼를 사용
      'kor+eng',       // 사용할 언어 설정 (영어)
      {
        // logger: (m) => console.log(m),  // 진행 상황을 로그로 출력
      }
    );

    console.log('Extracted Text:', text);  // 추출된 텍스트 출력

    // OpenAI에 보내는 프롬프트 준비
    const prompt = `
    이건 대한민국의 사업자등록증 정보야. 아래 정보를 json으로 정리하고 코드블럭 없이 json만 반환해. 절대 다른 문장을 같이 보내지마.
    등록번호,상호,대표자이름,주소,업태,종목,이메일주소
    업태와 종목은 여러개면 가장 위에있는것만 반환하고 고유번호증인 경우에는 비워놔
    ` + text;  // OCR로 추출한 텍스트를 프롬프트에 추가

    // OpenAI API 요청
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini', // 사용할 모델
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
    });

    // OpenAI 응답 콘솔 출력
    console.log(response.choices[0].message.content);

    res.send({ message: 'Image uploaded and processed successfully', data: response.data });

  } catch (error) {
    console.error('Error processing the image:', error);
    res.status(500).send({ message: 'Error processing the image' });
  }
});


// router.post('/tax_invoice', upload.single('image'), async function (req, res, next) {
//   console.log(req.file); // 업로드된 파일 정보

//   const fileBuffer = req.file.buffer; // 업로드된 파일을 메모리에서 가져옴

//   // Buffer를 base64로 인코딩하여 data URI 형식으로 변환
//   const base64Image = fileBuffer.toString('base64');
//   const imageUrl = `data:image/jpeg;base64,${base64Image}`;

//   try {
//     // GPT-4에 이미지와 프롬프트를 함께 전송하여 분석 요청
//     const response = await openai.chat.completions.create({
//       model: 'gpt-4o', // GPT-4 모델 사용
//       messages: [
//         {
//           "role": "user",
//           "content": [
//             {
//               "type": "image_url",
//               "image_url": {
//                 "url": imageUrl
//               }
//             },
//             {
//               "type": "text",
//               "text": `
//     이건 대한민국의 사업자등록증 정보야. 아래 정보를 json으로 정리하고 코드블럭 없이 json만 반환해. 절대 다른 문장을 같이 보내지마.
//     등록번호,상호,대표자이름,주소,업태,종목,이메일주소
//     업태와 종목은 여러개면 가장 위에있는것만 반환하고 고유번호증인 경우에는 비워놔`
//             }
//           ]
//         },
//       ],
//     });

//     console.log(response.choices[0].message.content); // OpenAI API 응답을 콘솔에 출력
//     res.send({ message: 'Image uploaded and processed successfully', data: response.data });
//   } catch (error) {
//     console.error('Error processing the image:', error);
//     res.status(500).send({ message: 'Error processing the image' });
//   }
// });


module.exports = router;