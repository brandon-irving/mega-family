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
eng = open(S + '/../prototypes/megasprite/pixel-paint.mjs').read()
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
def fill(name, extra=(), out=None):
    t = open(name + '.template.html').read().replace('__THREAD__\n', thread_html).replace('__THREAD_JS__', thread_js)
    t = t.replace('__SPRITE_LIVE__', live).replace('__STORE__', store_parts).replace('__STORE_LIVE__', store_live).replace('__FAMILY_DATA__', family_data)
    for k, v in extra:
        t = t.replace(k, v)
    open(f'{S}/mega-screens/project/{out or name}.dc.html', 'w').write(t)
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

# Screen 13 (owner, Oct 28): the onboarding chat. Sign up → the admin's MEGA opens the chat and asks what to
# call them → offers integrations one at a time (Gmail first, then a calendar, then schedule links) → hands
# off to the family steps (the Screen 5 Onboard boards). Same thread system as the Kids/Calendar rows.
fill('OnboardChat')
ONBOARD_CHAT_BOARDS = [
    ('OnboardChat', '1 · Right after sign-up: MEGA says hi and asks what to call you', {}),
    ('OnboardChatNamed', '2 · You answer; MEGA uses your name from now on', {'step': 'named'}),
    ('OnboardGmail', '3 · Gmail first: what MEGA reads, private until you share', {'step': 'gmail'}),
    ('OnboardGmailConnected', '3b · Connected (after Google’s consent screen)', {'step': 'gmailConnected'}),
    ('OnboardGmailFound', '4 · What it found → your private calendar · share suggestion', {'step': 'gmailFound'}),
    ('OnboardCalendar', '5 · A calendar: Google or this phone’s', {'step': 'calendar'}),
    ('OnboardIcs', '6 · Schedule links (school, teams)', {'step': 'ics'}),
    ('OnboardNext', '7 · On to the family (Screen 5 boards)', {'step': 'next'}),
]
write_wrappers('OnboardChat', ONBOARD_CHAT_BOARDS)
ROW13 = 15168
for i, (stem, title, _) in enumerate(ONBOARD_CHAT_BOARDS):
    f = stem + '.dc.html'
    canvas['boards'][f] = {'x': i * GAP, 'y': ROW13, 'w': 390, 'h': 844, 'title': title, 'is_interactive': True}
    if f not in canvas['order']:
        canvas['order'].append(f)
canvas['notes']['screen13'] = {'x': 0, 'y': ROW13 - 260, 'text': 'Screen 13 · Onboarding chat (sign up → name → integrations)', 'kind': 'title1', 'maxW': len(ONBOARD_CHAT_BOARDS) * GAP - 80}
canvas['notes']['screen13defaults'] = {'x': len(ONBOARD_CHAT_BOARDS) * GAP, 'y': ROW13, 'w': 420, 'fill': 'orange', 'size': 's', 'text':
    'Defaults to confirm\n• Flow (owner, Oct 28): sign up → chat opens → "What should I call you?" → integrations one at a time → family steps (Screen 5).\n• Your MEGA starts with a default look; tap its badge in the chat header to customize it (Profile).\n• Gmail first, read-only (gmail.readonly). Google shows an "unverified app" warning while the app is in testing; only listed test users can connect, and access lapses after 7 days until re-consent.\n• Calendar: Google Calendar (calendar.readonly) or this phone\'s calendar (expo-calendar, already in the build). Then .ics links from schools and teams.\n• Everything found lands on YOUR private calendar. MEGA may suggest sharing; only your tap shares.\n• Each card has Not now; skipping never blocks the next step. Everything is also in Settings later.\n• Demo uses a synthetic Gmail account with made-up school, dentist and bill emails (hackathon rule: synthetic data only).'}
json.dump(canvas, open(cpath, 'w'), ensure_ascii=False)
print('built onboarding chat')

