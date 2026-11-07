import React, { useRef, useState } from 'react';
import { Paper, Text, Title, Button, Group, ThemeIcon, SimpleGrid } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { UploadCloud, FileText, AlertCircle, Layers, ShieldCheck, Cpu } from 'lucide-react';

interface FileUploadZoneProps {
  onFileSelect: (file: File) => void;
  isUploading: boolean;
}

export const FileUploadZone: React.FC<FileUploadZoneProps> = ({ onFileSelect, isUploading }) => {
  const [isDragOver, setIsDragOver] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const validateAndHandle = (file: File) => {
    setLocalError(null);
    if (!file.name.toLowerCase().endsWith('.pdf')) {
      const msg = 'Please upload a valid PDF document (.pdf).';
      setLocalError(msg);
      notifications.show({
        title: 'Unsupported File Format',
        message: msg,
        color: 'red',
        icon: <AlertCircle className="w-4 h-4" />,
      });
      return;
    }
    const maxSize = 60 * 1024 * 1024; // 60MB
    if (file.size > maxSize) {
      const msg = 'File size exceeds 60MB limit.';
      setLocalError(msg);
      notifications.show({
        title: 'File Too Large',
        message: msg,
        color: 'red',
        icon: <AlertCircle className="w-4 h-4" />,
      });
      return;
    }
    onFileSelect(file);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(false);
    if (isUploading) return;

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      validateAndHandle(e.dataTransfer.files[0]);
    }
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (!isUploading) {
      setIsDragOver(true);
    }
  };

  const handleDragLeave = () => {
    setIsDragOver(false);
  };

  return (
    <div className="w-full max-w-4xl mx-auto">
      <Paper
        withBorder
        radius="xl"
        p={{ base: 'xl', sm: 48 }}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={() => !isUploading && fileInputRef.current?.click()}
        className={`relative group cursor-pointer text-center border-2 border-dashed transition-all duration-200 ${
          isDragOver
            ? 'border-blue-500 bg-blue-50/70 dark:bg-blue-950/40 scale-[1.01]'
            : 'border-zinc-300 dark:border-zinc-800 hover:border-blue-400 dark:hover:border-blue-600 bg-white/80 dark:bg-zinc-950/80 hover:bg-zinc-50 dark:hover:bg-zinc-900/60'
        } ${isUploading ? 'pointer-events-none opacity-60' : 'shadow-sm'}`}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,application/pdf"
          className="hidden"
          onChange={(e) => {
            if (e.target.files && e.target.files.length > 0) {
              validateAndHandle(e.target.files[0]);
            }
          }}
        />

        <ThemeIcon
          size={76}
          radius={24}
          variant="light"
          color="blue"
          className="mx-auto group-hover:scale-105 transition-transform duration-200 shadow-sm"
        >
          <UploadCloud className="w-10 h-10 text-blue-600 dark:text-blue-400" />
        </ThemeIcon>

        <Title order={3} mt="lg" className="text-zinc-900 dark:text-white">
          Upload Yamaha Parts Catalogue PDF
        </Title>
        <Text size="sm" c="dimmed" mt="xs" className="max-w-md mx-auto">
          Drag and drop your catalogue file here, or click to browse. Supports full documents up to ~60MB.
        </Text>

        <Group justify="center" mt="xl">
          <Button
            size="md"
            color="blue"
            radius="md"
            leftSection={<FileText className="w-4 h-4" />}
            className="shadow-md shadow-blue-500/20"
          >
            Select PDF File
          </Button>
        </Group>

        {localError && (
          <div className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 text-red-700 dark:text-red-300 text-xs font-medium">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{localError}</span>
          </div>
        )}
      </Paper>

      {/* Feature cards below upload */}
      <SimpleGrid cols={{ base: 1, md: 3 }} spacing="md" mt="xl">
        <Paper withBorder radius="lg" p="md" className="bg-white/90 dark:bg-zinc-950/80 border-zinc-200 dark:border-zinc-800/90 shadow-xs">
          <Group gap="sm" align="flex-start" wrap="nowrap">
            <ThemeIcon size={38} radius="md" variant="light" color="indigo">
              <Cpu className="w-5 h-5" />
            </ThemeIcon>
            <div>
              <Text size="sm" fw={700}>Coordinate Clustering</Text>
              <Text size="xs" c="dimmed" mt={2}>
                Reconstructs table rows with ~2pt tolerance for exact alignment
              </Text>
            </div>
          </Group>
        </Paper>

        <Paper withBorder radius="lg" p="md" className="bg-white/90 dark:bg-zinc-950/80 border-zinc-200 dark:border-zinc-800/90 shadow-xs">
          <Group gap="sm" align="flex-start" wrap="nowrap">
            <ThemeIcon size={38} radius="md" variant="light" color="blue">
              <Layers className="w-5 h-5" />
            </ThemeIcon>
            <div>
              <Text size="sm" fw={700}>Vertical Model Codes</Text>
              <Text size="xs" c="dimmed" mt={2}>
                Detects rotated single-letter stacks and reverses to real model codes
              </Text>
            </div>
          </Group>
        </Paper>

        <Paper withBorder radius="lg" p="md" className="bg-white/90 dark:bg-zinc-950/80 border-zinc-200 dark:border-zinc-800/90 shadow-xs">
          <Group gap="sm" align="flex-start" wrap="nowrap">
            <ThemeIcon size={38} radius="md" variant="light" color="teal">
              <ShieldCheck className="w-5 h-5" />
            </ThemeIcon>
            <div>
              <Text size="sm" fw={700}>Zero Disk Storage</Text>
              <Text size="xs" c="dimmed" mt={2}>
                Processed 100% in-memory for complete catalogue privacy
              </Text>
            </div>
          </Group>
        </Paper>
      </SimpleGrid>
    </div>
  );
};
