import { Box, Text, useApp, useInput } from 'ink';
import type React from 'react';
import { useMemo, useState } from 'react';
import { useSessions } from '../hooks/useSessions.js';
import { clearSessions } from '../store/file-store.js';
import { focusSession } from '../utils/focus.js';
import { SessionCard } from './SessionCard.js';

const QUICK_SELECT_KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];

export function Dashboard(): React.ReactElement {
  const { sessions, loading, error } = useSessions();
  const [selectedIndex, setSelectedIndex] = useState(0);
  const { exit } = useApp();

  const focusSessionByIndex = (index: number) => {
    const session = sessions[index];
    if (session?.tty) {
      focusSession(session.tty);
    }
  };

  const handleQuickSelect = (input: string) => {
    const index = parseInt(input, 10) - 1;
    if (index < sessions.length) {
      setSelectedIndex(index);
      focusSessionByIndex(index);
    }
  };

  const statusCounts = useMemo(
    () =>
      sessions.reduce(
        (counts, session) => {
          counts[session.status]++;
          return counts;
        },
        { running: 0, waiting_input: 0, stopped: 0 }
      ),
    [sessions]
  );

  useInput((input, key) => {
    if (input === 'q' || key.escape) {
      exit();
      return;
    }
    if (key.upArrow || input === 'k') {
      setSelectedIndex((prev) => Math.max(0, prev - 1));
      return;
    }
    if (key.downArrow || input === 'j') {
      setSelectedIndex((prev) => Math.min(sessions.length - 1, prev + 1));
      return;
    }
    if (key.return || input === 'f') {
      focusSessionByIndex(selectedIndex);
      return;
    }
    if (QUICK_SELECT_KEYS.includes(input)) {
      handleQuickSelect(input);
      return;
    }
    if (input === 'c') {
      clearSessions();
      setSelectedIndex(0);
    }
  });

  if (loading) {
    return <Text dimColor>Loading...</Text>;
  }

  if (error) {
    return <Text color="red">Error: {error.message}</Text>;
  }

  const { running, waiting_input: waitingInput, stopped } = statusCounts;

  return (
    <Box flexDirection="column">
      <Box borderStyle="round" borderColor="cyan" paddingX={1}>
        <Text bold color="cyan">
          Claude Code Monitor
        </Text>
        <Text dimColor> │ </Text>
        <Text color="green">● {running}</Text>
        <Text dimColor> </Text>
        <Text color="yellow">◐ {waitingInput}</Text>
        <Text dimColor> </Text>
        <Text color="cyan">✓ {stopped}</Text>
      </Box>

      <Box
        flexDirection="column"
        borderStyle="round"
        borderColor="gray"
        marginTop={1}
        paddingX={1}
        paddingY={0}
      >
        {sessions.length === 0 ? (
          <Box paddingY={1}>
            <Text dimColor>No active sessions</Text>
          </Box>
        ) : (
          sessions.map((session, index) => (
            <SessionCard
              key={`${session.session_id}:${session.tty || ''}`}
              session={session}
              index={index}
              isSelected={index === selectedIndex}
            />
          ))
        )}
      </Box>

      <Box marginTop={1} justifyContent="center" gap={1}>
        <Text dimColor>[↑↓]Select</Text>
        <Text dimColor>[Enter]Focus</Text>
        <Text dimColor>[1-9]Quick</Text>
        <Text dimColor>[c]Clear</Text>
        <Text dimColor>[q]Quit</Text>
      </Box>
    </Box>
  );
}
