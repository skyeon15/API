var express = require('express');
var router = express.Router();
const fs = require('fs');
const ytdl = require('ytdl-core');

router.get('/*', function (req, res) {
    var url = req.originalUrl.substring(4)
    ytdl('https://youtu.be/' + url).pipe(res)
    
    // if (url.indexOf('youtu') != -1) {
    //     audio(url, res)
    // } else {
    //     res.send('오류')
    // }
})

function youtube(url, callback) {
    var name = ytdl.getURLVideoID(url)
    ytdl(url).pipe(fs.createWriteStream('./public/cdn/' + name))
    callback('/cdn/' + name)
}

module.exports = router;
