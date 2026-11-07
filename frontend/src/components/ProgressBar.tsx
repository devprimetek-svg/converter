import React from 'react';
import { Progress, Paper, Group, Text, Badge, ThemeIcon } from '@mantine/core';
import { FileText, Loader2 } from 'lucide-react';
import type { ExtractionStatus } from '../types';

interface ProgressBarProps {
  status: ExtractionStatus;
}

export const ProgressBar: React.FC<ProgressBarProps> = ({ status }) => {
  const { current_page, total_pages, current_fig_no, current_fig_name } = status;
  const percent = total_pages > 0 ? Math.min(100, Math.round((current_page / total_pages) * 100)) : 10;

  return (
    <Paper
      withBorder
      shadow="md"
      radius="xl"
      p="xl"
      className="max-w-2xl mx-auto bg-white/95 dark:bg-[#1A1B1E] backdrop-blur-md border-slate-200 dark:border-[#2C2E33] shadow-md"
    >
      <Group justify="space-between" align="center" mb="md">
        <Group gap="sm">
          <ThemeIcon size={44} radius="lg" variant="light" color="blue">
            <Loader2 className="w-5 h-5 animate-spin" />
          </ThemeIcon>
          <div>
            <Text fw={700} size="md">
              Parsing Parts Catalogue...
            </Text>
            <Text size="xs" c="dimmed">
              {total_pages > 0
                ? `Reading page ${current_page} of ${total_pages}`
                : 'Initializing PDF document reader...'}
            </Text>
          </div>
        </Group>
        <Text fw={800} size="xl" c="blue" className="font-mono">
          {percent}%
        </Text>
      </Group>

      <Progress
        value={percent}
        size="lg"
        radius="xl"
        color="blue"
        animated
        striped
        aria-label="Extraction progress"
      />

      {current_fig_no && (
        <Paper
          withBorder
          radius="md"
          p="xs"
          mt="md"
          className="bg-blue-50/50 dark:bg-[#141517] border-blue-100 dark:border-[#2C2E33]"
        >
          <Group justify="space-between" wrap="nowrap">
            <Group gap="xs" wrap="nowrap" style={{ minWidth: 0 }}>
              <FileText className="w-4 h-4 text-blue-500 shrink-0" />
              <Badge variant="filled" color="blue" size="sm">
                FIG. {current_fig_no}
              </Badge>
              <Text size="xs" truncate fw={500}>
                {current_fig_name}
              </Text>
            </Group>
            <Badge variant="dot" color="teal" size="xs">
              Table Active
            </Badge>
          </Group>
        </Paper>
      )}
    </Paper>
  );
};
