var express = require('express');
var router = express.Router();
var requestIp = require('request-ip');
const axios = require('axios');

/* GET home page. */
router.get('/', function(req, res, next) {
  res.render('index', { title: '에케 API' });
});

router.get('/ip',function(req,res){
  let ip = requestIp.getClientIp(req);
  if (ip.startsWith('::ffff:')) ip = ip.replace('::ffff:', '');
  res.send(ip)
});

router.get('/time',function(req,res){
  var result = axios.get(`http://bbforest.net`);
  res.status(200).json({
    "success" : result
  }
);
});

module.exports = router;
