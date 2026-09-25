import {
  AskBar,
  Block,
  Button,
  ChoiceCard,
  Confirm,
  DarkTop,
  Empty,
  Filters,
  HoldButton,
  Icon,
  IconButton,
  Mark,
  Meter,
  NeedsYou,
  Problem,
  Row,
  Sheet,
  Skeleton,
  Stats,
  StatusChip,
  StepChart,
  Steps,
  Switch,
  Text,
  Tile,
  TileFigure,
  TileNote,
  UndoBar,
} from '@agentv/app/src/components/index.ts';
import type { IconName } from '@agentv/app/src/theme/icons.ts';
import { useTheme } from '@agentv/app/src/theme/theme.tsx';
import type { ReactNode } from 'react';
import { View } from 'react-native';

// Each preview here is the design system's preview of the same component (docs/design/prototype/
// ds_build.py, COMPONENTS), with the same content, built from the app's components instead of the
// web ones. compare.js puts the two side by side.

/** The light stage: the ground, 16 around, 8 between. */
function Stage({ children, bare = false }: { children: ReactNode; bare?: boolean }) {
  const { colors } = useTheme();
  return (
    <View style={{ padding: bare ? 0 : 16, backgroundColor: colors.ground, gap: 8 }}>
      {children}
    </View>
  );
}

/** The dark stage: `night`, 20 and 24 around, 12 between. */
function Night({ children }: { children: ReactNode }) {
  const { colors } = useTheme();
  return (
    <View
      style={{ paddingVertical: 20, paddingHorizontal: 24, backgroundColor: colors.night, gap: 12 }}
    >
      {children}
    </View>
  );
}

function RowOf({ children, gap = 8 }: { children: ReactNode; gap?: number }) {
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap }}>
      {children}
    </View>
  );
}

const ICONS: IconName[] = [
  'pen',
  'question',
  'alert',
  'eye',
  'globe',
  'mail',
  'calendar',
  'clock',
  'check',
  'hand',
  'face',
  'lock',
  'key',
  'mic',
  'search',
  'grid',
  'sheet',
  'terminal',
];

const noop = () => {};
const inr = (v: number) => `₹${v.toLocaleString('en-IN')}`;

function IconPreview() {
  const { colors } = useTheme();
  return (
    <Stage>
      <RowOf gap={14}>
        {ICONS.map((n) => (
          <Icon key={n} name={n} label={n} color={colors.ink} />
        ))}
      </RowOf>
    </Stage>
  );
}

function IconButtonPreview() {
  const { colors } = useTheme();
  return (
    <Stage>
      <RowOf>
        <View
          style={{
            backgroundColor: colors.night,
            padding: 8,
            borderRadius: 999,
            flexDirection: 'row',
            gap: 8,
          }}
        >
          <IconButton icon="back" label="Back" />
          <IconButton icon="search" label="Search" />
        </View>
        <IconButton icon="share" label="Share" tone="surface" />
        <IconButton icon="mic" label="Speak" tone="blue" />
      </RowOf>
    </Stage>
  );
}

function ConfirmPreview() {
  const { colors } = useTheme();
  return (
    <Stage>
      <View
        style={{
          paddingVertical: 16,
          paddingHorizontal: 18,
          borderRadius: 28,
          backgroundColor: colors.surface,
        }}
      >
        <Confirm
          title="Disconnect Gmail?"
          detail="The morning briefing and 1 other job use it and will pause."
          confirmLabel="Disconnect"
        />
      </View>
    </Stage>
  );
}

function HoldButtonPreview() {
  const { colors } = useTheme();
  return (
    <Stage>
      <HoldButton
        tone="blue"
        done={
          <View
            style={{
              paddingVertical: 16,
              paddingHorizontal: 18,
              borderRadius: 24,
              backgroundColor: colors.surface,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 14,
            }}
          >
            <Mark icon="check" tone="blue" />
            <Text>Signed and sent</Text>
          </View>
        }
      >
        Hold to sign and send
      </HoldButton>
      <HoldButton tone="red" faceId>
        Hold, then confirm with Face ID
      </HoldButton>
    </Stage>
  );
}

