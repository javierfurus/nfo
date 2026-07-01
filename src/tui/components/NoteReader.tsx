import type { ReactElement } from "react";
import { Box, Text } from "ink";

export const NOTE_READER_VISIBLE_LINES = 20;

export interface NoteReaderProps {
  mode: "list" | "content";
  files: string[];
  selectedFileIndex: number;
  fileContent: string;
  scrollOffset: number;
  renderedLines?: string[];
  visibleLines?: number;
}

export function NoteReader(props: NoteReaderProps): ReactElement {
  if (props.mode === "list") {
    return (
      <Box
        flexDirection="column"
        flexGrow={1}
        paddingX={1}
        justifyContent="space-between"
      >
        <Text bold={true}>Notes</Text>
        {props.files.length === 0 ? (
          <Text dimColor={true}>No notes found.</Text>
        ) : null}
        <Box flexDirection="column" flexGrow={1} paddingY={1}>
          {props.files.map((file, i) => {
            const selected = i === props.selectedFileIndex;
            return (
              <Text key={file} color={selected ? "cyan" : undefined}>
                {selected ? "▸" : " "} {file}
              </Text>
            );
          })}
        </Box>
        <Text dimColor={true}>↑/↓ select · Enter open · Esc close</Text>
      </Box>
    );
  }

  const lines =
    props.renderedLines !== undefined
      ? props.renderedLines
      : props.fileContent.split("\n");
  const totalLines = lines.length;
  const visible = props.visibleLines ?? NOTE_READER_VISIBLE_LINES;
  const visibleLines = lines.slice(
    props.scrollOffset,
    props.scrollOffset + visible,
  );
  const from = props.scrollOffset + 1;
  const to = Math.min(
    props.scrollOffset + visible,
    totalLines,
  );
  const filename = props.files[props.selectedFileIndex] ?? "";

  return (
    <Box
      flexDirection="column"
      flexGrow={1}
      justifyContent="space-between"
      paddingX={1}
    >
      <Text bold={true}>{filename}</Text>
      <Box flexDirection="column" flexGrow={1}>
        {visibleLines.map((line, i) => {
          return (
            <Text key={String(props.scrollOffset + i)} wrap="truncate-end">
              {line || " "}
            </Text>
          );
        })}
      </Box>
      <Text dimColor={true}>
        {from}–{to} / {totalLines} · ↑/↓ scroll · Esc back
      </Text>
    </Box>
  );
}
