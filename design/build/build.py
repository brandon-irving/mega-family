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
    ('LoginOpening', '1 · Loading: your MEGA paces “Opening chats” (never blank)', {'step': 'opening'}),
    ('Login', '2 · Welcome: brand block centered, buttons in the thumb zone', {}),
    ('LoginSheet', '3 · Sign in: Apple, Google, email + password', {'step': 'welcome', 'sheet': 'signin'}),
    ('LoginCreate', '3b · Create account (from Make my MEGA)', {'step': 'welcome', 'sheet': 'create', 'form': 'filled'}),
    ('LoginDemo', 'Dev builds: demo accounts', {'step': 'welcome', 'sheet': 'demo', 'build': 'dev'}),
    ('LoginInvite', '4 · I have an invite: paste right under the instructions', {'step': 'invite'}),
    ('LoginInviteHelp', '4b · Until the G8 camera build: “No link yet?” card', {'step': 'invite', 'scan': 'later'}),
    ('LoginScan', '5 · Scan the QR code (camera: G8 build)', {'step': 'scan'}),
    ('LoginPreview', '6 · Adult invite: keep or change the MEGA Admin made', {'step': 'preview'}),
    ('LoginPreviewKid', '6b · Kid invite: their MEGA is ready; a grown-up types the code', {'step': 'preview', 'who': 'kid'}),
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
  <dc-import name="{name}"{attrs} hint-size="390px,844px"></dc-import>
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
def write_wrappers(name, boards):
    for stem, title, props in boards:
        if stem == name:
            continue
        attrs = ''.join(f' {k}="{v}"' for k, v in props.items())
        open(f'{S}/mega-screens/project/{stem}.dc.html', 'w').write(WRAPPER.format(name=name, title=title.replace('&', '&amp;'), attrs=attrs))
write_wrappers('Login', LOGIN_BOARDS)

ROW_Y, GAP = 10112, 470
cpath = S + '/mega-screens/project/canvas.json'
canvas = json.load(open(cpath))
for i, (stem, title, _) in enumerate(LOGIN_BOARDS):
    f = stem + '.dc.html'
    canvas['boards'][f] = {'x': i * GAP, 'y': ROW_Y, 'w': 390, 'h': 844, 'title': title, 'is_interactive': True}
    if f not in canvas['order']:
        canvas['order'].append(f)
canvas['notes']['screen9'] = {'x': 0, 'y': ROW_Y - 260, 'text': 'Screen 9 · Sign in and joining', 'kind': 'title1', 'maxW': len(LOGIN_BOARDS) * GAP - 80}
canvas['notes']['screen9defaults'] = {'x': len(LOGIN_BOARDS) * GAP, 'y': ROW_Y, 'w': 420, 'fill': 'orange', 'size': 's', 'text':
    'Owner feedback, Oct 28 (all applied here)\n'
    '• No empty band above MEGA: Hub stands in a spotlight and the brand block is centered above the buttons, which sit in the thumb zone (Reddit, Brink and Once on Mobbin).\n'
    '• The sheet offers Apple and Google first, then email + password with Show and Forgot password (Polarsteps, Fiverr, Cal AI). Make my MEGA opens it on Create account.\n'
    '• Loading is never blank: your MEGA paces back and forth on “Opening chats”, centered.\n'
    '• Invite: the paste field and Continue sit right under the instructions, with an example link under the field (Discord). Until the G8 camera build, the QR card is a “No link yet?” help card.\n'
    '• Adults and kids get different invite screens, chosen from the invite. Admin makes each person’s MEGA when inviting; adults keep or change it (Flighty-style personal invite), kids can’t change it at join and a grown-up types the parent code.'}
json.dump(canvas, open(cpath, 'w'), ensure_ascii=False)
print('built login')

# Screens 10–12 (Oct 27): kids (homework, routines, Mega Bucks), the Store, calendar layers and gift ideas.
# Same shape as the sign-in row: one template per row plus thin wrapper boards, all listed here.
store_parts = compact(json.load(open(A + '/looks/store.json')))
store_live = open('store-live.js').read()
thread_html, thread_js = open('thread.html').read(), open('thread.js').read()
def fill(name, extra=()):
    t = open(name + '.template.html').read().replace('__THREAD__\n', thread_html).replace('__THREAD_JS__', thread_js)
    t = t.replace('__SPRITE_LIVE__', live).replace('__STORE__', store_parts).replace('__STORE_LIVE__', store_live).replace('__FAMILY_DATA__', family_data)
    for k, v in extra:
        t = t.replace(k, v)
    open(f'{S}/mega-screens/project/{name}.dc.html', 'w').write(t)
    assert '__' not in t.replace('__proto', ''), name
fill('Kids')
fill('Store', [('__ROOM__', compact(json.load(open(A + '/room/room.json')))), ('__ITEMS__', compact(items)), ('__BASE__', json.dumps(bases[0])), ('__ZAP__', compact(zap))])
fill('Calendar')

