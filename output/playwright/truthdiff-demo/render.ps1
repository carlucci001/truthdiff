$ErrorActionPreference = 'Stop'
Set-Location 'C:/dev/truthdiff/output/playwright/truthdiff-demo'
& ffmpeg -y -hide_banner -loglevel warning -ss 2 -i walkthrough.webm -t 42 -vf "fps=30,scale=1600:800,pad=1600:900:0:0:color=0x070c12,drawbox=x=0:y=0:w=iw:h=ih:color=0x070c12:t=fill:enable='gte(t,36)',ass=captions.ass" -c:v libx264 -preset fast -crf 19 -pix_fmt yuv420p -movflags +faststart -an TruthDiff-demo.mp4
if ($LASTEXITCODE -ne 0) { throw 'Video encoding failed' }
& ffprobe -v error -show_entries format=duration,size -show_entries stream=codec_name,width,height -of json TruthDiff-demo.mp4
& ffmpeg -y -hide_banner -loglevel error -i TruthDiff-demo.mp4 -vf "fps=1/7,scale=640:360,tile=3x2" -frames:v 1 review.jpg
