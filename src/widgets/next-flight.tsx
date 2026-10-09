/** The iOS "Next flight" home-screen and Lock Screen widget (expo-widgets).
 *
 * The function below runs in the widget extension's own JS runtime, not the
 * app's: the 'widget' directive ships its body as a string, so it can use
 * only @expo/ui/swift-ui components and modifiers (globals there), no hooks,
 * and nothing declared outside it — every colour and helper lives inside.
 * Its props come from services/home-widget-content.ts, which also decides
 * when the card changes; the clocks here tick in SwiftUI between entries.
 *
 * Colours are the Live Activity's (targets/FlyRightWidget): the card is
 * navy in both appearances, like the lock-screen card it sits beside. */

import {
  HStack,
  Image,
  ProgressView,
  Rectangle,
  RoundedRectangle,
  Spacer,
  Text,
  VStack,
  ZStack,
} from '@expo/ui/swift-ui';
import {
  clipped,
  containerBackground,
  fixedSize,
  font,
  foregroundStyle,
  frame,
  kerning,
  labelsHidden,
  lineLimit,
  minimumScaleFactor,
  monospacedDigit,
  multilineTextAlignment,
  opacity,
  padding,
  tint,
  widgetURL,
} from '@expo/ui/swift-ui/modifiers';
import { createWidget, type WidgetEnvironment } from 'expo-widgets';

import type { NextFlightProps } from '@/services/home-widget-content';