# Screen 14 (G4, CONTRACT v0.15, Oct 28): search, weather and travel cards in chat, Places, a kid's searches
# for parents, and picking a saved place for an event. Its own template (cards not in thread.html).
fill('Integrations')
INTEGRATION_BOARDS = [
    ('Integrations', '1 · Search answer with sources (adult)', {}),
    ('SearchKid', '2 · Kid search: kid sizes, at most 3 kid-safe sources', {'step': 'searchKid'}),
    ('SearchKidRephrased', '2b · Kid search, rephrased: “I looked up something close to that instead.”', {'step': 'searchKidRephrased'}),
    ('SearchKidBlocked', '2c · Kid search, blocked: “I can’t look that up. Ask a grown-up.”', {'step': 'searchKidBlocked'}),
    ('Weather', '3 · Weather card: now, next hours, high/low', {'step': 'weather'}),
    ('WeatherAlert', '3b · Weather alert (NWS severity on top)', {'step': 'weatherAlert'}),
    ('Travel', '4 · Leave by, with traffic (matches the leave-by push)', {'step': 'travel'}),
    ('TravelNotSetUp', '4b · Travel time isn’t set up yet (never a made-up time)', {'step': 'travelNotSetUp'}),
    ('Places', '5 · Places (adults: Family → Places)', {'step': 'places'}),
    ('PlaceSheet', '5b · Add / edit a place (sheet with Close)', {'step': 'placeSheet'}),
    ('PlacesKid', '5c · Kid: Places read-only', {'step': 'placesKid'}),
    ('SearchLog', '6 · Parent: Twin 1’s blocked and changed searches', {'step': 'searchLog'}),
    ('EventPlace', '7 · Event: pick a saved place (or type one)', {'step': 'eventPlace'}),
]
write_wrappers('Integrations', INTEGRATION_BOARDS)
ROW14 = 16432
for i, (stem, title, _) in enumerate(INTEGRATION_BOARDS):
    f = stem + '.dc.html'
    canvas['boards'][f] = {'x': i * GAP, 'y': ROW14, 'w': 390, 'h': 844, 'title': title, 'is_interactive': True}
    if f not in canvas['order']:
        canvas['order'].append(f)
canvas['notes']['screen14'] = {'x': 0, 'y': ROW14 - 260, 'text': 'Screen 14 · Search, weather and travel', 'kind': 'title1', 'maxW': len(INTEGRATION_BOARDS) * GAP - 80}
canvas['notes']['screen14defaults'] = {'x': len(INTEGRATION_BOARDS) * GAP, 'y': ROW14, 'w': 420, 'fill': 'orange', 'size': 's', 'text':
    'Defaults to confirm\n• Search cards show the answer and tappable sources (title + site). Kids get kid sizes and at most 3 kid-safe sources.\n• A rephrased kid search says so above the answer; a blocked one shows only "I can\'t look that up. Ask a grown-up." and searches nothing.\n• Parents see only blocked and changed searches (Family → kid → Searches), when "Tell me about blocked searches" is on.\n• Weather: Open-Meteo forecast for a saved place; NWS alerts on top, colored by severity. Only Severe/Extreme alerts push.\n• Travel: "Leave by" uses Mapbox traffic between saved places, same words as the leave-by push. Without a Mapbox key the card says travel time isn\'t set up and never guesses.\n• Places are household data, edited by adults; kids read-only. MEGA never uses the phone\'s location.\n• Sample places are public landmarks; Home is a placeholder address.'}
json.dump(canvas, open(cpath, 'w'), ensure_ascii=False)
print('built integrations')

