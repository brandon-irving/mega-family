// Screen 14 chat cards: search (Integrations, SearchKid, SearchKidRephrased, SearchKidBlocked), weather (Weather,
// WeatherAlert) and travel (Travel, TravelNotSetUp).
import { fireEvent, screen } from '@testing-library/react-native';
import { KID_SAFETY } from '@shared/config/kidSafety';
import { BUTTON_SIZES } from '@shared/config/theme';
import { renderWithTheme } from '@/test/renderWithTheme';
import { SEARCH_ADULT, SEARCH_KID_BLOCKED, SEARCH_KID_REPHRASED, TRAVEL_NOT_SET_UP, TRAVEL_OK, TZ, WEATHER, WEATHER_ALERT } from '@/test/g4Fixtures';
import { SearchCardView, TravelCardView, WeatherCardView } from './IntegrationCards';

const noop = () => {};

describe('Search card', () => {
  test('adult answer: "Teal looked it up", the answer, and each source as a tappable row with its domain', async () => {
    const onOpenSource = jest.fn();
    await renderWithTheme(<SearchCardView card={SEARCH_ADULT} megaName="Teal" isKid={false} onOpenSource={onOpenSource} />);
    expect(screen.getByText('Teal looked it up')).toBeTruthy();
    expect(screen.getByText(SEARCH_ADULT.answer)).toBeTruthy();
    expect(screen.getByText('Sources')).toBeTruthy();
    expect(screen.getByText('amnh.org')).toBeTruthy();
    expect(screen.getByText('nyctourism.com')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Hours and admission, amnh.org'));
    expect(onOpenSource).toHaveBeenCalledWith('https://www.amnh.org/plan-your-visit');
  });

  test('rephrased (kid): says it looked up something close instead, and quotes what it searched', async () => {
    await renderWithTheme(<SearchCardView card={SEARCH_KID_REPHRASED} megaName="Zap" isKid onOpenSource={noop} />, { role: 'kid' });
    expect(screen.getByText('I looked up something close to that instead.')).toBeTruthy();
    expect(screen.getByText('“Which animals are the most dangerous, for kids”')).toBeTruthy();
  });

  test('kid source rows are at least the kid button height', async () => {
    await renderWithTheme(<SearchCardView card={SEARCH_KID_REPHRASED} megaName="Zap" isKid onOpenSource={noop} />, { role: 'kid' });
    const row = screen.getByLabelText('Dangerous animals, kids.nationalgeographic.com');
    expect(row.props.style.minHeight).toBeGreaterThanOrEqual(BUTTON_SIZES.kid.height);
  });

  test('blocked (kid): the blocked line, no sources, and the note that grown-ups can see it', async () => {
    await renderWithTheme(<SearchCardView card={SEARCH_KID_BLOCKED} megaName="Zap" isKid onOpenSource={noop} />, { role: 'kid' });
    expect(screen.getByText(KID_SAFETY.blockedMessage.replace("'", '’'))).toBeTruthy();
    expect(screen.queryByText('Sources')).toBeNull();
    expect(screen.getByText('Your grown-ups can see searches like this one.')).toBeTruthy();
  });

  test('blocked (kid): no grown-ups note when the parents are not told (kid control off)', async () => {
    await renderWithTheme(<SearchCardView card={{ ...SEARCH_KID_BLOCKED, parentsTold: false }} megaName="Zap" isKid onOpenSource={noop} />, { role: 'kid' });
    expect(screen.queryByText('Your grown-ups can see searches like this one.')).toBeNull();
    await renderWithTheme(<SearchCardView card={{ ...SEARCH_KID_BLOCKED, parentsTold: undefined }} megaName="Zap" isKid onOpenSource={noop} />, { role: 'kid' });
    expect(screen.queryByText('Your grown-ups can see searches like this one.')).toBeNull();
  });

  test('a blocked card never shows sources, even if some came back', async () => {
    await renderWithTheme(<SearchCardView card={{ ...SEARCH_KID_BLOCKED, sources: SEARCH_ADULT.sources }} megaName="Zap" isKid onOpenSource={noop} />, { role: 'kid' });
    expect(screen.queryByText('amnh.org')).toBeNull();
  });
});

describe('Weather card', () => {
  test('place, now, five hours with icons, rain chance and high/low', async () => {
    await renderWithTheme(<WeatherCardView card={WEATHER} tz={TZ} />);
    expect(screen.getByText('Home · now')).toBeTruthy();
    expect(screen.getByText('Cloudy, rain later')).toBeTruthy();
    expect(screen.getByLabelText('63 degrees')).toBeTruthy(); // big "now": the current hour's forecast
    expect(screen.getByText('2 PM')).toBeTruthy();
    expect(screen.getByText('6 PM')).toBeTruthy();
    expect(screen.queryByText('7 PM')).toBeNull(); // five hours only (board)
    expect(screen.getByLabelText('Sunny')).toBeTruthy();
    expect(screen.getAllByLabelText('Rain')).toHaveLength(2);
    expect(screen.getByText('80%')).toBeTruthy();
    expect(screen.getByText('High 64° · Low 52°')).toBeTruthy();
    expect(screen.getByText('Open-Meteo')).toBeTruthy();
  });

  test('alert variant: the NWS event, severity, headline and when it ends, credited to the NWS', async () => {
    await renderWithTheme(<WeatherCardView card={WEATHER_ALERT} tz={TZ} />);
    expect(screen.getByText('Severe Thunderstorm Warning · Severe')).toBeTruthy();
    expect(screen.getByText('Damaging winds and hail possible near the soccer field.')).toBeTruthy();
    expect(screen.getByText('Until 6:15 PM')).toBeTruthy();
    expect(screen.getByText('National Weather Service')).toBeTruthy();
  });

  test('"now" is the live current temperature (nowF) when the card has one', async () => {
    await renderWithTheme(<WeatherCardView card={{ ...WEATHER, nowF: 66.4 }} tz={TZ} />);
    expect(screen.getByLabelText('66 degrees')).toBeTruthy();
    expect(screen.queryByLabelText('63 degrees')).toBeNull();
  });

  test('a card with only a summary never invents a temperature', async () => {
    await renderWithTheme(<WeatherCardView card={{ kind: 'weather', summary: 'I can’t get the weather right now.', at: 0 }} tz={TZ} />);
    expect(screen.getByText('I can’t get the weather right now.')).toBeTruthy();
    expect(screen.queryByText(/°/)).toBeNull();
  });
});

describe('Travel card', () => {
  test('leave-by with traffic and the usual time, from → to', async () => {
    await renderWithTheme(<TravelCardView card={TRAVEL_OK} tz={TZ} megaName="Teal" />);
    expect(screen.getByText('Teal · Travel')).toBeTruthy();
    expect(screen.getByText('Leave by 4:50 PM')).toBeTruthy();
    expect(screen.getByText('18 min with traffic (usually 14) · Soccer pickup')).toBeTruthy();
    expect(screen.getByText('Home')).toBeTruthy();
    expect(screen.getByText('Riverside Park Field')).toBeTruthy();
  });

  test('without an event title the minutes line has no suffix', async () => {
    await renderWithTheme(<TravelCardView card={{ ...TRAVEL_OK, eventTitle: undefined }} tz={TZ} megaName="Teal" />);
    expect(screen.getByText('18 min with traffic (usually 14)')).toBeTruthy();
  });

  test('On my way and Snooze 5 min answer the travel check, and the reply shows on the card', async () => {
    const onAnswer = jest.fn();
    await renderWithTheme(<TravelCardView card={TRAVEL_OK} tz={TZ} megaName="Teal" onAnswer={onAnswer} />);
    await fireEvent.press(screen.getByText('On my way'));
    expect(onAnswer).toHaveBeenCalledWith('on_my_way');
    await fireEvent.press(screen.getByText('Snooze 5 min'));
    expect(onAnswer).toHaveBeenCalledWith('snooze_5');
    await renderWithTheme(<TravelCardView card={TRAVEL_OK} tz={TZ} megaName="Teal" onAnswer={onAnswer} status="Got it. I told Partner you’re on your way." />);
    expect(screen.getByText('Got it. I told Partner you’re on your way.')).toBeTruthy();
  });

  test('no buttons without a travel check to answer', async () => {
    await renderWithTheme(<TravelCardView card={{ ...TRAVEL_OK, checkId: undefined }} tz={TZ} megaName="Teal" onAnswer={jest.fn()} />);
    expect(screen.queryByText('On my way')).toBeNull();
  });

  test('not set up: names the event and its start, and offers "Remind me 30 min before"', async () => {
    const onAnswer = jest.fn();
    await renderWithTheme(<TravelCardView card={TRAVEL_NOT_SET_UP} tz={TZ} megaName="Teal" onAnswer={onAnswer} />);
    expect(screen.getByText(/^Soccer pickup at 5:30 PM\. I can’t check traffic/)).toBeTruthy();
    expect(screen.queryByText('On my way')).toBeNull();
    await fireEvent.press(screen.getByText('Remind me 30 min before'));
    expect(onAnswer).toHaveBeenCalledWith('remind_30_before');
  });

  test('not set up: says so and never shows a made-up time (fail closed)', async () => {
    await renderWithTheme(<TravelCardView card={TRAVEL_NOT_SET_UP} tz={TZ} megaName="Teal" />);
    expect(screen.getByText('Travel time isn’t set up yet.')).toBeTruthy();
    expect(screen.queryByText(/Leave by/)).toBeNull();
    expect(screen.queryByText(/min with traffic/)).toBeNull();
  });

  test('no route and provider errors have their own lines, still without numbers', async () => {
    await renderWithTheme(<TravelCardView card={{ ...TRAVEL_NOT_SET_UP, failure: 'no_result' }} tz={TZ} megaName="Teal" />);
    expect(screen.getByText(/couldn’t find a route/)).toBeTruthy();
    expect(screen.queryByText(/Leave by/)).toBeNull();
  });
});
