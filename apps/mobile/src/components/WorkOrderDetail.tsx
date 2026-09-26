import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { Children, useState, type ReactNode } from "react";
import { ActivityIndicator, FlatList, Linking, Modal, Pressable, StyleSheet, View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Card, Pressy, Text, useTheme, withAlpha } from "@rapportini/ui";
import { mediaUrl } from "../api/client";
import { SectionLabel } from "./Hero";

type IconName = keyof typeof Ionicons.glyphMap;

export interface Attachment {
  id: string;
  fileName: string;
  mimeType?: string | null;
  url: string;
}

export function isImage(file: Attachment) {
  return file.mimeType ? file.mimeType.startsWith("image/") : /\.(jpe?g|png|heic|webp)$/i.test(file.fileName);
}

export function Section({ title, accessory, children, flush }: { title: string; accessory?: ReactNode; children: ReactNode; flush?: boolean }) {
  return (
    <View style={{ gap: 8 }}>
      <SectionLabel title={title} accessory={accessory} />
      <Card style={{ gap: 12, paddingVertical: flush ? 4 : undefined }}>{children}</Card>
    </View>
  );
}

/** Righe separate da una linea sottile, come le liste di iOS. */
export function Rows({ children }: { children: ReactNode }) {
  const theme = useTheme();
  const rows = Children.toArray(children).filter(Boolean);
  return (
    <View>
      {rows.map((row, index) => (
        <View key={index} style={{ borderTopWidth: index ? StyleSheet.hairlineWidth : 0, borderTopColor: theme.colors.line }}>
          {row}
        </View>
      ))}
    </View>
  );
}

export function ActionCircle({ icon, label, onPress, loading }: { icon: IconName; label: string; onPress: () => void; loading?: boolean }) {
  const theme = useTheme();
  return (
    <Pressy onPress={onPress} disabled={loading} accessibilityRole="button" accessibilityLabel={label} scaleTo={0.92} style={{ flex: 1, alignItems: "center", gap: 6 }}>
      <View
        style={{
          width: 52,
          height: 52,
          borderRadius: 26,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: theme.colors.glassFlat,
          borderWidth: 1,
          borderColor: theme.colors.glassBorder,
          shadowColor: "#000",
          shadowOpacity: theme.dark ? 0 : 0.06,
          shadowRadius: 8,
          shadowOffset: { width: 0, height: 3 },
        }}
      >
        {loading ? <ActivityIndicator color={theme.colors.accent} /> : <Ionicons name={icon} size={22} color={theme.colors.accent} />}
      </View>
      <Text variant="caption" numberOfLines={1} style={{ fontWeight: "600" }}>
        {label}
      </Text>
    </Pressy>
  );
}

export function InfoRow({ icon, children, action }: { icon: IconName; children: ReactNode; action?: ReactNode }) {
  const theme = useTheme();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 11 }}>
      <Ionicons name={icon} size={18} color={theme.colors.inkSoft} />
      <View style={{ flex: 1, gap: 1 }}>{children}</View>
      {action}
    </View>
  );
}

export function LinkPill({ icon, label, onPress }: { icon: IconName; label: string; onPress: () => void }) {
  const theme = useTheme();
  return (
    <Pressy
      onPress={onPress}
      accessibilityRole="button"
      hitSlop={8}
      style={{ flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10, paddingVertical: 5, borderRadius: theme.radius.pill, backgroundColor: theme.colors.accentSoft }}
    >
      <Ionicons name={icon} size={13} color={theme.colors.accent} />
      <Text variant="caption" style={{ color: theme.colors.accent, fontWeight: "700" }}>
        {label}
      </Text>
    </Pressy>
  );
}

export function FieldGrid({ rows }: { rows: Array<{ key: string; label: string; value: string; missing?: boolean }> }) {
  const theme = useTheme();
  return (
    <View>
      {rows.map((row, index) => (
        <View
          key={row.key}
          style={{
            flexDirection: "row",
            gap: 12,
            paddingVertical: 9,
            borderTopWidth: index ? 1 : 0,
            borderTopColor: theme.colors.line,
          }}
        >
          <Text variant="caption" muted style={{ flex: 1 }}>
            {row.label}
          </Text>
          <Text variant="caption" muted={row.missing} style={{ flex: 1.3, textAlign: "right", fontWeight: row.missing ? "400" : "600" }}>
            {row.value}
          </Text>
        </View>
      ))}
    </View>
  );
}

