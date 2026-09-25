import { useRef, useState } from "react";
import { PanResponder, View } from "react-native";
import Svg, { Polyline } from "react-native-svg";
import { Button, Text, useTheme } from "@rapportini/ui";

type Point = { x: number; y: number };

export function SignaturePad({ onChange }: { onChange: (data: string) => void }) {
  const theme = useTheme();
  const [paths, setPaths] = useState<Point[][]>([]);
  const pathsRef = useRef(paths);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const draft = useRef<Point[]>([]);

  function commit(next: Point[][]) {
    pathsRef.current = next;
    setPaths(next);
  }

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderGrant: (event) => {
        draft.current = [{ x: event.nativeEvent.locationX, y: event.nativeEvent.locationY }];
        commit([...pathsRef.current, draft.current]);
      },
      onPanResponderMove: (event) => {
        draft.current = [...draft.current, { x: event.nativeEvent.locationX, y: event.nativeEvent.locationY }];
        commit([...pathsRef.current.slice(0, -1), draft.current]);
      },
      onPanResponderRelease: () => {
        onChangeRef.current(JSON.stringify(pathsRef.current));
      },
    }),
  ).current;

  return (
    <View style={{ gap: 8 }}>
      <Text variant="label">Firma</Text>
      <View
        {...pan.panHandlers}
        style={{ height: 180, borderRadius: theme.radius.md, backgroundColor: theme.dark ? "#0E1114" : "#FFFFFF", borderWidth: 1, borderColor: theme.colors.line, overflow: "hidden" }}
      >
        <Svg width="100%" height="100%">
          {paths.map((path, index) => (
            <Polyline key={index} points={path.map((point) => `${point.x},${point.y}`).join(" ")} fill="none" stroke={theme.colors.ink} strokeWidth={2.4} strokeLinejoin="round" strokeLinecap="round" />
          ))}
        </Svg>
      </View>
      <Button label="Cancella firma" tone="ghost" onPress={() => { commit([]); onChange(""); }} />
    </View>
  );
}
