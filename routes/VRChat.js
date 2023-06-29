var express = require('express');
var router = express.Router();
const vrchat = require("vrchat");
const https = require('https')

const configuration = new vrchat.Configuration({
  username: "bbforest",
  password: "VRChatbbforest!@"
});
const AuthenticationApi = new vrchat.AuthenticationApi(configuration);
const WorldApi = new vrchat.WorldsApi(configuration);
const UsersApi = new vrchat.UsersApi(configuration);
const SystemApi = new vrchat.SystemApi(configuration);

/* GET users listing. */
router.get('/', function (req, res, next) {
  AuthenticationApi.getCurrentUser().then(resp => {
    // WorldApi.searchWorlds(true, undefined, undefined, undefined, 100).then(function(resq){
    //   console.log(resq)
    // })
    // WorldApi.getActiveWorlds(undefined, 'created', 100, 'ascending', 100).then(function (resq) {
    //   res.send(resq.data)
    // })
    WorldApi.searchWorlds(undefined, 'created', undefined, undefined, 100, 'ascending', 900).then(function (resq) {
      res.send(resq)
    })
  });
});

router.get('/test', async (req, res) => {
	res.writeHead(200, { 'Content-Type': 'video/mp4' });
});

module.exports = router;
