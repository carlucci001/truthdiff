$ErrorActionPreference = 'Stop'
Set-Location 'C:/dev/truthdiff/output/playwright/truthdiff-demo'
$logo = 'C:/Users/carlf/Downloads/logo (3).png'
$filter = "[1:v]scale=360:-1,format=rgba,colorchannelmixer=aa=0.90[logo];[0:v][logo]overlay=x=(main_w-overlay_w)/2:y=16:format=auto[v]"
& ffmpeg -y -hide_banner -loglevel warning -i TruthDiff-demo.mp4 -i $logo -i narration.mp3 -filter_complex $filter -map '[v]' -map 2:a -c:v libx264 -preset fast -crf 19 -pix_fmt yuv420p -c:a aac -b:a 192k -af "apad=pad_dur=2,volume=1.2" -t 42 -movflags +faststart TruthDiff-demo-branded.mp4
if ($LASTEXITCODE -ne 0) { throw 'Branded video encoding failed' }
& ffprobe -v error -show_entries format=duration,size -show_entries stream=codec_name,codec_type,width,height -of json TruthDiff-demo-branded.mp4
& ffmpeg -y -hide_banner -loglevel error -i TruthDiff-demo-branded.mp4 -vf "fps=1/7,scale=640:360,tile=3x2" -frames:v 1 branded-review.jpg