const NextFlight = (props: NextFlightProps, environment: WidgetEnvironment) => {
  'widget';
  const NAVY = '#0C1B36';
  const NAVY_DEEP = '#070F20';
  const WHITE = '#F2F6FB';
  const COBALT = '#7FB1F2';
  const AMBER = '#F2B441';
  const GREEN = '#2FD68C';

  const family = environment.widgetFamily;
  const now = environment.date;
  const live = props.kind === 'live';
  // The status colour, as on the Lock Screen card: green once it is time to
  // go, amber when running late. The fact to act on (gate, desk, seat, belt)
  // stands out in it too.
  const accent = props.tone === 'boarding' || props.tone === 'landed' ? GREEN : props.tone === 'delay' ? AMBER : COBALT;
  // Both facts on one line, for the sizes too narrow to stack them.
  const factsLine = [
    props.leadValue ? `${props.leadLabel} ${props.leadValue}` : '',
    props.lead2Value ? `${props.lead2Label} ${props.lead2Value}` : '',
  ].filter(Boolean).join(' · ');
  const route = `${props.fromCode} → ${props.toCode}`;
  const when = [props.dayLabel, props.depTime].filter(Boolean).join(' · ');
  // Within a day of take-off the words "Today" give way to a ticking
  // "in 3 hr, 12 min".
  const soon = props.departsAt > 0 && props.departsAt - now.getTime() < 86400000;
  const ticking = live && props.countdownEnd > now.getTime();
  const inAir = live && props.clockLabel === 'LANDS IN';

  const background = containerBackground(
    {
      type: 'linearGradient',
      colors: [NAVY, NAVY_DEEP],
      startPoint: { x: 0, y: 0 },
      endPoint: { x: 1, y: 1 },
    },
    'widget',
  );

  const label = (text: string, color: string) => (
    <Text modifiers={[font({ size: 11, weight: 'heavy', design: 'rounded' }), foregroundStyle(color), lineLimit(1)]}>
      {text}
    </Text>
  );

  const dim = (text: string, size: number) => (
    <Text modifiers={[font({ size, weight: 'semibold' }), foregroundStyle(WHITE), opacity(0.62), lineLimit(1)]}>
      {text}
    </Text>
  );

  // A timer Text reserves its widest width; `align` decides which side of
  // that box the digits sit on.
  const clock = (size: number, align: 'leading' | 'trailing' = 'leading') =>
    ticking ? (
      <Text
        timerInterval={{ lower: now, upper: new Date(props.countdownEnd) }}
        countsDown
        modifiers={[font({ size, weight: 'heavy', design: 'rounded' }), monospacedDigit(), foregroundStyle(WHITE), minimumScaleFactor(0.6), lineLimit(1), multilineTextAlignment(align)]}
      />
    ) : (
      <Text modifiers={[font({ size, weight: 'heavy', design: 'rounded' }), foregroundStyle(WHITE), minimumScaleFactor(0.6), lineLimit(1)]}>
        {props.clockLabel.startsWith('LANDED') ? 'Landed' : props.clockLabel}
      </Text>
    );

  // One fact on the small card's line: a muted label, the value coloured.
  const smallFact = (labelText: string, value: string, color: string) => (
    <HStack spacing={2}>
      <Text modifiers={[font({ size: 10, weight: 'bold' }), foregroundStyle(UNIT), lineLimit(1), fixedSize()]}>{labelText}</Text>
      <Text modifiers={[font({ size: 13, weight: 'heavy', design: 'rounded' }), foregroundStyle(color), lineLimit(1), minimumScaleFactor(0.7)]}>{value}</Text>
    </HStack>
  );

  // One fact beside the board: its label over its value.
  const fact = (labelText: string, value: string, color: string, size: number) => (
    <VStack alignment="trailing" spacing={0}>
      <Text modifiers={[font({ size: 10, weight: 'bold' }), kerning(1), foregroundStyle(WHITE), opacity(0.62), lineLimit(1)]}>{labelText}</Text>
      <Text modifiers={[font({ size, weight: 'heavy', design: 'rounded' }), monospacedDigit(), foregroundStyle(color), lineLimit(1), minimumScaleFactor(0.5)]}>
        {value}
      </Text>
    </VStack>
  );

  // The split-flap face the Flights live card and the Lock Screen card wear
  // (src/components/split-flap-clock.tsx, targets/FlyRightWidget): a dark
  // board, a tile per digit, HOURS / MIN / SEC under the pairs. The system's
  // timer is kerned so each digit advances by a tile and a gap and lands on
  // the tile drawn beneath it. The measure is services/countdown-digits.ts;
  // this runtime can't import it, so the numbers are repeated here — change
  // them together. Under ten hours the timer counts to ten hours past the
  // end (pausing at the real one) and its leading "1" is slid out of the
  // clip, so the hour never drops off the face: H:MM:SS, then HH:MM:SS.
  const TEN_HOURS = 36_000_000;
  const BOARD = '#0A0E17';
  const TILE = '#121826';
  const SPLIT = '#05080F';
  const DIGIT = '#F5F1E6';
  const UNIT = '#A7B4CA';
  const flap = (height: number, withSeconds: boolean) => {
    const fontSize = Math.round(height * 0.68);
    const pad = Math.round(height * 0.8) / 10;
    const gap = Math.max(2, Math.round(height * 0.8) / 10);
    const digit = fontSize * 0.669;
    const colon = fontSize * 0.29;
    const tileW = Math.round((digit + 2 * pad) * 10) / 10;
    const kern = tileW + gap - digit;
    const colonW = colon + kern - gap;
    const radius = Math.max(3, Math.round(height * 0.12));
    const boardPad = Math.round(height * 0.2);
    const boardRadius = Math.round(height * 0.28);
    const left = props.countdownEnd - now.getTime();
    const long = left >= TEN_HOURS;
    const hourDigits = long ? 2 : 1;
    const cells: ('d' | 'c')[] = [];
    for (let i = 0; i < hourDigits; i++) cells.push('d');
    cells.push('c', 'd', 'd');
    if (withSeconds) cells.push('c', 'd', 'd');
    let width = (cells.length - 1) * gap;
    for (const c of cells) width += c === 'd' ? tileW : colonW;
    // A shape takes every point it is offered, so the board gets its size
    // spelled out: the face plus its padding, the unit row under it.
    const rowGap = Math.max(3, height * 0.1);
    // The face is trailing-aligned and the timer sits in one leading-aligned
    // box that ends at the face's end: its glyphs then start a shift before
    // the first tile, which is where the ten-hour "1" belongs — out of the
    // clip. One frame only: this runtime applies a Text's view modifiers
    // twice, which doubles an offset and compounds nested frames, while the
    // same frame twice is the same frame. The kerned string runs a kerning
    // past the last tile, and a box shorter than the string truncates it
    // (fixedSize draws nothing in an archived view, like the Live Activity),
    // so the face hangs on past the last tile by a colon cell — a cell
    // that width is known to keep its size here, thinner blanks vanished —
    // and the board pads both sides by the hang so it stays symmetric.
    const shift = long ? 0 : tileW + gap;
    const hang = colonW + gap;
    const faceW = width + hang;
    const textW = faceW - pad + shift;
    const side = Math.max(boardPad, hang);
    const boardW = width + 2 * side;
    const boardH = boardPad + height + rowGap + 10 + boardPad * 0.8;
    const digitColor = props.tone === 'delay' ? AMBER : DIGIT;
    const unit = (text: string, w: number, align: 'center' | 'leading' = 'center') => (
      <Text modifiers={[font({ size: 8, weight: 'bold' }), kerning(1), foregroundStyle(UNIT), lineLimit(1), minimumScaleFactor(0.7), frame({ width: w, alignment: align })]}>
        {text}
      </Text>
    );
    // Empty cells are board-coloured rectangles: a clear shape, and a Spacer
    // with a frame, both took (almost) no room in this runtime, and the
    // cells drifted off the timer's glyphs. No cover over the timer's own
    // colons for the same reason — they stay the digits' colour here.
    const blank = (w: number, h: number) => <Rectangle modifiers={[frame({ width: w, height: h }), foregroundStyle(BOARD)]} />;
    return (
      <ZStack alignment="topLeading" modifiers={[frame({ width: boardW, height: boardH })]}>
        <RoundedRectangle cornerRadius={boardRadius} modifiers={[frame({ width: boardW, height: boardH }), foregroundStyle(BOARD)]} />
        <VStack alignment="leading" spacing={rowGap} modifiers={[padding({ leading: side, trailing: side - hang, top: boardPad, bottom: boardPad * 0.8 })]}>
        {/* Trailing in its frame too: the timer and the cover hang a shift
            past the face's leading edge, and a centred frame split that
            overhang, sliding every tile half a tile right of its label. */}
        <ZStack alignment="trailing" modifiers={[frame({ width: faceW, height, alignment: 'trailing' }), clipped()]}>
          <HStack spacing={gap}>
            {cells.map((c, i) =>
              c === 'd' ? (
                <ZStack key={i} modifiers={[frame({ width: tileW, height })]}>
                  <RoundedRectangle cornerRadius={radius} modifiers={[frame({ width: tileW, height }), foregroundStyle(TILE)]} />
                  <Rectangle modifiers={[frame({ width: tileW, height: 1 }), foregroundStyle(SPLIT)]} />
                </ZStack>
              ) : (
                <Rectangle key={i} modifiers={[frame({ width: colonW, height }), foregroundStyle(BOARD)]} />
              ),
            )}
            {blank(colonW, height)}
          </HStack>
          <Text
            timerInterval={{ lower: now, upper: new Date(long ? props.countdownEnd : props.countdownEnd + TEN_HOURS) }}
            pauseTime={long ? undefined : new Date(props.countdownEnd)}
            countsDown
            modifiers={[
              font({ size: fontSize, weight: 'heavy', design: 'rounded' }),
              monospacedDigit(),
              kerning(kern),
              foregroundStyle(digitColor),
              lineLimit(1),
              multilineTextAlignment('leading'),
              frame({ width: textW, alignment: 'leading' }),
            ]}
          />
          {/* The clip here follows the stack's natural bounds, timer overhang
              included, so the shifted "1" showed beside the first tile: a
              board-coloured strip the width of its cell, on a row that
              overhangs the face by that much, lies over it. */}
          {shift > 0 ? (
            <HStack spacing={0} modifiers={[frame({ width: faceW + shift, height })]}>
              <Rectangle modifiers={[frame({ width: shift, height }), foregroundStyle(BOARD)]} />
              <Spacer />
            </HStack>
          ) : null}
        </ZStack>
        <HStack spacing={gap}>
          {/* One hour tile is narrower than "HRS" on the small face: the
              label takes the empty room under the colon beside it too. */}
          {hourDigits > 1
            ? unit('HOURS', 2 * tileW + gap)
            : unit('HRS', tileW + gap + colonW, 'leading')}
          {hourDigits > 1 ? blank(colonW, 1) : null}
          {unit('MIN', 2 * tileW + gap)}
          {withSeconds ? blank(colonW, 1) : null}
          {withSeconds ? unit('SEC', 2 * tileW + gap) : null}
        </HStack>
        </VStack>
      </ZStack>
    );
  };

  const countdown = (size: number) =>
    soon ? (
      <Text
        date={new Date(props.departsAt)}
        dateStyle="relative"
        modifiers={[font({ size, weight: 'bold' }), foregroundStyle(WHITE), minimumScaleFactor(0.7), lineLimit(1)]}
      />
    ) : (
      <Text modifiers={[font({ size, weight: 'bold' }), foregroundStyle(WHITE), lineLimit(1)]}>{props.whenLabel}</Text>
    );

  // The plane's share of the flight, advancing on its own in the air.
  const progress = () =>
    inAir && props.departsAt > 0 && props.arrivesAt > props.departsAt ? (
      <ProgressView
        timerInterval={{ lower: new Date(props.departsAt), upper: new Date(props.arrivesAt) }}
        countsDown={false}
        // Without this SwiftUI prints the elapsed time under the bar.
        modifiers={[tint(accent), labelsHidden()]}
      />
    ) : null;

  // The codes never truncate ("D… → LHR"): they keep their width and the
  // plane between them gives way.
  const codes = (size: number) => (
    <HStack spacing={5} alignment="center">
      <Text modifiers={[font({ size, weight: 'heavy', design: 'rounded' }), foregroundStyle(WHITE), fixedSize()]}>{props.fromCode}</Text>
      <Image systemName="airplane" color={accent} size={size * 0.5} />
      <Text modifiers={[font({ size, weight: 'heavy', design: 'rounded' }), foregroundStyle(WHITE), fixedSize()]}>{props.toCode}</Text>
    </HStack>
  );

  // ── Lock Screen ────────────────────────────────────────────────────────
  if (family === 'accessoryInline') {
    // One line beside the date: the fact to act on ("Gate 22", "Belt 7"),
    // else the status word. A value that names itself needs no label.
    // A plain space, not \s: this body ships as a string and loses its
    // backslashes on the way to the extension.
    const lead = props.leadValue
      ? /^[A-Za-z]+ /.test(props.leadValue)
        ? props.leadValue
        : `${props.leadLabel.charAt(0)}${props.leadLabel.slice(1).toLowerCase()} ${props.leadValue}`
      : '';
    const inlineFact = lead || props.clockLabel.toLowerCase();
    if (props.kind === 'none') return <Text>No flights ahead</Text>;
    return (
      <Text modifiers={[widgetURL(props.url)]}>
        {live ? `${route} · ${inlineFact}` : `${route} · ${props.whenLabel}`}
      </Text>
    );
  }

  if (family === 'accessoryRectangular') {
    if (props.kind === 'none') {
      return (
        <VStack alignment="leading" spacing={1} modifiers={[widgetURL(props.url)]}>
          <Text modifiers={[font({ size: 15, weight: 'bold' })]}>No flights ahead</Text>
          <Text modifiers={[font({ size: 13 }), opacity(0.7)]}>Add your next trip</Text>
        </VStack>
      );
    }
    return (
      <VStack alignment="leading" spacing={1} modifiers={[widgetURL(props.url), frame({ maxWidth: 9999, alignment: 'leading' })]}>
        <HStack spacing={4}>
          <Image systemName="airplane" size={12} />
          <Text modifiers={[font({ size: 15, weight: 'bold' }), lineLimit(1)]}>{route}</Text>
        </HStack>
        {live ? (
          ticking ? (
            <HStack spacing={4}>
              <Text modifiers={[font({ size: 13, weight: 'semibold' })]}>{props.clockLabel === 'LANDS IN' ? 'Lands in' : 'Departs in'}</Text>
              <Text timerInterval={{ lower: now, upper: new Date(props.countdownEnd) }} countsDown modifiers={[font({ size: 13, weight: 'semibold' }), monospacedDigit()]} />
            </HStack>
          ) : (
            <Text modifiers={[font({ size: 13, weight: 'semibold' }), lineLimit(1)]}>{props.subtitle}</Text>
          )
        ) : (
          <Text modifiers={[font({ size: 13, weight: 'semibold' }), lineLimit(1)]}>{props.whenLabel}</Text>
        )}
        <Text modifiers={[font({ size: 13 }), opacity(0.7), lineLimit(1)]}>
          {live && factsLine ? factsLine : when}
        </Text>
      </VStack>
    );
  }

  // ── Home Screen ────────────────────────────────────────────────────────
  if (props.kind === 'none') {
    return (
      <VStack alignment="leading" spacing={4} modifiers={[background, widgetURL(props.url), frame({ maxWidth: 9999, maxHeight: 9999, alignment: 'topLeading' })]}>
        {label('FLYRIGHT', COBALT)}
        <Spacer />
        <Image systemName="airplane.departure" color={COBALT} size={26} />
        {/* Shrinks on the small card, which cut it to "No flights ahe…". */}
        <Text modifiers={[font({ size: 17, weight: 'bold' }), foregroundStyle(WHITE), lineLimit(1), minimumScaleFactor(0.7)]}>No flights ahead</Text>
        {/* Two lines allowed: on the small card one line cut it to "…nex…". */}
        <Text modifiers={[font({ size: 12, weight: 'semibold' }), foregroundStyle(WHITE), opacity(0.62), lineLimit(2), minimumScaleFactor(0.9)]}>
          Tap to add your next trip
        </Text>
      </VStack>
    );
  }

  if (family === 'systemSmall') {
    return (
      <VStack alignment="leading" spacing={3} modifiers={[background, widgetURL(props.url), frame({ maxWidth: 9999, maxHeight: 9999, alignment: 'topLeading' })]}>
        <HStack spacing={4}>
          {label(live ? props.clockLabel.replace(/ \d.*$/, '') : 'NEXT FLIGHT', live ? accent : COBALT)}
          <Spacer />
          {props.delayChip ? label(props.delayChip, AMBER) : null}
        </HStack>
        {live ? (ticking ? flap(19, true) : clock(26)) : codes(22)}
        {/* The times, not the cities: a city name never fits the small card.
            Live, the usual route line: each code at its own edge with its
            clock under it, the plane (and its progress aloft) between. */}
        {live ? (
          <HStack alignment="center" spacing={6}>
            <VStack alignment="leading" spacing={0}>
              <Text modifiers={[font({ size: 15, weight: 'heavy', design: 'rounded' }), foregroundStyle(WHITE), fixedSize()]}>{props.fromCode}</Text>
              {props.depTime ? <Text modifiers={[font({ size: 11, weight: 'bold' }), monospacedDigit(), foregroundStyle(WHITE), lineLimit(1), minimumScaleFactor(0.8)]}>{props.depTime}</Text> : null}
            </VStack>
            <VStack spacing={2} modifiers={[frame({ maxWidth: 9999 })]}>
              <Image systemName="airplane" color={accent} size={10} />
              {progress()}
            </VStack>
            <VStack alignment="trailing" spacing={0}>
              <Text modifiers={[font({ size: 15, weight: 'heavy', design: 'rounded' }), foregroundStyle(WHITE), fixedSize()]}>{props.toCode}</Text>
              {props.arrTime ? <Text modifiers={[font({ size: 11, weight: 'bold' }), monospacedDigit(), foregroundStyle(WHITE), lineLimit(1), minimumScaleFactor(0.8)]}>{props.arrTime}</Text> : null}
            </VStack>
          </HStack>
        ) : props.depTime ? (
          <HStack spacing={4}>
            {dim(props.depTime, 11)}
            <Spacer />
            {dim(props.arrTime, 11)}
          </HStack>
        ) : null}
        <Spacer />
        {live ? (
          <VStack alignment="leading" spacing={2}>
            {props.leadValue ? (
              // Labels in plain white, the values coloured: the first in the
              // status colour, the second white — as the medium card.
              // Separate pieces in a row: this runtime draws no nested Text.
              <HStack spacing={3}>
                {smallFact(props.leadLabel, props.leadValue, accent)}
                {props.lead2Value ? smallFact(props.lead2Label, props.lead2Value, WHITE) : null}
              </HStack>
            ) : (
              // Nothing to point at (a landed flight with no belt yet): the
              // next step is the one useful line left.
              <Text modifiers={[font({ size: 11, weight: 'semibold' }), foregroundStyle(WHITE), opacity(0.75), lineLimit(2)]}>
                {props.subtitle}
              </Text>
            )}
          </VStack>
        ) : (
          <VStack alignment="leading" spacing={1}>
            {countdown(16)}
            {dim(props.dayLabel, 11)}
          </VStack>
        )}
      </VStack>
    );
  }

  // systemMedium. Code and clock only: the city under the code repeated
  // what the code says, and the clocks are what a glance is for.
  const timeColumn = (code: string, time: string, align: 'leading' | 'trailing') => (
    <VStack alignment={align} spacing={1}>
      <Text modifiers={[font({ size: ticking ? 24 : 30, weight: 'heavy', design: 'rounded' }), foregroundStyle(WHITE)]}>{code}</Text>
      {time ? (
        <Text modifiers={[font({ size: 15, weight: 'bold' }), monospacedDigit(), foregroundStyle(WHITE), lineLimit(1)]}>{time}</Text>
      ) : null}
    </VStack>
  );

  return (
    <VStack alignment="leading" spacing={6} modifiers={[background, widgetURL(props.url), frame({ maxWidth: 9999, maxHeight: 9999, alignment: 'topLeading' })]}>
      <HStack spacing={6}>
        {/* Which flight first, then what its clock counts. */}
        {label(props.flightLabel, WHITE)}
        {label(live ? props.clockLabel.replace(/ \d.*$/, '') : 'NEXT FLIGHT', live ? accent : COBALT)}
        <Spacer />
        {props.delayChip ? label(props.delayChip, AMBER) : null}
        {live ? (ticking ? null : clock(20, 'trailing')) : countdown(15)}
      </HStack>
      {ticking ? (
        <HStack alignment="center" spacing={8}>
          {flap(26, true)}
          <Spacer />
          {props.leadValue ? (
            <HStack alignment="top" spacing={12}>
              {fact(props.leadLabel, props.leadValue, accent, props.lead2Value ? 22 : 24)}
              {props.lead2Value ? fact(props.lead2Label, props.lead2Value, WHITE, 22) : null}
            </HStack>
          ) : null}
        </HStack>
      ) : null}
      <HStack alignment="center" spacing={8}>
        {timeColumn(props.fromCode, props.depTime, 'leading')}
        <VStack spacing={4} modifiers={[frame({ maxWidth: 9999 })]}>
          <Image systemName="airplane" color={accent} size={16} />
          {progress()}
        </VStack>
        {timeColumn(props.toCode, props.arrTime, 'trailing')}
      </HStack>
      <Spacer />
      {ticking ? null : (
        <HStack spacing={6}>
          {live ? (
            <Text modifiers={[font({ size: 12, weight: 'semibold' }), foregroundStyle(WHITE), opacity(0.8), lineLimit(1)]}>
              {factsLine ? `${factsLine} · ${props.subtitle}` : props.subtitle}
            </Text>
          ) : (
            dim(props.dayLabel, 12)
          )}
          <Spacer />
          {props.laterCount > 0
            ? dim(props.laterCount === 1 ? '+1 more flight' : `+${props.laterCount} more flights`, 11)
            : null}
        </HStack>
      )}
    </VStack>
  );
};

export default createWidget<NextFlightProps>('NextFlight', NextFlight);
