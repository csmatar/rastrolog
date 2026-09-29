# docs/demo.tape: the source for docs/demo.gif. Committed so the GIF can be
# re-recorded whenever the output changes:
#
#     vhs docs/demo.tape        # https://github.com/charmbracelet/vhs
#
# Run from the repo root. Uses `uvx rastrolog` (the published package), so nothing
# needs to be installed beforehand. The sample log is docs/demo/access.log.gz
# (regenerate with `python3 docs/demo/make_demo_log.py`).
#
# The story: parse a log -> which pages AI tools touch -> classify a pasted user
# agent -> classify a referrer.

Output docs/demo.gif

Require uvx

Set Shell bash
Set FontSize 14
Set Width 1240
Set Height 1190
Set Padding 18
Set Theme "Dracula"
Set WindowBar Colorful
Set TypingSpeed 40ms

# Off camera: warm the uvx cache, silence the one-time nudge, truecolor output.
Hide
Type "cd docs/demo && export PS1='$ ' COLORTERM=truecolor RASTROLOG_NO_NUDGE=1 && uvx --refresh rastrolog --version >/dev/null 2>&1 && clear"
Enter
Sleep 3s
Show

# 1. AI crawlers and AI referrals in a (gzipped) nginx log
Type "uvx rastrolog parse access.log.gz"
Sleep 500ms
Enter
Sleep 6s

Hide
Type "clear"
Enter
Show

# 2. Which pages AI tools touch
Type "uvx rastrolog parse access.log.gz --by page --top 3"
Sleep 500ms
Enter
Sleep 4s

Hide
Type "clear"
Enter
Show

# 3. Classify a single user agent pasted from a log
Type "uvx rastrolog check "
Type@8ms "'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; GPTBot/1.4; +https://openai.com/gptbot'"
Sleep 500ms
Enter
Sleep 2500ms

# 4. ...or a referrer
Type "uvx rastrolog check https://chatgpt.com/"
Sleep 500ms
Enter
Sleep 4s
