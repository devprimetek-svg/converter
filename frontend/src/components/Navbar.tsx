import React, { useState, useEffect } from 'react';
import {
  Group,
  Button,
  Badge,
  ActionIcon,
  Tooltip,
  Text,
  ThemeIcon,
  Modal,
  PasswordInput,
  Stack,
  Divider,
  Paper,
  Menu,
  useMantineColorScheme,
  useComputedColorScheme,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
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
  Settings,
  Server,
  Key,
  Trash2,
  ChevronDown,
  Shield,
  FileText,
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

  // App version and update state
  const [appVersion, setAppVersion] = useState<string>('2.6.12');
  const [updateInfo, setUpdateInfo] = useState<{
    has_update: boolean;
    latest_version: string;
  } | null>(null);
  const [isUpdating, setIsUpdating] = useState<boolean>(false);
  const [updateStatus, setUpdateStatus] = useState<string | null>(null);

  // Live Server Health & Latency State
  const [serverStatus, setServerStatus] = useState<'online' | 'checking' | 'offline'>('checking');
  const [serverLatency, setServerLatency] = useState<number | null>(null);

  // Settings Modal State
  const [settingsOpened, setSettingsOpened] = useState(false);
  const [leonardoKey, setLeonardoKey] = useState<string>(() => localStorage.getItem('leonardo_api_key') || '');
  const [geminiKey, setGeminiKey] = useState<string>(() => localStorage.getItem('gemini_api_key') || '');

  // Fetch real app version and check update on mount
  useEffect(() => {
    // 1. Fetch Version
    fetch('/api/app/version')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data && data.version) {
          setAppVersion(data.version);
        }
      })
      .catch(() => {});

    // 2. Check for Updates
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

    // 3. Ping Server Health & Measure Latency
    const checkHealth = async () => {
      const start = performance.now();
      try {
        const res = await fetch('/api/health');
        const duration = Math.round(performance.now() - start);
        if (res.ok) {
          setServerStatus('online');
          setServerLatency(duration);
        } else {
          setServerStatus('offline');
        }
      } catch {
        setServerStatus('offline');
      }
    };

    checkHealth();
    const healthInterval = setInterval(checkHealth, 30000);
    return () => clearInterval(healthInterval);
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

  const saveSettings = () => {
    localStorage.setItem('leonardo_api_key', leonardoKey.trim());
    localStorage.setItem('gemini_api_key', geminiKey.trim());
    setSettingsOpened(false);
    notifications.show({
      title: 'Settings Saved',
      message: 'Aapki API keys aur settings save ho chuki hain.',
      color: 'teal',
    });
  };

  const clearAppCache = () => {
    localStorage.removeItem('leonardo_api_key');
    localStorage.removeItem('gemini_api_key');
    setLeonardoKey('');
    setGeminiKey('');
    notifications.show({
      title: 'Settings Reset',
      message: 'Purani temporary settings aur saved keys clear kar di gayi hain.',
      color: 'blue',
    });
  };

  // Simple, Human-Friendly Tabs Definition
  const documentTabs = [
    {
      id: 'auto-pipeline' as ActiveTab,
      label: 'All-in-One Auto',
      description: '1-Click me Excel, diagram photos aur watermark sab ek sath',
      icon: Sparkles,
      badge: 'All-in-1',
    },
    {
      id: 'batch-queue' as ActiveTab,
      label: 'Bulk PDF Queue',
      description: 'Ek sath kai saari PDF catalogues upload karke convert karein',
      icon: Layers,
      badge: 'Bulk PDF',
    },
    {
      id: 'catalogue' as ActiveTab,
      label: 'Catalogue to Excel',
      description: 'PDF catalogue se parts number, description aur quantity Excel me nikalein',
      icon: FileSpreadsheet,
      badge: 'Yamaha',
    },
  ];

  const mediaTabs = [
    {
      id: 'ai-image-gen' as ActiveTab,
      label: 'Diagram to 3D Photo',
      description: 'Diagram sketch se realistic 3D product photo banayein (AI)',
      icon: Wand2,
      badge: 'AI Photo',
    },
    {
      id: 'pdf-images' as ActiveTab,
      label: 'Extract PDF Photos',
      description: 'Catalogue PDF ke andar se saari diagram photos bahar nikalein',
      icon: FileImage,
      badge: 'Photos',
    },
    {
      id: 'resizer' as ActiveTab,
      label: 'Photo Resizer',
      description: 'Website aur e-commerce ke liye photos ko ek sath sahi size me karein',
      icon: Crop,
      badge: 'Resize',
    },
    {
      id: 'watermark' as ActiveTab,
      label: 'Logo / Watermark',
      description: 'Photos par apni shop ka naam ya brand logo lagayein',
      icon: Droplet,
      badge: 'Logo',
    },
  ];

  const allTabs = [...documentTabs, ...mediaTabs];
  const activeTabMeta = allTabs.find((t) => t.id === activeTab);
  const isDocumentTabActive = documentTabs.some((t) => t.id === activeTab);
  const isMediaTabActive = mediaTabs.some((t) => t.id === activeTab);

  return (
    <>
      <header className="sticky top-0 z-40 border-b border-zinc-200 dark:border-zinc-800/80 bg-white/95 dark:bg-black/95 backdrop-blur-xl transition-colors">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-3">
          {/* Brand, Realtime Version, and Live Status */}
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
                <Tooltip label={`Converter Studio Release v${appVersion}`} withArrow position="bottom">
                  <Badge variant="light" color="blue" size="xs" radius="sm" className="cursor-default font-mono">
                    v{appVersion}
                  </Badge>
                </Tooltip>
              </Group>
              <Group gap={6} align="center">
                <Text size="xs" c="dimmed" className="font-mono tracking-widest uppercase font-medium text-[10px]">
                  Automotive Parts & Media Suite
                </Text>
                <span className="text-zinc-300 dark:text-zinc-700">•</span>
                <Tooltip
                  label={
                    serverStatus === 'online'
                      ? `Server Online hai (Speed: ${serverLatency ?? 0}ms)`
                      : 'Server se connect ho raha hai...'
                  }
                  withArrow
                  position="bottom"
                >
                  <Group gap={4} className="cursor-default">
                    <span
                      className={`w-1.5 h-1.5 rounded-full ${
                        serverStatus === 'online'
                          ? 'bg-emerald-500 animate-pulse'
                          : serverStatus === 'checking'
                          ? 'bg-amber-500 animate-spin'
                          : 'bg-red-500'
                      }`}
                    />
                    <Text size="xs" c={serverStatus === 'online' ? 'teal' : 'dimmed'} className="text-[10px] font-mono">
                      {serverStatus === 'online' ? `${serverLatency ?? 0}ms` : 'offline'}
                    </Text>
                  </Group>
                </Tooltip>
              </Group>
            </div>
          </Group>

          {/* Categorized Desktop Navigation */}
          <nav className="hidden lg:flex items-center gap-2">
            {/* Category 1: PDF to Excel Tools */}
            <Menu shadow="md" width={300} position="bottom-start" radius="md" withArrow>
              <Menu.Target>
                <Button
                  variant={isDocumentTabActive ? 'filled' : 'subtle'}
                  color={isDocumentTabActive ? 'blue' : 'gray'}
                  size="xs"
                  radius="md"
                  leftSection={<FileText className="w-3.5 h-3.5" />}
                  rightSection={<ChevronDown className="w-3 h-3 opacity-70" />}
                  className="font-medium text-xs"
                >
                  PDF to Excel Tools
                  {isDocumentTabActive && (
                    <Badge size="xs" variant="white" color="dark" radius="sm" className="ml-1 text-[9px] px-1 py-0 h-4">
                      {activeTabMeta?.badge}
                    </Badge>
                  )}
                </Button>
              </Menu.Target>

              <Menu.Dropdown className="border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-1.5 shadow-xl">
                <Menu.Label className="text-[10px] uppercase font-mono tracking-wider">
                  Catalogue & Excel Tools
                </Menu.Label>
                {documentTabs.map((t) => {
                  const Icon = t.icon;
                  const isActive = activeTab === t.id;
                  return (
                    <Menu.Item
                      key={t.id}
                      onClick={() => setActiveTab(t.id)}
                      leftSection={
                        <ThemeIcon size={24} radius="sm" variant={isActive ? 'filled' : 'light'} color="blue">
                          <Icon className="w-3.5 h-3.5" />
                        </ThemeIcon>
                      }
                      rightSection={
                        <Badge size="xs" variant={isActive ? 'filled' : 'light'} color="blue">
                          {t.badge}
                        </Badge>
                      }
                      className={isActive ? 'bg-blue-50 dark:bg-blue-950/50 font-semibold' : ''}
                    >
                      <Text size="xs" fw={isActive ? 700 : 500}>
                        {t.label}
                      </Text>
                      <Text size="xs" c="dimmed" className="text-[10px] line-clamp-1">
                        {t.description}
                      </Text>
                    </Menu.Item>
                  );
                })}
              </Menu.Dropdown>
            </Menu>

            {/* Category 2: Photos & Logo Tools */}
            <Menu shadow="md" width={300} position="bottom-start" radius="md" withArrow>
              <Menu.Target>
                <Button
                  variant={isMediaTabActive ? 'filled' : 'subtle'}
                  color={isMediaTabActive ? 'indigo' : 'gray'}
                  size="xs"
                  radius="md"
                  leftSection={<Wand2 className="w-3.5 h-3.5" />}
                  rightSection={<ChevronDown className="w-3 h-3 opacity-70" />}
                  className="font-medium text-xs"
                >
                  Photos & Logo Tools
                  {isMediaTabActive && (
                    <Badge size="xs" variant="white" color="dark" radius="sm" className="ml-1 text-[9px] px-1 py-0 h-4">
                      {activeTabMeta?.badge}
                    </Badge>
                  )}
                </Button>
              </Menu.Target>

              <Menu.Dropdown className="border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-1.5 shadow-xl">
                <Menu.Label className="text-[10px] uppercase font-mono tracking-wider">
                  Photo & Branding Tools
                </Menu.Label>
                {mediaTabs.map((t) => {
                  const Icon = t.icon;
                  const isActive = activeTab === t.id;
                  return (
                    <Menu.Item
                      key={t.id}
                      onClick={() => setActiveTab(t.id)}
                      leftSection={
                        <ThemeIcon size={24} radius="sm" variant={isActive ? 'filled' : 'light'} color="indigo">
                          <Icon className="w-3.5 h-3.5" />
                        </ThemeIcon>
                      }
                      rightSection={
                        <Badge size="xs" variant={isActive ? 'filled' : 'light'} color="indigo">
                          {t.badge}
                        </Badge>
                      }
                      className={isActive ? 'bg-indigo-50 dark:bg-indigo-950/50 font-semibold' : ''}
                    >
                      <Text size="xs" fw={isActive ? 700 : 500}>
                        {t.label}
                      </Text>
                      <Text size="xs" c="dimmed" className="text-[10px] line-clamp-1">
                        {t.description}
                      </Text>
                    </Menu.Item>
                  );
                })}
              </Menu.Dropdown>
            </Menu>

            {/* Current Active Tool Highlight Indicator */}
            {activeTabMeta && (
              <Paper
                withBorder
                radius="md"
                px="sm"
                py={4}
                className="bg-zinc-100/70 dark:bg-zinc-900/60 border-zinc-200 dark:border-zinc-800 flex items-center gap-2"
              >
                <activeTabMeta.icon className="w-3.5 h-3.5 text-blue-500" />
                <Text size="xs" fw={700} className="font-sans">
                  {activeTabMeta.label}
                </Text>
              </Paper>
            )}
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

            {/* Settings Modal Launcher */}
            <Tooltip label="App Settings & API Keys" withArrow position="bottom">
              <ActionIcon
                variant="default"
                size="md"
                radius="md"
                onClick={() => setSettingsOpened(true)}
                aria-label="Settings"
                className="border-zinc-200 dark:border-zinc-800"
              >
                <Settings className="w-3.5 h-3.5 text-zinc-600 dark:text-zinc-400" />
              </ActionIcon>
            </Tooltip>

            {/* Replay Splash Screen */}
            {onReplaySplash && (
              <Tooltip label="Replay Welcome Screen" withArrow position="bottom">
                <ActionIcon
                  variant="default"
                  size="md"
                  radius="md"
                  onClick={onReplaySplash}
                  aria-label="Replay Welcome Screen"
                  className="border-zinc-200 dark:border-zinc-800"
                >
                  <RotateCcw className="w-3.5 h-3.5 text-zinc-600 dark:text-zinc-400" />
                </ActionIcon>
              </Tooltip>
            )}

            {/* Dark / Light Mode Switch */}
            <Tooltip label={isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode'} withArrow position="bottom">
              <ActionIcon
                variant="default"
                size="md"
                radius="md"
                onClick={toggleTheme}
                aria-label="Toggle Color Scheme"
                className="border-zinc-200 dark:border-zinc-800"
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
          {allTabs.map((t) => {
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

      {/* Studio Settings & API Configuration Modal */}
      <Modal
        opened={settingsOpened}
        onClose={() => setSettingsOpened(false)}
        title={
          <Group gap="xs">
            <ThemeIcon size={28} radius="md" variant="light" color="blue">
              <Settings className="w-4 h-4" />
            </ThemeIcon>
            <Text fw={700} size="sm">
              App Settings & Configuration
            </Text>
          </Group>
        }
        radius="lg"
        size="lg"
        centered
      >
        <Stack gap="md">
          {/* Server Status Card */}
          <Paper withBorder radius="md" p="md" className="bg-zinc-50 dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800">
            <Group justify="space-between">
              <Group gap="xs">
                <Server className="w-4 h-4 text-blue-500" />
                <Text size="xs" fw={700}>Server Connection</Text>
              </Group>
              <Badge variant="dot" color={serverStatus === 'online' ? 'teal' : 'red'} size="sm">
                {serverStatus === 'online' ? `READY (${serverLatency ?? 0}ms)` : 'OFFLINE'}
              </Badge>
            </Group>
            <Text size="xs" c="dimmed" mt={4}>
              Aapki files computer memory me securely process hoti hain aur permanent save nahi ki jati.
            </Text>
          </Paper>

          <Divider label="AI Photo Generation Keys (Optional)" labelPosition="center" />

          {/* Leonardo.ai API Key */}
          <PasswordInput
            label="Leonardo.ai API Key"
            description="Optional: Diagram sketch se realistic 3D part photo banane ke liye use hota hai."
            placeholder="e.g. 1a2b3c4d-5e6f-..."
            value={leonardoKey}
            onChange={(e) => setLeonardoKey(e.target.value)}
            leftSection={<Key className="w-3.5 h-3.5 text-indigo-500" />}
            radius="md"
          />

          {/* Google Gemini API Key */}
          <PasswordInput
            label="Google Gemini API Key"
            description="Optional: Smart parts description aur catalogue analysis ke liye use hota hai."
            placeholder="e.g. AIzaSy..."
            value={geminiKey}
            onChange={(e) => setGeminiKey(e.target.value)}
            leftSection={<Key className="w-3.5 h-3.5 text-blue-500" />}
            radius="md"
          />

          <Divider label="App Information" labelPosition="center" />

          {/* System Info */}
          <Group justify="space-between" align="center">
            <Group gap="xs">
              <Shield className="w-4 h-4 text-teal-500" />
              <div>
                <Text size="xs" fw={600}>Application Version</Text>
                <Text size="xs" c="dimmed">Converter Studio Release v{appVersion}</Text>
              </div>
            </Group>

            <Button
              size="xs"
              variant="light"
              color="red"
              leftSection={<Trash2 className="w-3.5 h-3.5" />}
              onClick={clearAppCache}
            >
              Reset App Settings
            </Button>
          </Group>

          {/* Save Button */}
          <Group justify="flex-end" mt="md">
            <Button variant="default" size="xs" onClick={() => setSettingsOpened(false)}>
              Cancel
            </Button>
            <Button size="xs" color="blue" onClick={saveSettings}>
              Save Settings
            </Button>
          </Group>
        </Stack>
      </Modal>
    </>
  );
};
