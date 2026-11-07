import React from 'react';
import { Alert, Button, Paper, Text, Group } from '@mantine/core';
import { AlertTriangle, FileWarning, RotateCcw } from 'lucide-react';

interface ErrorAlertProps {
  message: string;
  onRetry: () => void;
}

export const ErrorAlert: React.FC<ErrorAlertProps> = ({ message, onRetry }) => {
  const isNoTextLayer =
    message.toLowerCase().includes('no extractable text layer') ||
    message.toLowerCase().includes('scanned image') ||
    message.toLowerCase().includes('ocr');

  return (
    <Paper
      withBorder
      radius="xl"
      p="lg"
      className="max-w-2xl mx-auto bg-red-50/70 dark:bg-red-950/20 border-red-200 dark:border-red-900/60 shadow-sm"
    >
      <Alert
        variant="light"
        color="red"
        title={isNoTextLayer ? 'Scanned Photo / Xerox PDF Detected' : 'PDF Read Karne Me Problem Aayi'}
        icon={isNoTextLayer ? <FileWarning className="w-5 h-5" /> : <AlertTriangle className="w-5 h-5" />}
        radius="lg"
      >
        <Text size="sm" mt="xs" c="red.8" className="dark:text-red-200 leading-relaxed font-medium">
          {message}
        </Text>

        {isNoTextLayer && (
          <Paper
            withBorder
            radius="md"
            p="xs"
            mt="sm"
            className="bg-white/90 dark:bg-[#1A1B1E] border-red-200/60 dark:border-red-900/40"
          >
            <Text size="xs" c="dimmed">
              <strong className="text-zinc-800 dark:text-zinc-200">Zaroori Jankari:</strong> Ye PDF kisi kagaz ki photo ya xerox scan lagti hai jisme se text copy nahi kiya ja sakta. Kripya original computer-generated PDF upload karein (jo manufacturer ya company se directly mili ho).
            </Text>
          </Paper>
        )}

        <Group mt="md">
          <Button
            color="red"
            variant="filled"
            size="xs"
            leftSection={<RotateCcw className="w-3.5 h-3.5" />}
            onClick={onRetry}
          >
            Doosri PDF Try Karein
          </Button>
        </Group>
      </Alert>
    </Paper>
  );
};
