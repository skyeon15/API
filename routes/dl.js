var express = require('express');
var router = express.Router();
const fs = require('fs');
const Stream = require('stream');
const ytdl = require('ytdl-core');

router.get('/*', function (req, res) {
    var url = req.originalUrl.substring(4).replace('https://youtu.be/', '').replace('https://www.youtube.com/watch?v=', '')

    if(url == ''){
        res.send({
            message: '아무것도 없어요.'
        })
        return
    }

    let id

    try {
        //타임코드 제거
        if(url.indexOf('?') != -1){
            url = url.split('?')[0]
        }
        //유튜브 ID 얻기
        id = ytdl.getVideoID(url)
    } catch (error) {
        console.log(error.toString())
        res.send({
            message: error.toString()
        })
        return
    }

    //유튜브 형식이면
    if (id != undefined) {
        //파일 존재 여부 확인
        if (fs.existsSync(`./data/video/yt/${id}.mp4`)) {
            //파일이 존재하면 스트림 형식으로 호출
            fs.createReadStream(`./data/video/yt/${id}.mp4`).pipe(res)
        } else {
            //파일이 존재하지 않으면 받아오기
            var stream = ytdl(id, {
                quality: 'highest',
                filter: 'audioandvideo'
            }).on('error', function (error) {
                //오류 발생시 반환
                res.status(404).send(error.message)
                console.log(error.message)
                return
            })

            //저장과 동시에 출력
            var filepipe = new Stream.PassThrough()
            var respipe = new Stream.PassThrough()
            stream.pipe(filepipe)
            stream.pipe(respipe)

            //스트림 형식으로 저장
            filepipe.pipe(fs.createWriteStream(`./data/video/yt/${id}.mp4`))

            //출력
            respipe.pipe(res)
        }
    }else{
        res.send({
            message: '유튜브 영상이 아닙니다.'
        })
        return
    }
})

module.exports = router;