# Screen 15 (G4b, Oct 28): real products for gift ideas (product catalog), price drops on the gift list, an
# adult's shopping question, UV + air quality, and public holidays. One template; its main board is
# GiftsProducts (the template is Shopping.template.html), with wrappers for the other states.
fill('Shopping', out='GiftsProducts')
SHOP_BOARDS = [
    ('GiftsProducts', '1 · Gift ideas with real products (price, store, Open)', {}),
    ('GiftsNoCatalog', '1b · Store prices not set up: web links, no made-up prices', {'step': 'giftsNoCatalog'}),
    ('PriceDrop', '2 · Price drop on the gift list (adults only)', {'step': 'priceDrop'}),
    ('PriceDropPush', '2b · Price-drop push: Open in store / Stop watching', {'step': 'priceDropPush'}),
    ('ShopResults', '3 · “Find a rain jacket for Twin 1 under $40”', {'step': 'shopResults'}),
    ('ShopEmpty', '3b · Nothing under the budget', {'step': 'shopEmpty'}),
    ('ShopNotSetUp', '3c · Store search not set up (never a guessed price)', {'step': 'shopNotSetUp'}),
    ('WeatherAir', '4 · Weather card + UV and air quality', {'step': 'weatherAir'}),
    ('WeatherAirTips', '4b · UV and air tips in chat', {'step': 'airTips'}),
    ('WeatherAirPush', '4c · Air push (loud) + UV tip (quiet)', {'step': 'airPush'}),
    ('HolidayAsk', '5 · The evening before a holiday: pause routines?', {'step': 'holidayAsk'}),
    ('HolidayPaused', '5b · Paused for the day', {'step': 'holidayPaused'}),
    ('HolidayKid', '5c · Kid bedtime: no school tomorrow', {'step': 'holidayKid'}),
    ('HolidayCalendar', '5d · Calendar: holiday marker, paused routine', {'step': 'holidayCalendar'}),
]
write_wrappers('GiftsProducts', SHOP_BOARDS)
ROW15 = 17696
for i, (stem, title, _) in enumerate(SHOP_BOARDS):
    f = stem + '.dc.html'
    canvas['boards'][f] = {'x': i * GAP, 'y': ROW15, 'w': 390, 'h': 844, 'title': title, 'is_interactive': True}
    if f not in canvas['order']:
        canvas['order'].append(f)
canvas['notes']['screen15'] = {'x': 0, 'y': ROW15 - 260, 'text': 'Screen 15 · Shopping, air and holidays', 'kind': 'title1', 'maxW': len(SHOP_BOARDS) * GAP - 80}
canvas['notes']['screen15defaults'] = {'x': len(SHOP_BOARDS) * GAP, 'y': ROW15, 'w': 420, 'fill': 'orange', 'size': 's', 'text':
    'Defaults to confirm\n'
    '• Gift ideas show up to 2 real products each (picture, price, store, Open) from a product catalog. No picture from the store → the pixel gift box. Store names and pictures here are made-up stand-ins.\n'
    '• MEGA only searches and reads prices. It never buys; Open goes to the store.\n'
    '• Price drops: MEGA watches items added to a gift list and tells Admin and Partner when one gets cheaper. The birthday kid never gets it.\n'
    '• Not set up → honest copy and web links without prices; never a guessed price.\n'
    '• UV (max today, with the WHO level word) and US AQI (EPA level word, short form) sit on the weather card, colored ok / warn / danger. A tip goes out when UV ≥ 8 during an event, or AQI > 100 during an outdoor event; AQI over 150 is a normal push, everything else quiet. Sample numbers are summer values (late-October UV is low).\n'
    '• Holidays come from a public-holiday calendar. The evening before, MEGA asks a parent once whether to pause routines and chores; the kids hear it at bedtime. School closures still come from the school\'s .ics link.'}
json.dump(canvas, open(cpath, 'w'), ensure_ascii=False)
print('built shopping')

