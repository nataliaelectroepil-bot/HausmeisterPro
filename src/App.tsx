import { useCallback, useEffect, useMemo, useState } from 'react';
import { AdminDispatcherTab } from './components/AdminDispatcherTab';
import { BinsTab } from './components/BinsTab';
import { BottomNav } from './components/BottomNav';
import { CalendarTab } from './components/CalendarTab';
import { CreateTaskModal } from './components/CreateTaskModal';
import { DesktopSidebar } from './components/DesktopSidebar';
import { Header } from './components/Header';
import { LoginScreen } from './components/LoginScreen';
import { MapTab } from './components/MapTab';
import { ModulesDrawer } from './components/ModulesDrawer';
import { OfflineIndicator } from './components/OfflineIndicator';
import { ReminderBanner } from './components/ReminderBanner';
import { TaskDetailModal } from './components/TaskDetailModal';
import { TasksTab } from './components/TasksTab';
import { TimeTrackingTab } from './components/TimeTrackingTab';
import { GartenModule } from './components/modules/GartenModule';
import { ReinigungModule } from './components/modules/ReinigungModule';
import { UebergabeModule } from './components/modules/UebergabeModule';
import { WinterdienstModule } from './components/modules/WinterdienstModule';
import { ZaehlerstandModule } from './components/modules/ZaehlerstandModule';
import { LanguageProvider, useTranslation } from './i18n/LanguageContext';
import { pocketbaseService } from './services/pocketbaseService';
import {
  ActiveTab,
  AppNotification,
  BinSchedule,
  CleaningLog,
  DocLanguageCode,
  FacilityTask,
  GardenLog,
  HandoverProtocol,
  LanguageCode,
  MeterReading,
  PropertyObject,
  TaskPhoto,
  TimeEntry,
  User,
  WinterLog,
} from './types/facility';
import { getISOWeekAndYear, isDateTomorrow, isTaskOverdue } from './utils/dateUtils';

function LoadingScreen() {
  const { t } = useTranslation();
  return (
    <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center p-6">
      <div className="text-center space-y-3">
        <div className="h-10 w-10 rounded-xl bg-orange-500 mx-auto animate-pulse" />
        <p className="font-display text-sm font-semibold text-slate-300">
          {t('app.loading')}
        </p>
      </div>
    </div>
  );
}