export function CheckRow({ label, checked, note, onPress }: { label: string; checked: boolean; note?: string; onPress?: () => void }) {
  const theme = useTheme();
  const content = (
    <>
      <Ionicons name={checked ? "checkmark-circle" : "ellipse-outline"} size={22} color={checked ? theme.colors.success : theme.colors.inkSoft} />
      <View style={{ flex: 1, gap: 1 }}>
        <Text style={{ color: checked || onPress ? theme.colors.ink : theme.colors.inkSoft }}>{label}</Text>
        {note ? (
          <Text variant="caption" muted>
            {note}
          </Text>
        ) : null}
      </View>
    </>
  );
  const style = { flexDirection: "row" as const, alignItems: "center" as const, gap: 10, paddingVertical: 6 };
  return onPress ? (
    <Pressy onPress={onPress} scaleTo={0.98} accessibilityRole="checkbox" accessibilityState={{ checked }} style={style}>
      {content}
    </Pressy>
  ) : (
    <View style={style}>{content}</View>
  );
}

export function SignatureRow({ role, signedBy, onPress }: { role: string; signedBy?: string | null; onPress: () => void }) {
  const theme = useTheme();
  const done = Boolean(signedBy);
  return (
    <Pressy
      onPress={onPress}
      scaleTo={0.98}
      accessibilityRole="button"
      style={{
        flex: 1,
        gap: 6,
        padding: 12,
        borderRadius: theme.radius.md,
        borderCurve: "continuous",
        borderWidth: 1,
        borderStyle: done ? "solid" : "dashed",
        borderColor: done ? withAlpha(theme.colors.success, 0.4) : withAlpha(theme.colors.accent, 0.35),
        backgroundColor: done ? withAlpha(theme.colors.success, 0.08) : withAlpha(theme.colors.accent, theme.dark ? 0.08 : 0.05),
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
        <Ionicons name={done ? "checkmark-circle" : "create-outline"} size={18} color={done ? theme.colors.success : theme.colors.accent} />
        <Text variant="label">{role}</Text>
      </View>
      <Text variant="caption" muted numberOfLines={1}>
        {done ? signedBy : "Tocca per firmare"}
      </Text>
    </Pressy>
  );
}

const GAP = 8;
const COLUMNS = 3;

export function PhotoGallery({
  files,
  uploading,
  onCamera,
  onLibrary,
  onOpen,
  onDelete,
  deletingId,
}: {
  files: Attachment[];
  uploading: number;
  onCamera: () => void;
  onLibrary: () => void;
  onOpen: (index: number) => void;
  onDelete: (file: Attachment) => void;
  deletingId?: string;
}) {
  const theme = useTheme();
  const [width, setWidth] = useState(0);
  const size = width ? Math.floor((width - GAP * (COLUMNS - 1)) / COLUMNS) : 0;
  const photos = files.filter(isImage);
  const others = files.filter((file) => !isImage(file));
  const tile = { width: size, height: size, borderRadius: theme.radius.sm, borderCurve: "continuous" as const, overflow: "hidden" as const };

  return (
    <View style={{ gap: 12 }}>
      <View onLayout={(event) => setWidth(event.nativeEvent.layout.width)} style={{ flexDirection: "row", flexWrap: "wrap", gap: GAP }}>
        {size
          ? photos.map((photo, index) => (
              <View key={photo.id} style={{ width: size, height: size }}>
                <Pressy onPress={() => onOpen(index)} scaleTo={0.95} accessibilityRole="imagebutton" accessibilityLabel={`Foto ${index + 1}`} style={tile}>
                  <Image source={{ uri: mediaUrl(photo.url) }} style={{ width: size, height: size, backgroundColor: theme.colors.line }} contentFit="cover" transition={150} />
                </Pressy>
                {deletingId === photo.id ? (
                  <View style={[StyleSheet.absoluteFill, tile, { alignItems: "center", justifyContent: "center", backgroundColor: "rgba(0,0,0,0.45)" }]}>
                    <ActivityIndicator color="#fff" />
                  </View>
                ) : (
                  <Pressable
                    onPress={() => onDelete(photo)}
                    accessibilityRole="button"
                    accessibilityLabel={`Elimina foto ${index + 1}`}
                    hitSlop={8}
                    style={{ position: "absolute", top: 6, right: 6, width: 26, height: 26, borderRadius: 13, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(0,0,0,0.55)" }}
                  >
                    <Ionicons name="close" size={16} color="#fff" />
                  </Pressable>
                )}
              </View>
            ))
          : null}
        {size
          ? Array.from({ length: uploading }, (_, index) => (
              <View key={`up-${index}`} style={[tile, { alignItems: "center", justifyContent: "center", backgroundColor: theme.colors.field }]}>
                <ActivityIndicator color={theme.colors.accent} />
              </View>
            ))
          : null}
        {size ? (
          <Pressy
            onPress={onCamera}
            accessibilityRole="button"
            accessibilityLabel="Scatta una foto"
            style={[tile, { alignItems: "center", justifyContent: "center", gap: 4, borderWidth: 1.5, borderStyle: "dashed", borderColor: withAlpha(theme.colors.accent, 0.5), backgroundColor: theme.colors.accentSoft }]}
          >
            <Ionicons name="camera" size={24} color={theme.colors.accent} />
            <Text variant="caption" style={{ color: theme.colors.accent, fontWeight: "700" }}>
              Scatta
            </Text>
          </Pressy>
        ) : null}
        {size ? (
          <Pressy
            onPress={onLibrary}
            accessibilityRole="button"
            accessibilityLabel="Scegli dalla galleria"
            style={[tile, { alignItems: "center", justifyContent: "center", gap: 4, borderWidth: 1, borderColor: theme.colors.glassBorder, backgroundColor: theme.colors.field }]}
          >
            <Ionicons name="images-outline" size={24} color={theme.colors.inkSoft} />
            <Text variant="caption" muted style={{ fontWeight: "700" }}>
              Galleria
            </Text>
          </Pressy>
        ) : null}
      </View>
      {others.map((file) => (
        <InfoRow
          key={file.id}
          icon="document-outline"
          action={
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <LinkPill icon="open-outline" label="Apri" onPress={() => void Linking.openURL(mediaUrl(file.url))} />
              {deletingId === file.id ? (
                <ActivityIndicator color={theme.colors.danger} />
              ) : (
                <Pressable onPress={() => onDelete(file)} accessibilityRole="button" accessibilityLabel={`Elimina ${file.fileName}`} hitSlop={8}>
                  <Ionicons name="trash-outline" size={18} color={theme.colors.danger} />
                </Pressable>
              )}
            </View>
          }
        >
          <Text variant="caption" numberOfLines={1}>
            {file.fileName}
          </Text>
        </InfoRow>
      ))}
    </View>
  );
}

export function PhotoViewer({ photos, index, onClose, onDelete }: { photos: Attachment[]; index: number | null; onClose: () => void; onDelete: (photo: Attachment) => void }) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [current, setCurrent] = useState(0);
  const visible = index !== null && photos.length > 0;
  const shown = Math.min(current, photos.length - 1);

  return (
    <Modal visible={visible} animationType="fade" transparent statusBarTranslucent onRequestClose={onClose} onShow={() => setCurrent(index ?? 0)}>
      <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.96)" }}>
        {visible ? (
          <FlatList
            data={photos}
            keyExtractor={(photo) => photo.id}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            initialScrollIndex={Math.min(index ?? 0, photos.length - 1)}
            getItemLayout={(_, item) => ({ length: width, offset: width * item, index: item })}
            onMomentumScrollEnd={(event) => setCurrent(Math.round(event.nativeEvent.contentOffset.x / width))}
            renderItem={({ item }) => <Image source={{ uri: mediaUrl(item.url) }} style={{ width, height }} contentFit="contain" />}
          />
        ) : null}
        <View style={{ position: "absolute", top: insets.top + 8, left: 16, right: 16, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Chiudi" hitSlop={12} style={{ width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.14)" }}>
            <Ionicons name="close" size={22} color="#fff" />
          </Pressable>
          <Text style={{ color: "#fff", fontWeight: "600" }}>
            {photos.length ? `${shown + 1} di ${photos.length}` : ""}
          </Text>
          <Pressable
            onPress={() => photos[shown] && onDelete(photos[shown]!)}
            accessibilityRole="button"
            accessibilityLabel="Elimina foto"
            hitSlop={12}
            style={{ width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.14)" }}
          >
            <Ionicons name="trash-outline" size={20} color="#fff" />
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}
