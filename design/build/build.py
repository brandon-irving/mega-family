# Builds HQ.dc.html and Room.dc.html from templates + exported data + uploaded asset ids.
import json, sys
S = sys.argv[1]
A = S + '/mega-screens/assets'
walker = open('walker.js').read()
hq_blobs = json.load(open('blobs.json'))
room_blobs = json.load(open('room_blobs.json'))
compact = lambda o: json.dumps(o, separators=(',', ':'), ensure_ascii=False)

t = open('HQ.template.html').read()
sprites = {k: v for k, v in hq_blobs.items() if k != 'hq_room'}
t = t.replace('__ROOM__', hq_blobs['hq_room']).replace('__SPRITES__', compact(sprites)).replace('__LAYOUT__', compact(json.load(open(A + '/hq/hq.json')))).replace('__WALKER__', walker)
open(S + '/mega-screens/project/HQ.dc.html', 'w').write(t)

t = open('Room.template.html').read()
items = {k[5:]: v for k, v in room_blobs.items() if k.startswith('item_')}
bases = [room_blobs[f'room_base_{i}'] for i in range(3)]
zap = {k[7:]: v for k, v in hq_blobs.items() if k.startswith('violet_')}
t = (t.replace('__ROOM__', compact(json.load(open(A + '/room/room.json')))).replace('__ITEMS__', compact(items))
      .replace('__BASES__', compact(bases)).replace('__ZAP__', compact(zap)).replace('__POSTER_LARGE__', room_blobs['poster_large']).replace('__WALKER__', walker))
open(S + '/mega-screens/project/Room.dc.html', 'w').write(t)
for f in ['HQ', 'Room']:
    assert '__' not in open(f'{S}/mega-screens/project/{f}.dc.html').read().replace('__proto', ''), f
print('built')

t = open('Profile.template.html').read()
# Colour maths comes straight from the engine, so the board shades exactly like the app.
eng = open('/Users/brandonirving/products/mega/prototypes/megasprite/pixel-paint.mjs').read()
shades_src = eng[eng.index('function hexToHsl'):eng.index('/** Expand')].replace('export function', 'function')
stickers = {'star': 'a509b7da6f93811f29bf9e84560af70f', 'heart': 'ef08bdd73525cdfac56fe3c437a18b9c', 'leaf': '6729bb22fb50e334dd97a073fa44e53a', 'bolt': 'f4bb0c6f1f0fcae62475f582a31df06e'}
looks_data = 'const LOOKS = ' + compact(json.load(open(A + '/looks/looks.json'))) + ';\nconst STICKER_ART = ' + compact(stickers) + ';\n' + shades_src
live = looks_data + '\n' + open('sprite-live.js').read()
themes = open('themes.js').read()
t = t.replace('__LOOKS_DATA__\n', '').replace('__SPRITE_LIVE__', live)
open(S + '/mega-screens/project/Profile.dc.html', 'w').write(t)
assert '__' not in t.replace('__proto', '')
print('built profile')

family_data = open('family-data.js').read()
t = open('Family.template.html').read().replace('__SPRITE_LIVE__', live).replace('__FAMILY_DATA__', family_data)
open(S + '/mega-screens/project/Family.dc.html', 'w').write(t)
assert '__' not in t.replace('__proto', '')
print('built family')

t = open('Onboard.template.html').read().replace('__SPRITE_LIVE__', live).replace('__THEMES__', themes)
open(S + '/mega-screens/project/Onboard.dc.html', 'w').write(t)
assert '__' not in t.replace('__proto', '')
print('built onboarding')

t = open('Push.template.html').read().replace('__SPRITE_LIVE__', live)
open(S + '/mega-screens/project/Push.dc.html', 'w').write(t)
assert '__' not in t.replace('__proto', '')
print('built push')

t = open('Settings.template.html').read().replace('__SPRITE_LIVE__', live).replace('__THEMES__', themes)
open(S + '/mega-screens/project/Settings.dc.html', 'w').write(t)
assert '__' not in t.replace('__proto', '')
print('built settings')