export const previews: Record<string, () => ReactNode> = {
  Icon: IconPreview,
  DarkTop: () => (
    <Stage bare>
      <DarkTop
        leading={<IconButton icon="back" label="Back" />}
        chip={<StatusChip live>Working</StatusChip>}
        trailing={<IconButton icon="more" label="Job options" />}
        title="Compare CRM tools"
        sub="Step 3 of 5, reading reviews."
      />
    </Stage>
  ),
  StatusChip: () => (
    <Night>
      <RowOf>
        <StatusChip>On duty</StatusChip>
        <StatusChip live>Working</StatusChip>
        <StatusChip tone="needs">Needs you · 1 of 3</StatusChip>
        <StatusChip tone="undone">Can’t be undone</StatusChip>
        <StatusChip icon="offline">Offline</StatusChip>
      </RowOf>
    </Night>
  ),
  IconButton: IconButtonPreview,
  Stats: () => (
    <Night>
      <Stats
        items={[
          { value: '3/5', label: 'steps done' },
          { value: '4', label: 'fit the budget' },
          { value: '$0.09', label: 'AI cost so far' },
        ]}
      />
    </Night>
  ),
  AskBar: () => (
    <Stage>
      <AskBar placeholder="Hand something off…" />
    </Stage>
  ),
  Button: () => (
    <Stage>
      <RowOf>
        <Button variant="secondary">Change</Button>
        <Button grow trailing="arrow">
          Start
        </Button>
      </RowOf>
      <RowOf>
        <Button variant="small">Try again</Button>
        <Button disabled>Signing needs a connection</Button>
      </RowOf>
    </Stage>
  ),
  HoldButton: HoldButtonPreview,
  Switch: () => (
    <Stage>
      <RowOf gap={16}>
        <Switch label="On" defaultChecked />
        <Switch label="Off" />
      </RowOf>
    </Stage>
  ),
  ChoiceCard: () => (
    <Stage>
      <ChoiceCard checked title="Raise by $10" detail="For the rest of September" />
      <ChoiceCard title="Raise by $20" detail="For the rest of September" />
    </Stage>
  ),
  Filters: () => (
    <Night>
      <Filters label="Filters" options={['All', 'Jobs', 'Files', 'Remembered']} />
    </Night>
  ),
  Confirm: ConfirmPreview,
  Sheet: () => (
    <Stage>
      <Sheet
        title="Compare CRM tools"
        onClose={noop}
        items={[
          { icon: 'clock', label: 'Pause' },
          { icon: 'repeat', label: 'Repeat…' },
          { icon: 'edit', label: 'Rename' },
          { icon: 'archive', label: 'Archive' },
          { icon: 'trash', label: 'Delete', danger: true },
        ]}
      />
    </Stage>
  ),
  Block: () => (
    <Stage>
      <Block label="Working">
        <Row
          icon="globe"
          title="Compare CRM tools"
          detail="Step 3 of 5 · 1 follow-up queued"
          onPress={noop}
        />
        <Row
          icon="sheet"
          title="Clean up the Q3 numbers"
          detail="On the computer · step 2 of 4"
          onPress={noop}
        />
      </Block>
    </Stage>
  ),
  Row: () => (
    <Stage>
      <Block>
        <Row
          icon="pen"
          markTone="blue"
          title="Reply to Sam about Friday"
          detail="Signature"
          detailTone="blue"
          onPress={noop}
        />
        <Row
          icon="trash"
          markTone="blue"
          title="Unsubscribe from 9 newsletters"
          detail="Can’t be undone"
          detailTone="red"
          onPress={noop}
        />
        <Row
          icon="memory"
          title="Maya prefers morning calls"
          detail="From 3 emails"
          trailing={<Button variant="small">Forget</Button>}
        />
      </Block>
    </Stage>
  ),
  Mark: () => (
    <Stage>
      <RowOf>
        <Mark icon="globe" />
        <Mark icon="pen" tone="blue" />
        <Mark icon="check" tone="ink" />
        <Mark icon="check" tone="green" />
      </RowOf>
    </Stage>
  ),
  NeedsYou: () => (
    <Stage>
      <NeedsYou
        count="1 of 3"
        title="Reply to Sam about Friday"
        detail="Sends an email as you"
        chips={[
          { icon: 'question', label: 'Seats question' },
          { icon: 'alert', label: '9 newsletters' },
        ]}
      />
    </Stage>
  ),
  Tile: () => (
    <Stage>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Tile icon="globe" status="Working" title="Compare CRM tools" onPress={noop}>
            <View style={{ gap: 8 }}>
              <TileNote>Step 3 of 5</TileNote>
              <Steps total={5} done={3} />
            </View>
          </Tile>
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Tile dark icon="eye" status="Watching" title="MacBook Air" onPress={noop}>
            <View style={{ gap: 2 }}>
              <TileFigure>₹94,900</TileFigure>
              <TileNote>Alert under ₹90,000</TileNote>
            </View>
          </Tile>
        </View>
      </View>
    </Stage>
  ),
  Steps: () => (
    <Stage>
      <Block>
        <View style={{ paddingTop: 12, paddingBottom: 16, gap: 12 }}>
          <Steps total={5} done={3} />
          <Meter value={41} />
        </View>
      </Block>
    </Stage>
  ),
  StepChart: () => (
    <Stage>
      <StepChart
        title="Last 30 days"
        summary="Price over the last 30 days, down from ₹99,900 to ₹94,900"
        points={[
          99900, 99900, 99900, 98500, 98500, 98500, 97900, 97900, 96900, 96900, 96900, 96900, 94900,
          94900, 94900, 94900,
        ]}
        min={88000}
        max={101000}
        alert={90000}
        alertLabel="Alert under ₹90,000"
        from="1 Sep"
        to="Today"
        width={320}
        format={inr}
      />
    </Stage>
  ),
  UndoBar: () => (
    <Stage>
      <UndoBar onUndo={noop}>Forgot: Maya prefers morning calls.</UndoBar>
    </Stage>
  ),
  Skeleton: () => (
    <Stage>
      <Skeleton label="Loading your day" />
    </Stage>
  ),
  Empty: () => (
    <Stage>
      <Empty
        icon="grid"
        title="No jobs yet"
        detail="What you hand off shows here: what needs you, what’s working and what repeats."
      />
    </Stage>
  ),
  Problem: () => (
    <Stage>
      <Problem
        title="Files and memory didn’t load"
        detail="The search took too long. Jobs above are complete."
        reference="S-4F2A"
        onRetry={noop}
      />
    </Stage>
  ),
};
