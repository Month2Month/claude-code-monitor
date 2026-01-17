import { Box, Text } from 'ink';
import type React from 'react';
import { memo } from 'react';
import type { Session } from '../types/index.js';
import { getStatusDisplay } from '../utils/status.js';
import { formatRelativeTime } from '../utils/time.js';
import { Spinner } from './Spinner.js';

interface SessionCardProps {
  session: Session;
  index: number;
  isSelected: boolean;
}

function abbreviateHomePath(path: string | undefined): string {
  if (!path) return '(unknown)';
  return path.replace(/^\/Users\/[^/]+/, '~');
}

export const SessionCard = memo(function SessionCard({
  session,
  index,
  isSelected,
}: SessionCardProps): React.ReactElement {
  const { symbol, color, label } = getStatusDisplay(session.status);
  const dir = abbreviateHomePath(session.cwd);
  const relativeTime = formatRelativeTime(session.updated_at);
  const isRunning = session.status === 'running';

  return (
    <Box paddingX={1}>
      <Text color={isSelected ? 'cyan' : undefined} bold={isSelected}>
        {isSelected ? '>' : ' '} [{index + 1}]
      </Text>
      <Text> </Text>
      <Box width={10}>
        {isRunning ? (
          <>
            <Spinner color="green" />
            <Text color={color}> {label}</Text>
          </>
        ) : (
          <Text color={color}>
            {symbol} {label}
          </Text>
        )}
      </Box>
      <Text> </Text>
      <Text dimColor>{relativeTime.padEnd(8)}</Text>
      <Text color={isSelected ? 'white' : 'gray'}>{dir}</Text>
    </Box>
  );
});