export default function App() {
  const [uiLanguage, setUiLanguage] = useState<LanguageCode>(() =>
    pocketbaseService.getSavedUiLanguage()
  );
  const [docLanguage, setDocLanguage] = useState<DocLanguageCode>(() =>
    pocketbaseService.getCompanyDocLanguage()
  );
  const [users, setUsers] = useState<User[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(() =>
    pocketbaseService.getCurrentUserId()
  );
  const [objects, setObjects] = useState<PropertyObject[]>([]);
  const [tasks, setTasks] = useState<FacilityTask[]>([]);
  const [binSchedules, setBinSchedules] = useState<BinSchedule[]>([]);
  const [timeEntries, setTimeEntries] = useState<TimeEntry[]>([]);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);

  // 5 Specialized Enterprise Modules State
  const [winterLogs, setWinterLogs] = useState<WinterLog[]>([]);
  const [meterReadings, setMeterReadings] = useState<MeterReading[]>([]);
  const [handoverProtocols, setHandoverProtocols] = useState<HandoverProtocol[]>([]);
  const [cleaningLogs, setCleaningLogs] = useState<CleaningLog[]>([]);
  const [gardenLogs, setGardenLogs] = useState<GardenLog[]>([]);

  const [loaded, setLoaded] = useState(false);

  const [activeTab, setActiveTab] = useState<ActiveTab>('karte');
  const [moduleObjectId, setModuleObjectId] = useState<string | undefined>(undefined);
  const [showModulesDrawer, setShowModulesDrawer] = useState(false);
  const [drawerDefaultObjectId, setDrawerDefaultObjectId] = useState<string | undefined>(
    undefined
  );

  const [isDark, setIsDark] = useState<boolean>(() => {
    try {
      return localStorage.getItem('hmpro_theme') === 'dark';
    } catch {
      return false;
    }
  });
  const [bannerDismissed, setBannerDismissed] = useState(false);

  // Modals
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [showCreateTaskModal, setShowCreateTaskModal] = useState(false);
  const [createTaskDefaultDate, setCreateTaskDefaultDate] = useState<string | undefined>(
    undefined
  );

  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDark);
    try {
      localStorage.setItem('hmpro_theme', isDark ? 'dark' : 'light');
    } catch {
      // ignore
    }
  }, [isDark]);

  // Load initial data from PocketBase service layer
  useEffect(() => {
    let active = true;
    async function loadAll() {
      const [u, o, t, b, te, n, wl, mr, hp, cl, gl] = await Promise.all([
        pocketbaseService.getUsers(),
        pocketbaseService.getObjects(),
        pocketbaseService.getTasks(),
        pocketbaseService.getBinSchedules(),
        pocketbaseService.getTimeEntries(),
        pocketbaseService.getNotifications(),
        pocketbaseService.getWinterLogs(),
        pocketbaseService.getMeterReadings(),
        pocketbaseService.getHandoverProtocols(),
        pocketbaseService.getCleaningLogs(),
        pocketbaseService.getGardenLogs(),
      ]);
      if (!active) return;
      setUsers(u);
      setObjects(o);
      setTasks(t);
      setBinSchedules(b);
      setTimeEntries(te);
      setNotifications(n);
      setWinterLogs(wl);
      setMeterReadings(mr);
      setHandoverProtocols(hp);
      setCleaningLogs(cl);
      setGardenLogs(gl);
      if (currentUserId) {
        const matched = u.find((usr) => usr.id === currentUserId);
        if (matched?.language) {
          setUiLanguage(matched.language);
          pocketbaseService.setSavedUiLanguage(matched.language);
        }
      }
      setLoaded(true);
    }
    loadAll();
    return () => {
      active = false;
    };
  }, []);

  const currentUser = useMemo(
    () => users.find((u) => u.id === currentUserId) ?? null,
    [users, currentUserId]
  );

  const selectedTask = useMemo(
    () => tasks.find((t) => t.id === selectedTaskId) ?? null,
    [tasks, selectedTaskId]
  );

  const openTasksCount = useMemo(
    () => tasks.filter((t) => t.status !== 'erledigt').length,
    [tasks]
  );

  const overdueCount = useMemo(
    () => tasks.filter((t) => isTaskOverdue(t.due_date, t.status)).length,
    [tasks]
  );

  const tomorrowOpenCount = useMemo(
    () =>
      tasks.filter((t) => t.status !== 'erledigt' && isDateTomorrow(t.due_date)).length,
    [tasks]
  );

  const pendingBinsThisWeek = useMemo(() => {
    const { kw, year } = getISOWeekAndYear(new Date());
    return binSchedules.filter(
      (b) => b.kw === kw && b.year === year && (!b.status_out || !b.status_in)
    ).length;
  }, [binSchedules]);

  // Handlers
  const handleChangeLanguage = useCallback(
    (lang: LanguageCode) => {
      setUiLanguage(lang);
      pocketbaseService.setSavedUiLanguage(lang);
      if (currentUserId) {
        void pocketbaseService.updateUserLanguage(currentUserId, lang).then((updated) => {
          setUsers(updated);
        });
      }
    },
    [currentUserId]
  );

  const handleChangeDocLanguage = useCallback((lang: DocLanguageCode) => {
    setDocLanguage(lang);
    pocketbaseService.setCompanyDocLanguage(lang);
  }, []);

  const handleLogin = (user: User) => {
    pocketbaseService.setCurrentUserId(user.id);
    setCurrentUserId(user.id);
    if (user.language) {
      setUiLanguage(user.language);
      pocketbaseService.setSavedUiLanguage(user.language);
    }
    setActiveTab('karte');
  };

  const handleLogout = () => {
    pocketbaseService.setCurrentUserId(null);
    setCurrentUserId(null);
  };

  const handleUpdateTask = useCallback(
    async (taskId: string, patch: Partial<FacilityTask>) => {
      const updated = await pocketbaseService.updateTask(taskId, patch);
      setTasks(updated);
    },
    []
  );

  const handleQuickCompleteWithPhoto = useCallback(
    async (task: FacilityTask, photo: TaskPhoto) => {
      const updated = await pocketbaseService.updateTask(task.id, {
        photos: [...task.photos, photo],
        status: 'erledigt',
        completed_at: new Date().toISOString(),
      });
      setTasks(updated);
    },
    []
  );

  const handleCreateObject = useCallback(async (obj: Omit<PropertyObject, 'id'>) => {
    const created = await pocketbaseService.createObject(obj);
    setObjects((prev) => [...prev, created]);
    return created;
  }, []);

  const handleCreateTask = useCallback(
    async (input: Omit<FacilityTask, 'id' | 'created_at'>) => {
      const created = await pocketbaseService.createTask(input);
      setTasks((prev) => [created, ...prev]);
    },
    []
  );

  const handleUpdateBinSchedule = useCallback(
    async (id: string, patch: Partial<BinSchedule>) => {
      const updated = await pocketbaseService.updateBinSchedule(id, patch);
      setBinSchedules(updated);
    },
    []
  );

  const handleCreateBinSchedules = useCallback(
    async (items: Array<Omit<BinSchedule, 'id'>>) => {
      const updated = await pocketbaseService.createBinSchedules(items);
      setBinSchedules(updated);
    },
    []
  );

  const handleUpsertTimeEntry = useCallback(async (entry: TimeEntry) => {
    const updated = await pocketbaseService.upsertTimeEntry(entry);
    setTimeEntries(updated);
  }, []);

  const handleMarkNotificationRead = useCallback(async (id: string) => {
    const updated = await pocketbaseService.markNotificationRead(id);
    setNotifications(updated);
  }, []);

  const handleMarkAllRead = useCallback(async () => {
    const updated = await pocketbaseService.markAllNotificationsRead();
    setNotifications(updated);
  }, []);

  // 5 Module Handlers
  const handleCreateWinterLog = useCallback(async (log: Omit<WinterLog, 'id'>) => {
    const updated = await pocketbaseService.createWinterLog(log);
    setWinterLogs(updated);
  }, []);

  const handleCreateMeterReading = useCallback(async (reading: Omit<MeterReading, 'id'>) => {
    const updated = await pocketbaseService.createMeterReading(reading);
    setMeterReadings(updated);
  }, []);

  const handleCreateHandoverProtocol = useCallback(
    async (protocol: Omit<HandoverProtocol, 'id' | 'created_at'>) => {
      const { created, all } = await pocketbaseService.createHandoverProtocol(protocol);
      setHandoverProtocols(all);
      return created;
    },
    []
  );

  const handleCreateCleaningLog = useCallback(async (log: Omit<CleaningLog, 'id'>) => {
    const updated = await pocketbaseService.createCleaningLog(log);
    setCleaningLogs(updated);
  }, []);

  const handleCreateGardenLog = useCallback(async (log: Omit<GardenLog, 'id'>) => {
    const updated = await pocketbaseService.createGardenLog(log);
    setGardenLogs(updated);
  }, []);

  return (
    <LanguageProvider
      language={uiLanguage}
      docLanguage={docLanguage}
      onChangeLanguage={handleChangeLanguage}
      onChangeDocLanguage={handleChangeDocLanguage}
    >
      {!loaded ? (
        <LoadingScreen />
      ) : !currentUser ? (
        <LoginScreen users={users} onSelectUser={handleLogin} />
      ) : (
        <div className="min-h-screen flex flex-col bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100">
      <Header
        currentUser={currentUser}
        isDark={isDark}
        onToggleTheme={() => setIsDark((prev) => !prev)}
        notifications={notifications}
        onMarkNotificationRead={handleMarkNotificationRead}
        onMarkAllRead={handleMarkAllRead}
        onOpenNewTask={() => {
          setCreateTaskDefaultDate(undefined);
          setShowCreateTaskModal(true);
        }}
        onLogout={handleLogout}
        onNavigateTab={setActiveTab}
        activeTab={activeTab}
      />

      {!bannerDismissed && (
        <ReminderBanner
          tomorrowCount={tomorrowOpenCount}
          overdueCount={overdueCount}
          onDismiss={() => setBannerDismissed(true)}
          onViewTasks={() => setActiveTab('aufgaben')}
        />
      )}

      <div className="flex-1 flex min-h-0">
        <DesktopSidebar
          activeTab={activeTab}
          onSelectTab={setActiveTab}
          currentUser={currentUser}
          openTasksCount={openTasksCount}
          overdueCount={overdueCount}
          pendingBinsCount={pendingBinsThisWeek}
        />

        <main className="flex-1 min-w-0 overflow-y-auto pb-24 md:pb-10">
          <div className="max-w-7xl mx-auto p-3.5 sm:p-6">
            {activeTab === 'karte' && (
              <MapTab
                objects={objects}
                tasks={tasks}
                onOpenTaskDetail={(task) => setSelectedTaskId(task.id)}
                onQuickCompleteWithPhoto={handleQuickCompleteWithPhoto}
                onOpenModulesForObject={(objId) => {
                  setDrawerDefaultObjectId(objId);
                  setShowModulesDrawer(true);
                }}
              />
            )}

            {activeTab === 'aufgaben' && (
              <TasksTab
                tasks={tasks}
                objects={objects}
                users={users}
                onOpenTaskDetail={(task) => setSelectedTaskId(task.id)}
                onQuickCompleteWithPhoto={handleQuickCompleteWithPhoto}
              />
            )}

            {activeTab === 'muelltonnen' && (
              <BinsTab
                schedules={binSchedules}
                objects={objects}
                onUpdateSchedule={handleUpdateBinSchedule}
                onCreateSchedules={handleCreateBinSchedules}
              />
            )}

            {activeTab === 'kalender' && (
              <CalendarTab
                tasks={tasks}
                binSchedules={binSchedules}
                objects={objects}
                onOpenTaskDetail={(task) => setSelectedTaskId(task.id)}
                onCreateTaskForDate={(dateStr) => {
                  setCreateTaskDefaultDate(dateStr);
                  setShowCreateTaskModal(true);
                }}
                onToggleBinOut={(bin) =>
                  handleUpdateBinSchedule(bin.id, {
                    status_out: !bin.status_out,
                    time_out: !bin.status_out ? new Date().toISOString() : undefined,
                  })
                }
              />
            )}

            {activeTab === 'arbeitszeit' && (
              <TimeTrackingTab
                currentUser={currentUser}
                timeEntries={timeEntries}
                onUpsertTimeEntry={handleUpsertTimeEntry}
              />
            )}

            {activeTab === 'disposition' && currentUser.role === 'admin' && (
              <AdminDispatcherTab
                users={users}
                objects={objects}
                tasks={tasks}
                timeEntries={timeEntries}
                onAssignTask={(taskId, userId) =>
                  handleUpdateTask(taskId, { assigned_to: userId })
                }
                onOpenTaskDetail={(task) => setSelectedTaskId(task.id)}
              />
            )}

            {activeTab === 'winterdienst' && (
              <WinterdienstModule
                objects={objects}
                users={users}
                currentUser={currentUser}
                logs={winterLogs}
                initialObjectId={moduleObjectId}
                onCreateLog={handleCreateWinterLog}
              />
            )}

            {activeTab === 'zaehlerstand' && (
              <ZaehlerstandModule
                objects={objects}
                users={users}
                currentUser={currentUser}
                readings={meterReadings}
                initialObjectId={moduleObjectId}
                onCreateReading={handleCreateMeterReading}
              />
            )}

            {activeTab === 'uebergabe' && (
              <UebergabeModule
                objects={objects}
                currentUser={currentUser}
                protocols={handoverProtocols}
                initialObjectId={moduleObjectId}
                onCreateProtocol={handleCreateHandoverProtocol}
                onJumpToMeters={(objId) => {
                  setModuleObjectId(objId);
                  setActiveTab('zaehlerstand');
                }}
              />
            )}

            {activeTab === 'reinigung' && (
              <ReinigungModule
                objects={objects}
                users={users}
                currentUser={currentUser}
                logs={cleaningLogs}
                initialObjectId={moduleObjectId}
                onCreateLog={handleCreateCleaningLog}
              />
            )}

            {activeTab === 'garten' && (
              <GartenModule
                objects={objects}
                users={users}
                currentUser={currentUser}
                logs={gardenLogs}
                initialObjectId={moduleObjectId}
                onCreateLog={handleCreateGardenLog}
              />
            )}
          </div>
        </main>
      </div>

      <BottomNav
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        onOpenModules={() => {
          setDrawerDefaultObjectId(undefined);
          setShowModulesDrawer(true);
        }}
        openTasksCount={openTasksCount}
      />

      <OfflineIndicator />

      {showModulesDrawer && (
        <ModulesDrawer
          objects={objects}
          defaultObjectId={drawerDefaultObjectId}
          onSelectModule={(tab, objId) => {
            setModuleObjectId(objId);
            setActiveTab(tab);
            setShowModulesDrawer(false);
          }}
          onClose={() => setShowModulesDrawer(false)}
        />
      )}

      {selectedTask && (
        <TaskDetailModal
          task={selectedTask}
          objectItem={objects.find((o) => o.id === selectedTask.object_id)}
          assignee={users.find((u) => u.id === selectedTask.assigned_to)}
          onClose={() => setSelectedTaskId(null)}
          onUpdateTask={handleUpdateTask}
        />
      )}

      {showCreateTaskModal && (
        <CreateTaskModal
          objects={objects}
          users={users}
          currentUser={currentUser}
          defaultDate={createTaskDefaultDate}
          onClose={() => setShowCreateTaskModal(false)}
          onCreateObject={handleCreateObject}
          onCreateTask={handleCreateTask}
        />
      )}
        </div>
      )}
    </LanguageProvider>
  );
}
