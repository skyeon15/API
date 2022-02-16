/**
 * eRequest.js
 *
 * Copyright(c) 에케EKE(파란대나무숲BlueBambooForest)
 * MIT Licensed
 *
 * @summary Https request
 * @author EKE <eke@bbforest.net>
 * 
 */

const { https } = require('follow-redirects');

function eRequest(method, url, callback) {
  url = url.replace('http://', '')
  url = url.replace('https://', '')
  var host = url.split('/')[0]
  url = url.replace(host, '')
  var data = ''

  https.request({
    method: method,
    host: encodeURI(host),
    path: encodeURI(url),
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; MSIE 9.0; Windows NT 6.3; WOW64; Trident/7.0)'
    }
  }, function (ress) {
    ress.on('data', function (chunk) {
      data += chunk
    })
    ress.on('end', function () {
      callback(data, ress.headers)
    })
  }).end()
}

function file(tag) {
  var fs = require('fs');
  fs.readFile('sample.txt', 'utf8', function (err, data) {
    console.log(data);
  });
}

module.exports.eRequest = eRequest;
module.exports.file = file;