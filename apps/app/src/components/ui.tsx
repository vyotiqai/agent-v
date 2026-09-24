import Feather from "@expo/vector-icons/Feather";
import { type ComponentProps, type ReactNode, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  Text,
  TextInput,
  type TextInputProps,
  type TextStyle,
  View,
} from "react-native";
import { withUniwind } from "uniwind";

// Third-party components need withUniwind to accept className; the icon color comes from it.
const Feather$ = withUniwind(Feather);

/** On web, inputs draw their own focus state: no browser outline or textarea resize handle. */
export const webInput = Platform.select<TextStyle>({
  web: { outlineStyle: "none", resize: "none" } as unknown as TextStyle,
  default: {},
});

export type IconName = ComponentProps<typeof Feather>["name"];

export function Icon({
  name,
  size = 18,
  className,
}: {
  name: IconName;
  size?: number;
  className?: string;
}) {
  return (
    <Feather$ name={name} size={size} className={className ?? "text-zinc-500 dark:text-zinc-400"} />
  );
}

export function Title({ children }: { children: ReactNode }) {
  return (
    <Text className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
      {children}
    </Text>
  );
}

export function Label({ children }: { children: ReactNode }) {
  return (
    <Text className="px-1 pb-2 text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
      {children}
    </Text>
  );
}

export function Muted({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <Text className={`text-sm text-zinc-500 dark:text-zinc-400 ${className}`}>{children}</Text>
  );
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <View
      className={`rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900 ${className}`}
    >
      {children}
    </View>
  );
}

const buttonStyles = {
  primary: "bg-zinc-900 dark:bg-zinc-50",
  secondary: "bg-zinc-100 dark:bg-zinc-800",
  danger: "bg-red-50 dark:bg-red-950",
  ghost: "",
};
const buttonText = {
  primary: "text-white dark:text-zinc-900",
  secondary: "text-zinc-900 dark:text-zinc-100",
  danger: "text-red-600 dark:text-red-400",
  ghost: "text-zinc-700 dark:text-zinc-300",
};

export function Button({
  title,
  onPress,
  variant = "primary",
  busy = false,
  disabled = false,
  icon,
  className = "",
}: {
  title: string;
  onPress: () => void;
  variant?: keyof typeof buttonStyles;
  busy?: boolean;
  disabled?: boolean;
  icon?: IconName;
  className?: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled || busy}
      className={`h-11 flex-row items-center justify-center gap-2 rounded-full px-5 active:opacity-80 ${buttonStyles[variant]} ${disabled ? "opacity-40" : ""} ${className}`}
    >
      {busy ? (
        <ActivityIndicator size="small" />
      ) : icon ? (
        <Icon name={icon} size={16} className={buttonText[variant]} />
      ) : null}
      <Text className={`text-[15px] font-medium ${buttonText[variant]}`}>{title}</Text>
    </Pressable>
  );
}

export function IconButton({
  name,
  onPress,
  label,
  className = "",
}: {
  name: IconName;
  onPress: () => void;
  label: string;
  className?: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={8}
      onPress={onPress}
      className={`h-10 w-10 items-center justify-center rounded-full active:bg-zinc-100 dark:active:bg-zinc-800 ${className}`}
    >
      <Icon name={name} size={20} className="text-zinc-700 dark:text-zinc-300" />
    </Pressable>
  );
}

export function Field(props: TextInputProps & { label?: string }) {
  const { label, className, style, ...rest } = props;
  return (
    <View className="gap-1.5">
      {label ? (
        <Text className="px-1 text-sm font-medium text-zinc-700 dark:text-zinc-300">{label}</Text>
      ) : null}
      <TextInput
        placeholderTextColor="#a1a1aa"
        className={`min-h-11 rounded-xl border border-zinc-200 bg-white px-3.5 py-2.5 text-[15px] text-zinc-900 focus:border-zinc-400 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100 ${className ?? ""}`}
        style={[webInput, style]}
        // The visible label names the input for screen readers too.
        accessibilityLabel={label}
        {...rest}
      />
    </View>
  );
}

const statusStyles: Record<string, string> = {
  queued: "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300",
  running: "bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300",
  waiting_input: "bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
  waiting_approval: "bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
  succeeded: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
  failed: "bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300",
  cancelled: "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400",
};
const statusLabels: Record<string, string> = {
  queued: "Queued",
  running: "Working",
  waiting_input: "Needs input",
  waiting_approval: "Needs approval",
  succeeded: "Done",
  failed: "Failed",
  cancelled: "Cancelled",
};

export function StatusChip({ status }: { status: string }) {
  return (
    <Text
      className={`overflow-hidden rounded-full px-2.5 py-1 text-xs font-medium ${statusStyles[status] ?? statusStyles.queued}`}
    >
      {statusLabels[status] ?? status}
    </Text>
  );
}

export function Empty({ icon, title, body }: { icon: IconName; title: string; body: string }) {
  return (
    <View className="items-center gap-2 px-8 py-16">
      <Icon name={icon} size={28} className="text-zinc-300 dark:text-zinc-600" />
      <Text className="text-base font-medium text-zinc-800 dark:text-zinc-200">{title}</Text>
      <Muted className="text-center">{body}</Muted>
    </View>
  );
}

