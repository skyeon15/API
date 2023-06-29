var express = require('express');
var router = express.Router();
const { api, chat } = require('../config.json');
const { Configuration, OpenAIApi } = require('openai');
const configuration = new Configuration({
    organization: api.openaiOrganization,
    apiKey: api.openaiApi,
});
const openai = new OpenAIApi(configuration);

// get
router.get('/', function (req, res, next) {
  res.send('/chat post')
})

// AI API
router.post('/chat', function (req, res, next) {
  openai.createChatCompletion({
    model: "gpt-3.5-turbo",
    messages: [{ role: "system", content: chat.system },
    { role: "assistant", content: chat.assistant },
    { role: "user", content: req.body.message }]
  }).then(ress => {
    return res.send(ress.data.choices[0].message.content)
  }).catch(error => {
    console.log(error.stack)
  })
})

module.exports = router;