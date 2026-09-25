import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { CalendarClock, CheckCircle2, DatabaseBackup, Download, FolderOpen, HardDrive, RefreshCw, Trash2, UploadCloud } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api/client';
import { queryClient } from '../../queryClient';
import { ConfirmModal } from '../../components/ui/ConfirmModal';
import { useUiStore } from '../../store/ui';
import { useAuthStore } from '../../store/auth';

declare global {
  interface Window {
    electronAPI?: {
      selectFolder: () => Promise<string | undefined>;
      isElectron?: boolean;
    };
  }
}

type BackupGroupKey = 'ADMIN' | 'PRODUCTION_MANAGER' | 'CASHIER';

interface BackupGroup {
  key: BackupGroupKey;
  label: string;
  description: string;
  sizeBytes: number;
  sizeFormatted: string;
}

interface BackupGroupsResponse {
  success: boolean;
  data: BackupGroup[];
  totalSizeFormatted: string;
  fullDatabaseSizeBytes?: number;
  fullDatabaseSizeFormatted?: string;
}

interface BackupHistory {
  id: string;
  filename: string;
  filePath: string;
  sizeBytes: number;
  sizeFormatted: string;
  groups: BackupGroupKey[];
  type: 'MANUAL' | 'AUTO';
  createdAt: string;
}

interface BackupSchedule {
  id?: string;
  enabled: boolean;
  frequency: 'DAILY' | 'WEEKLY' | 'MONTHLY';
  time: string;
  dayOfWeek?: number | null;
  dayOfMonth?: number | null;
  keepLast: number;
  destination: string;
  groups: BackupGroupKey[];
}

const defaultGroups: BackupGroupKey[] = ['ADMIN', 'PRODUCTION_MANAGER', 'CASHIER'];
const defaultDestination = 'D:\\Backups\\EasternSweets';