export function ErrorText({ children }: { children: ReactNode }) {
  return <Text className="px-1 text-sm text-red-600 dark:text-red-400">{children}</Text>;
}

/** A row of mutually exclusive options (tabs on a screen, or a small choice). */
export function Segmented<T extends string>({
  value,
  options,
  onChange,
  role = "tab",
}: {
  value: T;
  options: { value: T; label: string; badge?: number }[];
  onChange: (value: T) => void;
  role?: "tab" | "radio";
}) {
  return (
    <View
      accessibilityRole={role === "tab" ? "tablist" : "radiogroup"}
      className="flex-row rounded-full bg-zinc-100 p-1 dark:bg-zinc-900"
    >
      {options.map((option) => {
        const selected = value === option.value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole={role}
            accessibilityState={{ selected, checked: role === "radio" ? selected : undefined }}
            onPress={() => onChange(option.value)}
            className={`flex-1 flex-row items-center justify-center gap-1.5 rounded-full py-2 ${selected ? "bg-white dark:bg-zinc-800" : ""}`}
          >
            <Text
              numberOfLines={1}
              className={`text-sm font-medium ${selected ? "text-zinc-900 dark:text-zinc-100" : "text-zinc-500"}`}
            >
              {option.label}
            </Text>
            {option.badge ? (
              <Text className="min-w-5 overflow-hidden rounded-full bg-indigo-600 px-1.5 text-center text-[11px] font-semibold leading-5 text-white">
                {option.badge}
              </Text>
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}

/** Small pill choices that wrap, for settings like an interval. */
export function Choices<T extends string | number>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
  label?: string;
}) {
  return (
    <View className="gap-1.5">
      {label ? (
        <Text className="px-1 text-sm font-medium text-zinc-700 dark:text-zinc-300">{label}</Text>
      ) : null}
      <View accessibilityRole="radiogroup" className="flex-row flex-wrap gap-2">
        {options.map((option) => {
          const selected = option.value === value;
          return (
            <Pressable
              key={String(option.value)}
              accessibilityRole="radio"
              accessibilityState={{ checked: selected }}
              onPress={() => onChange(option.value)}
              className={`rounded-full border px-3.5 py-1.5 ${selected ? "border-zinc-900 bg-zinc-900 dark:border-zinc-100 dark:bg-zinc-100" : "border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900"}`}
            >
              <Text
                className={`text-sm ${selected ? "text-white dark:text-zinc-900" : "text-zinc-700 dark:text-zinc-300"}`}
              >
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const progressTones = {
  normal: "bg-emerald-500",
  warn: "bg-amber-500",
  full: "bg-red-500",
};

/** A thin progress meter; `label` names it for screen readers. */
export function Progress({
  value,
  label,
  tone = "normal",
}: {
  value: number;
  label: string;
  tone?: keyof typeof progressTones;
}) {
  const percent = Math.round(Math.min(1, Math.max(0, value)) * 100);
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      accessibilityValue={{ min: 0, max: 100, now: percent }}
      className="h-1.5 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800"
    >
      <View
        className={`h-full rounded-full ${progressTones[tone]}`}
        style={{ width: `${percent}%` }}
      />
    </View>
  );
}

/** A tappable settings row that opens another screen. */
export function NavRow({
  icon,
  title,
  detail,
  onPress,
}: {
  icon: IconName;
  title: string;
  detail?: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="link"
      onPress={onPress}
      className="flex-row items-center gap-3 rounded-xl px-2 py-2.5 active:bg-zinc-50 dark:active:bg-zinc-800"
    >
      <Icon name={icon} size={18} />
      <View className="flex-1">
        <Text className="text-[15px] font-medium text-zinc-900 dark:text-zinc-100">{title}</Text>
        {detail ? <Muted className="text-xs">{detail}</Muted> : null}
      </View>
      <Icon name="chevron-right" size={16} />
    </Pressable>
  );
}

/** One headline number with its label. */
export function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View className="min-w-[140px] flex-1 gap-1 rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
      <Text className="text-2xl font-semibold tabular-nums text-zinc-900 dark:text-zinc-50">
        {value}
      </Text>
      <Muted className="text-xs">{label}</Muted>
    </View>
  );
}

/** A destructive button that asks for a second tap before acting. */
export function ConfirmButton({
  title,
  confirmTitle,
  onConfirm,
  busy,
  disabled,
  className = "",
}: {
  title: string;
  confirmTitle: string;
  onConfirm: () => void;
  busy?: boolean;
  disabled?: boolean;
  className?: string;
}) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const timer = setTimeout(() => setArmed(false), 5000);
    return () => clearTimeout(timer);
  }, [armed]);
  return (
    <Button
      title={armed ? confirmTitle : title}
      variant="danger"
      busy={busy}
      disabled={disabled}
      className={className}
      onPress={() => {
        if (!armed) return setArmed(true);
        setArmed(false);
        onConfirm();
      }}
    />
  );
}