t = open('Widgets.template.html').read().replace('__SPRITE_LIVE__', live).replace('__FAMILY_DATA__', family_data)
open(S + '/mega-screens/project/Widgets.dc.html', 'w').write(t)
assert '__' not in t.replace('__proto', '')
print('built widgets')

# Sign-in row: one template (Login) plus a thin wrapper board per state. This list is the single source
# for the wrappers and their canvas.json row (Screen 9).
walk_sprites = {k: v for k, v in hq_blobs.items() if k.split('_')[0] in ('teal', 'coral', 'violet')}
t = open('Login.template.html').read().replace('__SPRITES__', compact(walk_sprites)).replace('__SPRITE_LIVE__', live)
open(S + '/mega-screens/project/Login.dc.html', 'w').write(t)
assert '__' not in t.replace('__proto', '')

LOGIN_BOARDS = [
    ('LoginOpening', '1 · Opening (returning user)', {'step': 'opening'}),
    ('Login', '2 · Welcome', {}),
    ('LoginSheet', '3 · Sign-in sheet', {'step': 'welcome', 'sheet': 'signin'}),
    ('LoginDemo', 'Dev builds: demo accounts', {'step': 'welcome', 'sheet': 'demo', 'build': 'dev'}),
    ('LoginInvite', '4 · I have an invite', {'step': 'invite'}),
    ('LoginScan', '5 · Scan the QR code (camera: G8 build)', {'step': 'scan'}),
    ('LoginPreview', '6 · Invite preview (adult)', {'step': 'preview'}),
    ('LoginPreviewKid', '6b · Invite preview (kid → parent code)', {'step': 'preview', 'who': 'kid'}),
    ('LoginExpired', 'Invite expired', {'step': 'preview', 'invite': 'expired'}),
    ('LoginLocked', 'Kid: too many wrong codes', {'step': 'locked', 'who': 'kid'}),
    ('LoginFamily', '7 · Signed in, no family yet', {'step': 'family'}),
]
WRAPPER = '''<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>{title}</title>
<script src="./support.js"></script>
</head>
<body>
<x-dc>
<helmet>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&amp;family=Pixelify+Sans:wght@400;600&amp;display=swap" rel="stylesheet">
<style>
body{{margin:0;background:#0C0E11}}
</style>
</helmet>
<div style="width: 390px; height: 844px; overflow: hidden; background: #0C0E11">
  <dc-import name="Login"{attrs} hint-size="390px,844px"></dc-import>
</div>
</x-dc>
<script type="text/x-dc" data-dc-script data-props='{{"$preview":{{"width":390,"height":844}}}}'>
class Component extends DCLogic {{
  renderVals() {{
    return {{}};
  }}
}}
</script>
</body>
</html>
'''
for stem, title, props in LOGIN_BOARDS:
    if stem == 'Login':
        continue
    attrs = ''.join(f' {k}="{v}"' for k, v in props.items())
    open(f'{S}/mega-screens/project/{stem}.dc.html', 'w').write(WRAPPER.format(title=title.replace('&', '&amp;'), attrs=attrs))

ROW_Y, GAP = 10112, 470
cpath = S + '/mega-screens/project/canvas.json'
canvas = json.load(open(cpath))
for i, (stem, title, _) in enumerate(LOGIN_BOARDS):
    f = stem + '.dc.html'
    canvas['boards'][f] = {'x': i * GAP, 'y': ROW_Y, 'w': 390, 'h': 844, 'title': title, 'is_interactive': True}
    if f not in canvas['order']:
        canvas['order'].append(f)
canvas['notes']['screen9'] = {'x': 0, 'y': ROW_Y - 260, 'text': 'Screen 9 · Sign in and joining', 'kind': 'title1', 'maxW': len(LOGIN_BOARDS) * GAP - 80}
json.dump(canvas, open(cpath, 'w'), ensure_ascii=False)
print('built login')