const formatDate = (value?: string) =>
  value
    ? new Intl.DateTimeFormat('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      }).format(new Date(value))
    : 'No backup yet';

export default function Backup() {
  const navigate = useNavigate();
  const toast = useUiStore((state) => state.toast);
  const logout = useAuthStore((state) => state.logout);
  const restoreInputRef = useRef<HTMLInputElement | null>(null);
  const [selectedGroups, setSelectedGroups] = useState<BackupGroupKey[]>(defaultGroups);
  const [destination, setDestination] = useState(defaultDestination);
  const [deleteTarget, setDeleteTarget] = useState<BackupHistory | null>(null);
  const [resetOpen, setResetOpen] = useState(false);
  const [restoreOpen, setRestoreOpen] = useState(false);
  const [restoreFiles, setRestoreFiles] = useState<File[]>([]);
  const [schedule, setSchedule] = useState<BackupSchedule>({
    enabled: false,
    frequency: 'DAILY',
    time: '23:00',
    dayOfWeek: 0,
    dayOfMonth: 1,
    keepLast: 10,
    destination: defaultDestination,
    groups: defaultGroups
  });

  const groupQuery = useQuery({
    queryKey: ['backup-groups'],
    queryFn: async () => (await api.get<BackupGroupsResponse>('/api/settings/backup/groups')).data
  });

  const historyQuery = useQuery({
    queryKey: ['backup-history'],
    queryFn: async () => (await api.get<{ success: boolean; data: BackupHistory[] }>('/api/settings/backup/history')).data.data
  });

  const scheduleQuery = useQuery({
    queryKey: ['backup-schedule'],
    queryFn: async () => (await api.get<{ success: boolean; data: BackupSchedule }>('/api/settings/backup/schedule')).data.data
  });

  useEffect(() => {
    if (scheduleQuery.data) {
      setSchedule({
        ...scheduleQuery.data,
        destination: scheduleQuery.data.destination || defaultDestination,
        groups: scheduleQuery.data.groups?.length ? scheduleQuery.data.groups : defaultGroups
      });
      if (scheduleQuery.data.destination) setDestination(scheduleQuery.data.destination);
    }
  }, [scheduleQuery.data]);

  const groups = groupQuery.data?.data || [];
  const allSelected = selectedGroups.length === defaultGroups.length;
  const selectedSize = useMemo(() => groups.filter((group) => selectedGroups.includes(group.key)).reduce((sum, group) => sum + group.sizeBytes, 0), [groups, selectedGroups]);
  const selectedSizeFormatted = allSelected && groupQuery.data?.fullDatabaseSizeFormatted
    ? groupQuery.data.fullDatabaseSizeFormatted
    : groups.length ? groups.find((group) => group.sizeBytes === selectedSize)?.sizeFormatted || formatBytes(selectedSize) : '0 B';
  const lastBackup = historyQuery.data?.[0];

  const runBackup = useMutation({
    mutationFn: async () =>
      (
        await api.post<{ success: boolean; data: BackupHistory; message?: string }>('/api/settings/backup/run', {
          groups: selectedGroups,
          destination
        })
      ).data.data,
    onSuccess: (backup) => {
      toast(`Backup created: ${backup.sizeFormatted}`, 'success');
      queryClient.invalidateQueries({ queryKey: ['backup-history'] });
    },
    onError: (error: any) => toast(error.response?.data?.message || 'Backup failed', 'error')
  });

  const saveSchedule = useMutation({
    mutationFn: async () =>
      (
        await api.post<{ success: boolean; data: BackupSchedule }>('/api/settings/backup/schedule', {
          ...schedule,
          destination: schedule.destination || destination,
          groups: schedule.groups?.length ? schedule.groups : selectedGroups
        })
      ).data.data,
    onSuccess: () => {
      toast('Backup schedule saved', 'success');
      queryClient.invalidateQueries({ queryKey: ['backup-schedule'] });
    },
    onError: (error: any) => toast(error.response?.data?.message || 'Schedule save failed', 'error')
  });

  const deleteBackup = useMutation({
    mutationFn: async (id: string) => (await api.delete(`/api/settings/backup/history/${id}`)).data,
    onSuccess: () => {
      toast('Backup deleted', 'success');
      setDeleteTarget(null);
      queryClient.invalidateQueries({ queryKey: ['backup-history'] });
    },
    onError: (error: any) => toast(error.response?.data?.message || 'Delete failed', 'error')
  });

  const resetData = useMutation({
    mutationFn: async () => (await api.post('/api/settings/data/reset')).data,
    onSuccess: () => {
      toast('Testing data reset complete', 'success');
      setResetOpen(false);
      queryClient.invalidateQueries();
    },
    onError: (error: any) => toast(error.response?.data?.message || 'Reset failed', 'error')
  });

  const restoreBackup = useMutation({
    mutationFn: async () => {
      if (!restoreFiles.length) throw new Error('Please select at least one backup file first');
      const formData = new FormData();
      restoreFiles.forEach((file) => formData.append(restoreFiles.length === 1 ? 'backup' : 'backups', file));
      return (await api.post('/api/settings/backup/restore', formData)).data;
    },
    onSuccess: () => {
      toast(restoreFiles.length > 1 ? 'Backups merged. Please login again.' : 'Backup restored. Please login again.', 'success');
      setRestoreOpen(false);
      setRestoreFiles([]);
      queryClient.clear();
      logout();
      navigate('/login', { replace: true });
    },
    onError: (error: any) => toast(error.response?.data?.message || error.message || 'Restore failed', 'error')
  });

  const toggleGroup = (group: BackupGroupKey) => {
    setSelectedGroups((current) => (current.includes(group) ? current.filter((item) => item !== group) : [...current, group]));
  };

  const browseFolder = async () => {
    const folder = await window.electronAPI?.selectFolder?.();
    if (folder) {
      setDestination(folder);
      setSchedule((current) => ({ ...current, destination: folder }));
    }
  };

  const downloadBackup = async (backup: BackupHistory) => {
    const response = await api.get(`/api/settings/backup/download/${backup.id}`, { responseType: 'blob' });
    const url = URL.createObjectURL(response.data);
    const link = document.createElement('a');
    link.href = url;
    link.download = backup.filename;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <section className="mx-auto max-w-6xl space-y-5">
      <div className="rounded-2xl border border-[#ead8bb] bg-[#fffaf0] p-5 shadow-sm">
        <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#c88421]">Settings</p>
            <h1 className="mt-1 font-serif text-3xl font-semibold text-[#0f615d]">Database Backup</h1>
            <p className="mt-2 text-sm text-[#55716d]">Last backup: {formatDate(lastBackup?.createdAt)}</p>
          </div>
          <div className="grid h-14 w-14 place-items-center rounded-2xl bg-[#0f615d] text-white shadow-lg shadow-[#0f615d]/20">
            <DatabaseBackup />
          </div>
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-[1.2fr_0.8fr]">
        <div className="space-y-5">
          <div className="rounded-2xl border border-[#ead8bb] bg-white p-5 shadow-sm">
            <h2 className="font-serif text-xl font-semibold text-[#0f615d]">Data Maintenance</h2>
            <p className="mt-1 text-sm text-[#55716d]">
              Testing ke baad inserted data reset karo, ya saved full database backup se data wapis restore karo.
            </p>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <button
                type="button"
                className="touch inline-flex items-center justify-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 font-semibold text-red-700 transition hover:bg-red-100"
                onClick={() => setResetOpen(true)}
              >
                <RefreshCw size={18} />
                Reset Testing Data
              </button>
              <button
                type="button"
                className="touch inline-flex items-center justify-center gap-2 rounded-xl border border-[#dac197] bg-[#fffaf0] px-4 font-semibold text-[#0f615d] transition hover:bg-[#f1e3cb]"
                onClick={() => {
                  restoreInputRef.current?.click();
                }}
              >
                <UploadCloud size={18} />
                Restore From Backup
              </button>
            </div>
            <input
              ref={restoreInputRef}
              type="file"
              accept=".dump,.sql,.db,.sqlite,.sqlite3"
              multiple
              className="hidden"
              onChange={(event) => {
                const files = Array.from(event.target.files || []);
                setRestoreFiles(files);
                if (files.length) setRestoreOpen(true);
                event.currentTarget.value = '';
              }}
            />
            <div className="mt-4 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              Restore ke liye full database backup file use karein, jaise <span className="font-semibold">eastern-sweets-backup-....dump</span> ya .sql.
              Ek file select karne se database replace hoga. Multiple files select karne se data merge hoga.
            </div>
          </div>

          <div className="rounded-2xl border border-[#ead8bb] bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-serif text-xl font-semibold text-[#0f615d]">Select Accounts/Data to Backup</h2>
              <label className="flex items-center gap-2 text-sm font-semibold text-[#123b39]">
                <input type="checkbox" checked={allSelected} onChange={() => setSelectedGroups(allSelected ? [] : defaultGroups)} />
                Select All
              </label>
            </div>

            <div className="space-y-3">
              {groupQuery.isLoading &&
                [0, 1, 2].map((item) => <div key={item} className="h-20 animate-pulse rounded-xl bg-[#f4ead9]" />)}
              {groups.map((group) => (
                <label key={group.key} className="flex cursor-pointer gap-3 rounded-xl border border-[#ead8bb] bg-[#fffaf0]/70 p-4 transition hover:border-[#c88421]">
                  <input type="checkbox" className="mt-1" checked={selectedGroups.includes(group.key)} onChange={() => toggleGroup(group.key)} />
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center justify-between gap-2 font-semibold text-[#123b39]">
                      {group.label}
                      <span className="rounded-full bg-white px-3 py-1 text-xs text-[#0f615d] shadow-sm">{group.sizeFormatted}</span>
                    </span>
                    <span className="mt-1 block text-sm text-[#55716d]">{group.description}</span>
                  </span>
                </label>
              ))}
            </div>

            {!allSelected && selectedGroups.length > 0 && (
              <div className="mt-4 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                Partial backups may not restore correctly due to foreign key relationships. Full backup is recommended.
              </div>
            )}

            <div className="mt-5 flex flex-col gap-3 rounded-xl bg-[#f6f0e7] p-4 md:flex-row md:items-end md:justify-between">
              <div className="flex-1">
                <label className="text-sm font-semibold text-[#123b39]">Backup Destination</label>
                <div className="mt-2 flex gap-2">
                  <input value={destination} onChange={(event) => setDestination(event.target.value)} className="h-11 flex-1 rounded-xl border border-[#dac197] bg-white px-3 text-sm outline-none focus:border-[#0f615d]" />
                  {window.electronAPI?.isElectron && (
                    <button className="touch inline-flex items-center gap-2 rounded-xl border border-[#dac197] bg-white px-4 font-semibold text-[#0f615d]" onClick={browseFolder}>
                      <FolderOpen size={18} />
                      Browse
                    </button>
                  )}
                </div>
              </div>
              <div className="text-sm font-semibold text-[#123b39]">
                {allSelected ? 'Full Database File Size' : 'Total Selected Size'}: <span className="text-[#0f615d]">{selectedSizeFormatted}</span>
              </div>
            </div>

            <button
              className="mt-5 touch inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#0f615d] px-5 font-semibold text-white shadow-lg shadow-[#0f615d]/20 disabled:opacity-60 md:w-auto"
              disabled={!selectedGroups.length || !destination || runBackup.isPending}
              onClick={() => runBackup.mutate()}
            >
              <HardDrive size={18} />
              {runBackup.isPending ? 'Creating Backup...' : 'Backup Now'}
            </button>
          </div>

          <div className="rounded-2xl border border-[#ead8bb] bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-center gap-2">
              <CalendarClock className="text-[#c88421]" />
              <h2 className="font-serif text-xl font-semibold text-[#0f615d]">Auto Backup Schedule</h2>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <label className="flex items-center gap-3 rounded-xl bg-[#fffaf0] p-4 font-semibold text-[#123b39]">
                <input type="checkbox" checked={schedule.enabled} onChange={(event) => setSchedule((current) => ({ ...current, enabled: event.target.checked }))} />
                Enable automatic backup
              </label>
              <label className="text-sm font-semibold text-[#123b39]">
                Frequency
                <select className="mt-2 h-11 w-full rounded-xl border border-[#dac197] px-3" value={schedule.frequency} onChange={(event) => setSchedule((current) => ({ ...current, frequency: event.target.value as BackupSchedule['frequency'] }))}>
                  <option value="DAILY">Daily</option>
                  <option value="WEEKLY">Weekly</option>
                  <option value="MONTHLY">Monthly</option>
                </select>
              </label>
              {schedule.frequency === 'WEEKLY' && (
                <label className="text-sm font-semibold text-[#123b39]">
                  Day of Week
                  <select className="mt-2 h-11 w-full rounded-xl border border-[#dac197] px-3" value={schedule.dayOfWeek ?? 0} onChange={(event) => setSchedule((current) => ({ ...current, dayOfWeek: Number(event.target.value) }))}>
                    {['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'].map((day, index) => (
                      <option key={day} value={index}>
                        {day}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              {schedule.frequency === 'MONTHLY' && (
                <label className="text-sm font-semibold text-[#123b39]">
                  Day of Month
                  <input type="number" min={1} max={31} className="mt-2 h-11 w-full rounded-xl border border-[#dac197] px-3" value={schedule.dayOfMonth ?? 1} onChange={(event) => setSchedule((current) => ({ ...current, dayOfMonth: Number(event.target.value) }))} />
                </label>
              )}
              <label className="text-sm font-semibold text-[#123b39]">
                Time
                <input type="time" className="mt-2 h-11 w-full rounded-xl border border-[#dac197] px-3" value={schedule.time} onChange={(event) => setSchedule((current) => ({ ...current, time: event.target.value }))} />
              </label>
              <label className="text-sm font-semibold text-[#123b39]">
                Keep Last Backups
                <input type="number" min={1} className="mt-2 h-11 w-full rounded-xl border border-[#dac197] px-3" value={schedule.keepLast} onChange={(event) => setSchedule((current) => ({ ...current, keepLast: Number(event.target.value) }))} />
              </label>
            </div>
            <button className="mt-5 touch inline-flex items-center gap-2 rounded-xl bg-[#c88421] px-5 font-semibold text-white shadow-lg shadow-[#c88421]/20 disabled:opacity-60" disabled={saveSchedule.isPending} onClick={() => saveSchedule.mutate()}>
              <CheckCircle2 size={18} />
              {saveSchedule.isPending ? 'Saving...' : 'Save Schedule'}
            </button>
          </div>
        </div>

        <div className="rounded-2xl border border-[#ead8bb] bg-white p-5 shadow-sm">
          <h2 className="font-serif text-xl font-semibold text-[#0f615d]">Backup History</h2>
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-[#f6f0e7] text-xs uppercase tracking-[0.12em] text-[#55716d]">
                <tr>
                  <th className="px-3 py-3">Date</th>
                  <th className="px-3 py-3">Size</th>
                  <th className="px-3 py-3">Type</th>
                  <th className="px-3 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {historyQuery.isLoading &&
                  [0, 1, 2].map((item) => (
                    <tr key={item}>
                      <td colSpan={4} className="px-3 py-3">
                        <div className="h-7 animate-pulse rounded bg-[#f4ead9]" />
                      </td>
                    </tr>
                  ))}
                {historyQuery.data?.map((backup) => (
                  <tr key={backup.id} className="border-b border-[#f1e3cb] odd:bg-[#fffaf0]/60">
                    <td className="px-3 py-3">{formatDate(backup.createdAt)}</td>
                    <td className="px-3 py-3">{backup.sizeFormatted}</td>
                    <td className="px-3 py-3">
                      <span className="rounded-full bg-[#f1e3cb] px-2 py-1 text-xs font-bold text-[#0f615d]">{backup.type}</span>
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex justify-end gap-2">
                        <button className="grid h-8 w-8 place-items-center rounded-lg border border-[#dac197] text-[#0f615d]" title="Download" onClick={() => downloadBackup(backup)}>
                          <Download size={16} />
                        </button>
                        <button className="grid h-8 w-8 place-items-center rounded-lg border border-red-200 text-red-600" title="Delete" onClick={() => setDeleteTarget(backup)}>
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {!historyQuery.isLoading && !historyQuery.data?.length && (
                  <tr>
                    <td colSpan={4} className="px-3 py-10 text-center text-[#55716d]">
                      No backups created yet
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <ConfirmModal
        isOpen={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => deleteTarget && deleteBackup.mutate(deleteTarget.id)}
        title={`Delete ${deleteTarget?.filename || 'backup'}?`}
        message="This will remove the backup file from disk and cannot be undone."
        isLoading={deleteBackup.isPending}
      />
      <ConfirmModal
        isOpen={resetOpen}
        onClose={() => setResetOpen(false)}
        onConfirm={() => resetData.mutate()}
        title="Reset all testing data?"
        message="Products, customers, sales, orders, inventory, recipes, production, expenses, employees, and journal entries will be cleared. Users, shop settings, chart of accounts, and backup history will be kept."
        confirmLabel="Reset Data"
        danger
        isLoading={resetData.isPending}
      />
      <ConfirmModal
        isOpen={restoreOpen}
        onClose={() => {
          setRestoreOpen(false);
          setRestoreFiles([]);
        }}
        onConfirm={() => restoreBackup.mutate()}
        title="Restore database backup?"
        message={
          restoreFiles.length > 1
            ? `This will merge ${restoreFiles.length} backup files into the current shop database. Existing matching records will be updated, and a safety copy will be kept before merge.`
            : `This will replace the current shop database with ${restoreFiles[0]?.name || 'the selected backup file'}. Current database safety copy will be kept before restore.`
        }
        confirmLabel={restoreFiles.length > 1 ? 'Merge Backups' : 'Restore Backup'}
        danger
        isLoading={restoreBackup.isPending}
      />
    </section>
  );
}

function formatBytes(bytes: number) {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** index;
  return `${value.toFixed(value >= 10 || index === 0 ? 0 : 1)} ${units[index]}`;
}
