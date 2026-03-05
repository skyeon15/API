var express = require('express');
var router = express.Router();
const fs = require('fs');
const { execFile } = require('child_process');
const path = require('path');

const ytDlpPath = path.resolve(__dirname, '../bin/yt-dlp');

function getVideoID(url) {
    if (/^[a-zA-Z0-9_-]{11}$/.test(url)) return url;
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
    const match = url.match(regExp);
    if (match && match[2].length === 11) {
        return match[2];
    }
    return null;
}

router.get('/*', function (req, res) {
    var url = req.originalUrl.substring(4).replace('https://youtu.be/', '').replace('https://www.youtube.com/watch?v=', '')
    console.log(`[dl.js] 요청 들어옴: 원본 URL=${req.originalUrl}, 파싱된 URL=${url}`);

    if (url == '') {
        console.log(`[dl.js] 빈 URL 요청`);
        res.status(400).send({
            message: '아무것도 없어요.'
        })
        return
    }

    let id

    try {
        //타임코드 등 불필요한 파라미터 전부 제거
        if (url.indexOf('&') != -1) {
            url = url.split('&')[0]
        }
        if (url.indexOf('?') != -1) {
            url = url.split('?')[0]
        }
        //유튜브 ID 얻기
        id = getVideoID(url)
        if (!id) throw new Error("Invalid YouTube ID");
        console.log(`[dl.js] 추출된 유튜브 ID: ${id}`);
    } catch (error) {
        console.log(`[dl.js] ID 추출 에러: ${error.toString()}`);
        res.status(400).send({
            message: error.toString()
        })
        return
    }

    //유튜브 형식이면
    if (id != undefined) {
        //파일 존재 여부 및 용량 확인 (0kb 캐시 방지)
        const filePath = `./data/video/yt/${id}.mp4`;
        let useCache = false;

        if (fs.existsSync(filePath)) {
            const stats = fs.statSync(filePath);
            if (stats.size > 0) {
                useCache = true;
            } else {
                console.log(`[dl.js] 0kb 캐시 파일 발견, 재다운로드 진행: ${id}.mp4`);
                // 잔여 0kb 파일 삭제 (옵션)
                try { fs.unlinkSync(filePath); } catch (e) { }
            }
        }

        if (useCache) {
            console.log(`[dl.js] 유효한 캐시 파일 발견, 바로 스트리밍: ${id}.mp4`);
            //파일이 존재하면 스트림 형식으로 호출
            res.setHeader("Content-Type", "video/mp4");
            fs.createReadStream(filePath).pipe(res);
        } else {
            console.log(`[dl.js] 다운로드 시작: ${id}`);
            download(id).then(() => {
                console.log(`[dl.js] 다운로드 콜백 완료, 스트리밍 시작: ${id}.mp4`);
                res.setHeader("Content-Type", "video/mp4");
                fs.createReadStream(filePath).pipe(res);
            }).catch(error => {
                console.log(`[dl.js] 다운로드 실패: ${error.message}`);
                if (!res.headersSent) {
                    res.status(500).send({
                        message: error.message
                    })
                }
            })
        }
    } else {
        console.log(`[dl.js] 유튜브 영상이 아님`);
        res.status(400).send({
            message: '유튜브 영상이 아닙니다.'
        })
        return
    }
})

function download(id) {
    return new Promise((resolve, reject) => {
        //폴더가 없으면 생성
        const dir = './data/video/yt';
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }

        const outputPath = `${dir}/${id}.mp4`;

        // 로컬 yt-dlp 바이너리 실행 
        console.log(`yt-dlp 다운로드 시작: ${id}`);
        execFile(ytDlpPath, [
            `https://www.youtube.com/watch?v=${id}`,
            '-f', 'best[ext=mp4]/best',
            '-o', outputPath
        ], (error, stdout, stderr) => {
            if (stdout) console.log(`[yt-dlp stdout] ${stdout}`);
            if (stderr) console.error(`[yt-dlp stderr] ${stderr}`);

            if (error) {
                console.error(`yt-dlp 실행 중 에러 발생: ${error.message}`);
                reject(error);
            } else {
                console.log(`yt-dlp 다운로드 완료: ${outputPath}`);
                resolve();
            }
        });
    });
}

module.exports = router;