# Screen 16 (G5, CONTRACT v0.17, Oct 29): Settings → Connected accounts (with the testing-mode lapse and the
# disconnect sheet), the in-chat reconnect card, the honest "Google isn't set up" cards, pasting a schedule link,
# picking phone calendars, removing found email items, and the Profile pages behind "Rules and limits" and
# "Activity". One template; its main board is SettingsAccounts (the template is Accounts.template.html).
fill('Accounts', out='SettingsAccounts')
ACCOUNT_BOARDS = [
    ('SettingsAccounts', '1 · Settings → Connected accounts', {}),
    ('SettingsAccountsLapse', '1b · Google lapsed (testing: every 7 days) → Reconnect', {'step': 'accountsLapse'}),
    ('SettingsDisconnect', '1c · Disconnect Gmail? (sheet with Close)', {'step': 'accountsDisconnect'}),
    ('Reconnect', '2 · In chat: Google needs you to sign in again', {'step': 'reconnect'}),
    ('ConnectNotSetUp', '3 · Google not set up: no dead button, phone calendar still offered', {'step': 'notSetUp'}),
    ('IcsPaste', '4 · Paste a schedule link', {'step': 'icsPaste'}),
    ('IcsPasteError', '4b · That link didn’t work', {'step': 'icsError'}),
    ('IcsPasteAdded', '4c · Added, updates every few hours', {'step': 'icsAdded'}),
    ('PhoneCalendarPick', '5 · This phone’s calendar: pick which (sheet)', {'step': 'phonePick'}),
    ('PhoneCalendarDenied', '5b · Calendar permission denied', {'step': 'phoneDenied'}),
    ('PhoneCalendarWeb', '5c · On the web: open MEGA on your phone', {'step': 'phoneWeb'}),
    ('MailFoundRemove', '6 · Found in Gmail: one removed · share suggestion', {'step': 'mailRemove'}),
    ('MailFoundNone', '6b · Nothing needs you (never an empty card)', {'step': 'mailNone'}),
    ('ProfileRules', '7 · Profile → Rules and limits (parent edits Twin 1’s)', {'step': 'rules'}),
    ('ProfileRulesKid', '7b · Twin 1 sees the rules, read-only', {'step': 'rulesKid'}),
    ('ProfileActivity', '8 · Profile → Activity: what Teal did, who decided, what it learned', {'step': 'activity'}),
]
write_wrappers('SettingsAccounts', ACCOUNT_BOARDS)
ROW16 = 18960
for i, (stem, title, _) in enumerate(ACCOUNT_BOARDS):
    f = stem + '.dc.html'
    canvas['boards'][f] = {'x': i * GAP, 'y': ROW16, 'w': 390, 'h': 844, 'title': title, 'is_interactive': True}
    if f not in canvas['order']:
        canvas['order'].append(f)
canvas['notes']['screen16'] = {'x': 0, 'y': ROW16 - 260, 'text': 'Screen 16 · Accounts, HQ and profile pages', 'kind': 'title1', 'maxW': len(ACCOUNT_BOARDS) * GAP - 80}
canvas['notes']['screen16defaults'] = {'x': len(ACCOUNT_BOARDS) * GAP, 'y': ROW16, 'w': 420, 'fill': 'orange', 'size': 's', 'text':
    'Defaults to confirm\n'
    '• Connected accounts lists each source with a status dot (Connected / Needs you to sign in again / Couldn\'t check lately), what it reads as, and when it last checked. Schedule links show the site, never the full link (it can carry a private token).\n'
    '• Testing mode: Google asks again every 7 days. MEGA posts one Reconnect card in your chat and the Settings row turns gold; nothing is read until you reconnect.\n'
    '• Disconnect asks first, then stops reading and removes what MEGA found. Anything you already shared stays shared.\n'
    '• Google not set up: the Gmail card says so with only Not now (no button that can\'t work); the calendar card still offers this phone\'s calendar.\n'
    '• Found items and imported calendars land on YOUR private calendar; MEGA may suggest sharing, only your tap shares. Removing a found item leaves a one-line "Removed" note.\n'
    '• Rules and limits: parents edit a kid\'s quiet hours, buzzes a day, web search, homework mode, blocked topics and what parents hear; safety concerns are always on. The kid sees the same page read-only.\n'
    '• Activity: each action shows who decided (Rule, MEGA (AI) or You) and why; What it learned has Forget. The Gmail address, school and team links are made-up stand-ins.'}
json.dump(canvas, open(cpath, 'w'), ensure_ascii=False)
print('built accounts')

