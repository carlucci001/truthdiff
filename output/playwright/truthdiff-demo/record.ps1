$ErrorActionPreference = 'Stop'
$clipRoot = 'C:/dev/truthdiff/output/playwright/truthdiff-demo'
$cliArgs = @('--yes', '--package', '@playwright/cli', 'playwright-cli', '-s=truthdiff-video')
& npx.cmd @cliArgs run-code --filename "$clipRoot/reset.js"
& npx.cmd @cliArgs video-start "$clipRoot/walkthrough.webm" --size 1600x800
& npx.cmd @cliArgs run-code --filename "$clipRoot/actions.js"
& npx.cmd @cliArgs video-stop