KIDS_BOARDS = [
    ('KidsSnap', '1 · Parent snaps the homework', {'step': 'snap'}),
    ('Kids', '2 · MEGA reads it → make practice', {}),
    ('KidsPractice', '3 · Kid practice, one question at a time', {'step': 'practice'}),
    ('KidsHint', '3b · Hint: a guiding question, never the answer', {'step': 'practice', 'hint': 'on'}),
    ('KidsDone', '4 · Practice finished (kid)', {'step': 'done'}),
    ('KidsSummary', '5 · Parent summary → release Mega Bucks', {'step': 'summary'}),
    ('KidsChore', '6 · Chore reminder with Done (kid)', {'step': 'chore'}),
    ('KidsChoreApprove', '6b · Parent checks the chore → release', {'step': 'choreApprove'}),
    ('KidsBedtime', '7 · Bedtime: pack for tomorrow', {'step': 'bedtime'}),
    ('KidsMorning', '8 · Morning routine, one step per tap', {'step': 'morning'}),
    ('KidsBucks', '9 · Mega Bucks arrive (kid)', {'step': 'bucks'}),
    ('KidsIntro', '10 · Kid’s first open: MEGA says hi (never an empty chat) · the one kid composer', {'step': 'intro'}),
    ('KidsTyping', '10b · The kid composer while typing (nothing cut off)', {'step': 'intro', 'typing': 'on'}),
]
STORE_BOARDS = [
    ('StoreRoom', '1 · Twin 1’s room → Store', {'step': 'room'}),
    ('Store', '2 · Furniture (basic set free)', {}),
    ('StoreStickers', '3 · Stickers', {'tab': 'stickers'}),
    ('StoreColors', '4 · Colors: try it on before buying', {'tab': 'colors'}),
    ('StoreAntennas', '5 · Antennas', {'tab': 'antennas'}),
    ('StoreEyes', '6 · Eyes: anime (Muse Image) + eye colors · not enough yet', {'tab': 'eyes', 'balance': '3'}),
    ('StoreConfirm', '7 · Buy sheet', {'tab': 'antennas', 'sheet': 'confirm'}),
    ('StoreBought', '8 · Bought furniture → Decorate', {'sheet': 'bought'}),
    ('StoreTray', '9 · New furniture in the Decorate tray', {'step': 'tray', 'sheet': 'bought'}),
]
CAL_BOARDS = [
    ('Calendar', '1 · Week: household + your private layer (Admin)', {}),
    ('CalPartner', '1b · Same day, Partner’s view (no Dentist)', {'viewer': 'partner'}),
    ('CalShare', '2 · Share suggestion (owner taps)', {'step': 'share'}),
    ('CalClash', '3 · Clash → one fix, waiting for approval', {'step': 'clash'}),
    ('CalClashDone', '3b · Approved', {'step': 'clash', 'approved': 'yes'}),
    ('CalAfter', '3c · Calendar after approval', {'approved': 'yes'}),
    ('CalGifts', '4 · Birthday gift ideas from shared info', {'step': 'gifts'}),
]
NOTES = {
    'screen10': ('Screen 10 · Kids: homework, routines, Mega Bucks', KIDS_BOARDS,
        'Defaults to confirm\n• Homework: a parent photographs the sheet in their own chat; MEGA (Muse Spark, image input) writes 3–5 new questions at the kid\'s level.\n• Kids get hints (a guiding question), never the answer.\n• Parents get a summary card and choose how many Mega Bucks to release (practice 5, chore 3 by default). Only Admin and Partner can release.\n• Bedtime prep reads tomorrow\'s household events; the morning routine is 4 steps set by a parent.\n• The chore push uses the Screen 6 kid push (54pt buttons, quiet hours).'),
    'screen11': ('Screen 11 · The Store', STORE_BOARDS,
        'Defaults to confirm\n• Reached from the kid\'s own room (Store button with the balance).\n• Free from the start: bed, desk, lamp, rug, and the 6 shell colors on offer today. Store-only: other furniture (4–8), stickers (5), new colors (10), antennas (12), eye colors (10), anime eyes (15). Prices are config.\n• Eyes (owner, Oct 27): eye colors (Pink, Gold, Mint, Lilac, Ember) recolor the standard eyes in every face (open, happy, wink, closed). One pair of anime eyes was made with Muse Image and downscaled to the visor; it swaps only the resting eyes.\n• Colors, antennas and eyes are tried on live on the kid\'s own MEGA before buying (real sprite engine).\n• Bought furniture lands in the Decorate tray marked NEW.\n• Posters stay free and out of the Store (made with Muse Image) — confirmed by the owner, Oct 27.\n• Adults don\'t have a Store (their MEGA looks stay free).'),
    'screen12': ('Screen 12 · Calendar and gift ideas', CAL_BOARDS,
        'Defaults to confirm\n• Two layers: Household (everyone) and Only you (private, dashed, lock). Partner\'s view never shows Admin\'s Dentist.\n• MEGA may suggest sharing; only the owner\'s tap shares.\n• Hub checks household events only. The Dentist overlapping soccer practice is never flagged (the negative control).\n• A clash gets one fix, labelled as from Hub (AI), with before/after. Admin approves clash fixes (owner, Oct 27); nothing changes until then.\n• Gift ideas use only shared info; products come from web search (G4).'),
}
GAP = 470
for (note_id, (heading, boards, sticky)), row_y, name in zip(NOTES.items(), (11376, 12640, 13904), ('Kids', 'Store', 'Calendar')):
    write_wrappers(name, boards)
    for i, (stem, title, _) in enumerate(boards):
        f = stem + '.dc.html'
        canvas['boards'][f] = {'x': i * GAP, 'y': row_y, 'w': 390, 'h': 844, 'title': title, 'is_interactive': True}
        if f not in canvas['order']:
            canvas['order'].append(f)
    canvas['notes'][note_id] = {'x': 0, 'y': row_y - 260, 'text': heading, 'kind': 'title1', 'maxW': len(boards) * GAP - 80}
    canvas['notes'][note_id + 'defaults'] = {'x': len(boards) * GAP, 'y': row_y, 'w': 420, 'text': sticky, 'fill': 'orange', 'size': 's'}
json.dump(canvas, open(cpath, 'w'), ensure_ascii=False)
print('built kids, store, calendar')
