import React from 'react';
import {
  Group,
  Button,
  Badge,
  ActionIcon,
  Tooltip,
  Text,
  ThemeIcon,
  useMantineColorScheme,
  useComputedColorScheme,
} from '@mantine/core';
import {
  Moon,
  Sun,
  FileSpreadsheet,
  FileImage,
  Crop,
  Droplet,
  Sparkles,
  Zap,
  RotateCcw,
  Download,
  Layers,
  Wand2,
} from 'lucide-react';

export type ActiveTab =
  | 'auto-pipeline'
  | 'ai-image-gen'
  | 'batch-queue'
  | 'catalogue'
  | 'pdf-images'
  | 'resizer'
  | 'watermark';

interface NavbarProps {
  darkMode: boolean;
  setDarkMode: (val: boolean) => void;
  activeTab: ActiveTab;
  setActiveTab: (tab: ActiveTab) => void;
  onReplaySplash?: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  darkMode,
  setDarkMode,
  activeTab,
  setActiveTab,
  onReplaySplash,
}) => {
  const { setColorScheme } = useMantineColorScheme();
  const computedColorScheme = useComputedColorScheme('dark', { getInitialValueInEffect: true });
  const isDark = computedColorScheme === 'dark' || darkMode;

  const [updateInfo, setUpdateInfo] = React.useState<{
    has_update: boolean;
    latest_version: string;
  } | null>(null);
  const [isUpdating, setIsUpdating] = React.useState<boolean>(false);
  const [updateStatus, setUpdateStatus] = React.useState<string | null>(null);

  React.useEffect(() => {
    fetch('/api/app/check-update')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data && data.has_update) {
          setUpdateInfo(data);
        } else {
          setUpdateInfo(null);
        }
      })
      .catch(() => {
        setUpdateInfo(null);
      });
  }, []);

  const handleUpdate = async () => {
    if (isUpdating) return;
    setIsUpdating(true);
    setUpdateStatus('Downloading update...');
    try {
      const res = await fetch('/api/app/perform-update', { method: 'POST' });
      const data = await res.json();
      setUpdateStatus(data.message || 'Restarting...');
      setUpdateInfo(null);
      setTimeout(() => {
        window.location.reload();
      }, 5000);
    } catch {
      setUpdateStatus('Update failed');
      setTimeout(() => {
        setIsUpdating(false);
        setUpdateStatus(null);
      }, 3000);
    }
  };

  const toggleTheme = () => {
    const nextMode = !isDark;
    setColorScheme(nextMode ? 'dark' : 'light');
    setDarkMode(nextMode);
  };

  const tabs = [
    {
      id: 'auto-pipeline' as ActiveTab,
      label: 'Auto Pipeline',
      icon: Sparkles,
      badge: 'All-in-1',
    },
    {
      id: 'ai-image-gen' as ActiveTab,
      label: 'AI Image Gen',
      icon: Wand2,
      badge: 'AI',
    },
    {
      id: 'batch-queue' as ActiveTab,
      label: 'Batch Queue',
      icon: Layers,
      badge: 'Bulk PDF',
    },
    {
      id: 'catalogue' as ActiveTab,
      label: 'Parts to Excel',
      icon: FileSpreadsheet,
      badge: 'Yamaha',
    },
    {
      id: 'pdf-images' as ActiveTab,
      label: 'Extract Images',
      icon: FileImage,
      badge: 'New',
    },
    {
      id: 'resizer' as ActiveTab,
      label: 'Bulk Resizer',
      icon: Crop,
      badge: 'New',
    },
    {
      id: 'watermark' as ActiveTab,
      label: 'Watermark',
      icon: Droplet,
      badge: 'New',
    },
  ];

  return (
    <header className="sticky top-0 z-40 border-b border-zinc-200 dark:border-zinc-800/80 bg-white/95 dark:bg-black/95 backdrop-blur-xl transition-colors">
      <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-3">
        {/* Brand & Tagline */}
        <Group gap="sm" wrap="nowrap" className="shrink-0">
          <ThemeIcon
            size={40}
            radius="xl"
            variant="gradient"
            gradient={{ from: 'blue', to: 'indigo', deg: 135 }}
            className="shadow-sm shadow-blue-500/20"
          >
            <Zap className="w-5 h-5 text-white" />
          </ThemeIcon>
          <div>
            <Group gap={6} align="center">
              <Text fw={900} size="sm" className="tracking-wider uppercase font-sans">
                Converter <span className="font-light text-zinc-500 dark:text-zinc-400">Studio</span>
              </Text>
              <Badge variant="light" color="blue" size="xs" radius="sm">
                v1.0
              </Badge>
            </Group>
            <Text size="xs" c="dimmed" className="font-mono tracking-widest uppercase font-medium text-[10px]">
              Extract & Build Matrix
            </Text>
          </div>
        </Group>

        {/* Center Mantine Tab Navigation */}
        <nav className="hidden lg:flex items-center gap-1 p-1 bg-zinc-100/80 dark:bg-zinc-950/80 rounded-xl border border-zinc-200/80 dark:border-zinc-800/80 text-[11px] font-medium whitespace-nowrap">
          {tabs.map((t) => {
            const Icon = t.icon;
            const isActive = activeTab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setActiveTab(t.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all duration-150 whitespace-nowrap shrink-0 text-xs cursor-pointer ${
                  isActive
                    ? 'bg-blue-600 text-white font-semibold shadow-sm shadow-blue-500/30'
                    : 'text-zinc-600 dark:text-zinc-400 hover:text-black dark:hover:text-white hover:bg-zinc-200/60 dark:hover:bg-zinc-900/60'
                }`}
              >
                <Icon className={`w-3.5 h-3.5 shrink-0 ${isActive ? 'text-white' : 'text-zinc-500 dark:text-zinc-400'}`} />
                <span>{t.label}</span>
                {t.badge && (
                  <Badge
                    variant={isActive ? 'white' : 'light'}
                    color={isActive ? 'dark' : 'gray'}
                    size="xs"
                    radius="sm"
                    className="ml-0.5 text-[9px] px-1 py-0 h-4"
                  >
                    {t.badge}
                  </Badge>
                )}
              </button>
            );
          })}
        </nav>

        {/* Right Action Icons & Controls */}
        <Group gap="xs" wrap="nowrap" className="shrink-0">
          {updateInfo?.has_update && (
            <Button
              size="xs"
              color="teal"
              variant="filled"
              radius="md"
              leftSection={<Download className={`w-3.5 h-3.5 ${isUpdating ? 'animate-spin' : ''}`} />}
              loading={isUpdating}
              onClick={handleUpdate}
              className="animate-pulse shadow-sm shadow-teal-500/20"
            >
              {isUpdating ? (updateStatus ?? 'Updating...') : `Update v${updateInfo.latest_version}`}
            </Button>
          )}

          {onReplaySplash && (
            <Tooltip label="Replay Startup Screen" withArrow position="bottom">
              <ActionIcon
                variant="default"
                size="md"
                radius="md"
                onClick={onReplaySplash}
                aria-label="Replay Splash Screen"
              >
                <RotateCcw className="w-3.5 h-3.5 text-zinc-600 dark:text-zinc-400" />
              </ActionIcon>
            </Tooltip>
          )}

          <Tooltip label={isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode'} withArrow position="bottom">
            <ActionIcon
              variant="default"
              size="md"
              radius="md"
              onClick={toggleTheme}
              aria-label="Toggle Color Scheme"
            >
              {isDark ? (
                <Sun className="w-3.5 h-3.5 text-amber-400" />
              ) : (
                <Moon className="w-3.5 h-3.5 text-zinc-700" />
              )}
            </ActionIcon>
          </Tooltip>
        </Group>
      </div>

      {/* Mobile & Tablet Tab Scroll Bar */}
      <div className="lg:hidden flex items-center justify-start border-t border-zinc-200 dark:border-zinc-800/80 px-2 py-2 bg-white dark:bg-black text-[11px] font-medium overflow-x-auto no-scrollbar gap-1.5 safe-bottom">
        {tabs.map((t) => {
          const Icon = t.icon;
          const isActive = activeTab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg whitespace-nowrap shrink-0 text-xs transition-all cursor-pointer ${
                isActive
                  ? 'bg-blue-600 text-white font-semibold shadow-xs'
                  : 'text-zinc-600 dark:text-zinc-400 hover:text-black dark:hover:text-white bg-zinc-100 dark:bg-zinc-950'
              }`}
            >
              <Icon className={`w-3.5 h-3.5 shrink-0 ${isActive ? 'text-white' : 'text-zinc-500 dark:text-zinc-400'}`} />
              <span>{t.label}</span>
              {t.badge && (
                <Badge
                  variant={isActive ? 'white' : 'light'}
                  color={isActive ? 'dark' : 'gray'}
                  size="xs"
                  radius="sm"
                  className="text-[9px] px-1 py-0 h-4"
                >
                  {t.badge}
                </Badge>
              )}
            </button>
          );
        })}
      </div>
    </header>
  );
};
