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
        title={isNoTextLayer ? 'Scanned PDF Detected (OCR Not Supported)' : 'Processing Error'}
        icon={isNoTextLayer ? <FileWarning className="w-5 h-5" /> : <AlertTriangle className="w-5 h-5" />}
        radius="lg"
      >
        <Text size="sm" mt="xs" c="red.8" className="dark:text-red-200 leading-relaxed">
          {message}
        </Text>

        {isNoTextLayer && (
          <Paper
            withBorder
            radius="md"
            p="xs"
            mt="sm"
            className="bg-white/80 dark:bg-zinc-900/80 border-red-200/60 dark:border-red-900/40"
          >
            <Text size="xs" c="dimmed">
              <strong className="text-zinc-800 dark:text-zinc-200">Tip:</strong> This converter operates directly on vector coordinate text layers
              within digital PDF catalogues. Please export or supply a digital vector PDF rather than a flattened scan/photo.
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
            Try Another PDF
          </Button>
        </Group>
      </Alert>
    </Paper>
  );
};