# Screen 17 (G8, CONTRACT v0.18, Oct 29): the states the G8 native build needs beyond the happy paths: the QR
# scanner (camera denied, not a MEGA invite, found), the homework viewfinder (starting, denied, failed), Paste
# feedback under the invite field, and the widget states (three items, lock-screen redaction, a kid's kid-safe
# view, empty, stale, signed out). No new templates: wrappers over Login, Kids and Widgets with new props.
SCAN_BOARDS = [
    ('ScanDenied', '1 · Scan: camera off → Open Settings / Paste a link / Not now', {'step': 'scan', 'camera': 'denied'}),
    ('ScanNotInvite', '1b · Scan: “That QR code isn’t a MEGA invite” (keeps scanning)', {'step': 'scan', 'camera': 'notInvite'}),
    ('ScanFound', '1c · Scan: found it → opening the invite', {'step': 'scan', 'camera': 'found'}),
    ('PasteNothing', '2 · Paste: nothing to paste yet', {'step': 'invite', 'pasted': 'nothing'}),
    ('PasteNotInvite', '2b · Paste: not a MEGA invite link', {'step': 'invite', 'pasted': 'notInvite'}),
]
SNAP_BOARDS = [
    ('SnapStarting', '3 · Homework camera starting (shutter waits)', {'step': 'snap', 'cam': 'starting'}),
    ('SnapDenied', '3b · Homework camera off → choose a photo / Open Settings', {'step': 'snap', 'cam': 'denied'}),
    ('SnapFailed', '3c · Camera didn’t start → choose a photo / try again', {'step': 'snap', 'cam': 'failed'}),
]
WIDGET_STATE_BOARDS = [
    ('WidgetsThree', '4 · Medium: three things in the next 2 hours (in 30 min · in 1h · in 2h)', {'who': 'admin', 'view': 'home', 'state': 'three'}),
    ('WidgetsLockPrivate', '4b · Lock screen: a private event never shows its title', {'who': 'admin', 'view': 'lock', 'state': 'private'}),
    ('WidgetsKidSafe', '4c · Kid (Zap): only kid-safe, household items', {'who': 'kid', 'view': 'home', 'state': 'kidSafe'}),
    ('WidgetsEmpty', '4d · Nothing coming up and nothing to say: a calm line', {'who': 'admin', 'view': 'home', 'state': 'empty'}),
    ('WidgetsStale', '4e · Stale (app not opened for 8 hours)', {'who': 'admin', 'view': 'home', 'state': 'stale'}),
    ('WidgetsSignedOut', '4f · Signed out: nothing personal', {'who': 'admin', 'view': 'home', 'state': 'signedOut'}),
    ('WidgetsLockSignedOut', '4g · Lock screen, signed out', {'who': 'admin', 'view': 'lock', 'state': 'signedOut'}),
]
write_wrappers('Login', SCAN_BOARDS)
write_wrappers('Kids', SNAP_BOARDS)
write_wrappers('Widgets', WIDGET_STATE_BOARDS)
ROW17 = 20224
STATE_BOARDS = SCAN_BOARDS + SNAP_BOARDS + WIDGET_STATE_BOARDS
for i, (stem, title, _) in enumerate(STATE_BOARDS):
    f = stem + '.dc.html'
    canvas['boards'][f] = {'x': i * GAP, 'y': ROW17, 'w': 390, 'h': 844, 'title': title, 'is_interactive': True}
    if f not in canvas['order']:
        canvas['order'].append(f)
canvas['notes']['screen17'] = {'x': 0, 'y': ROW17 - 260, 'text': 'Screen 17 · Widgets, scan, snap and paste states', 'kind': 'title1', 'maxW': len(STATE_BOARDS) * GAP - 80}
canvas['notes']['screen17defaults'] = {'x': len(STATE_BOARDS) * GAP, 'y': ROW17, 'w': 420, 'fill': 'orange', 'size': 's', 'text':
    'Defaults to confirm\n'
    '• Scanner: only a MEGA invite (mega://join/… or its bare code) opens anything; any other QR code says so and the camera keeps scanning. Camera off → Open Settings, Paste a link instead, Not now, stacked full width.\n'
    '• Paste: on iOS the system Paste button pastes without a prompt; elsewhere our Paste button may show the system prompt. Nothing to paste or not an invite shows a gold line under the field; the field keeps what you typed.\n'
    '• Homework camera: the shutter waits until the camera is ready; camera off or failed always offers Choose a photo instead. Photos are taken without location data.\n'
    '• Widgets: relative times ("in 30 min", "in 1h") are worked out by the widget from each event\'s start, so they stay right for hours without the app. Up to 3 things in the next 2 hours on the medium widget.\n'
    '• Lock screen: a private event shows only "Private event" (and is hidden while the phone is locked). A kid\'s widget shows only household items that involve them.\n'
    '• Empty, stale and signed out are calm lines, never blank. Signed out shows a sleeping grey MEGA and nothing personal.\n'
    '• No inline lock-screen line in this build (the line above the clock is the date); it can come with a later native build.'}
json.dump(canvas, open(cpath, 'w'), ensure_ascii=False)
print('built g8 states')
