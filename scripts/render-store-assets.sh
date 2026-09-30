#!/bin/sh
# Renders Chrome Web Store screenshots and promo tile into store/assets/ using headless Chrome
# and the demo settings in store/assets/src/mock-chrome.js. macOS; uses a throwaway profile.
set -u
cd "$(dirname "$0")/.."
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
PORT=8765
B="http://127.0.0.1:$PORT/store/assets/src"

python3 -m http.server $PORT --bind 127.0.0.1 --directory . >/dev/null 2>&1 &
SERVER=$!
trap 'kill $SERVER 2>/dev/null' EXIT
sleep 1

enc() { python3 -c 'import sys,urllib.parse;print(urllib.parse.quote(sys.argv[1], safe=""))' "$1"; }

# Headless Chrome writes the screenshot but may not exit on its own; stop it after 25s.
TIMEOUT='$pid = fork; exec @ARGV unless $pid; $SIG{ALRM} = sub { kill "TERM", $pid }; alarm 25; waitpid($pid, 0)'
shoot() { # file width height url
  profile=$(mktemp -d)
  perl -e "$TIMEOUT" "$CHROME" --headless=new --user-data-dir="$profile" --no-first-run \
    --hide-scrollbars --force-device-scale-factor=1 --blink-settings=preferredColorScheme=1 \
    --window-size="$2,$3" --virtual-time-budget=3000 --screenshot="$PWD/store/assets/$1" "$4" >/dev/null 2>&1
  rm -rf "$profile"
  echo "store/assets/$1"
}

shot() { # file headline subline inner-url
  shoot "$1" 1280 800 "$B/shot.html?h=$(enc "$2")&s=$(enc "$3")&src=$(enc "$4")"
}

shot screenshot-1-block.png "Stops personal sign-ins to AI services" \
  "Staff can only sign in to AI services like ChatGPT and Claude with work accounts." "$B/login.html"
shot screenshot-2-settings.png "Set up once, managed centrally" \
  "Push settings from Intune, Jamf or Google Admin. Users can't change them." "$B/page.html?page=options.html"
shot screenshot-3-sso.png "Points people to the right sign-in" \
  "Personal Apple, Google and Microsoft sign-ins are stopped, with a link to your company portal." \
  "$B/page.html?page=blocked.html&q=$(enc 'reason=sso&idp=apple')"
shoot promo-small-440x280.png 440 280 "$B/promo.html"
