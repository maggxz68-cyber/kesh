import React, { useState, useRef } from 'react';
import { useAuthStore } from '../store/auth';
import { UserRole } from '../types/auth';
import { downloadBackup, restoreFromBackup, loadBackupFromFile, FullBackup } from '../utils/backup';
import { 
  Users, UserPlus, Trash2, Shield, Crown, AlertTriangle, 
  Home, Edit2, Eye, Settings, Database, BarChart3,
  ChevronRight, LogOut, User, Download, Upload, CheckCircle, XCircle
} from 'lucide-react';

type AdminTab = 'overview' | 'users' | 'families' | 'system' | 'backup';

export default function AdminPanel() {
  const {
    currentUser, users, families,
    addUser, deleteUser, addFamily, deleteFamily,
    addMemberToFamily, removeMemberFromFamily, updateMemberRole, logout
  } = useAuthStore();

  const [activeTab, setActiveTab] = useState<AdminTab>('overview');
  const [showAddUser, setShowAddUser] = useState(false);
  const [showAddFamily, setShowAddFamily] = useState(false);
  const [newUser, setNewUser] = useState({ login: '', password: '', name: '', email: '', role: UserRole.USER });
  const [newFamilyName, setNewFamilyName] = useState('');
  const [selectedFamily, setSelectedFamily] = useState<string | null>(null);
  const [newMemberId, setNewMemberId] = useState('');
  const [backupStatus, setBackupStatus] = useState<{ type: 'success' | 'error', message: string } | null>(null);
  const [showRestoreConfirm, setShowRestoreConfirm] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Проверка прав доступа
  if (!currentUser || currentUser.role !== UserRole.SUPER_ADMIN) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <Shield size={64} className="mx-auto mb-4 text-red-500" />
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">Доступ запрещён</h2>
          <p className="text-gray-500 dark:text-gray-400">Только для супер-администратора</p>
        </div>
      </div>
    );
  }

  const handleAddUser = () => {
    if (!newUser.login || !newUser.password || !newUser.name || !newUser.email) return;
    addUser(newUser);
    setNewUser({ login: '', password: '', name: '', email: '', role: UserRole.USER });
    setShowAddUser(false);
  };

  const handleDeleteUser = (userId: string) => {
    if (confirm('Удалить пользователя? Это действие необратимо.')) {
      deleteUser(userId);
    }
  };

  const handleAddFamily = () => {
    if (!newFamilyName) return;
    addFamily(newFamilyName, currentUser.id);
    setNewFamilyName('');
    setShowAddFamily(false);
  };

  const handleDeleteFamily = (familyId: string) => {
    if (confirm('Удалить семью? Все связанные данные будут потеряны.')) {
      deleteFamily(familyId);
    }
  };

  const handleAddMember = () => {
    if (!selectedFamily || !newMemberId) return;
    addMemberToFamily(selectedFamily, newMemberId);
    setNewMemberId('');
  };

  const handleDownloadBackup = () => {
    try {
      downloadBackup();
      setBackupStatus({ type: 'success', message: '✅ Бэкап успешно создан и скачан' });
      setTimeout(() => setBackupStatus(null), 3000);
    } catch (error) {
      setBackupStatus({ type: 'error', message: '❌ Ошибка создания бэкапа' });
      setTimeout(() => setBackupStatus(null), 3000);
    }
  };

  const handleRestoreBackup = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const backup = await loadBackupFromFile(file);
    if (!backup) {
      setBackupStatus({ type: 'error', message: '❌ Ошибка чтения файла бэкапа' });
      setTimeout(() => setBackupStatus(null), 3000);
      return;
    }

    const success = restoreFromBackup(backup);
    if (success) {
      setBackupStatus({ type: 'success', message: '✅ Данные успешно восстановлены из бэкапа' });
      setTimeout(() => {
        setBackupStatus(null);
        window.location.reload();
      }, 2000);
    } else {
      setBackupStatus({ type: 'error', message: '❌ Ошибка восстановления данных' });
      setTimeout(() => setBackupStatus(null), 3000);
    }

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const tabs = [
    { id: 'overview' as AdminTab, label: 'Обзор', icon: BarChart3 },
    { id: 'users' as AdminTab, label: 'Пользователи', icon: Users },
    { id: 'families' as AdminTab, label: 'Семьи', icon: Home },
    { id: 'backup' as AdminTab, label: 'Бэкап', icon: Database },
    { id: 'system' as AdminTab, label: 'Система', icon: Settings },
  ];

  const getRoleBadge = (role: UserRole) => {
    switch (role) {
      case UserRole.SUPER_ADMIN:
        return <span className="text-xs px-2 py-0.5 rounded bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300 flex items-center gap-1"><Crown size={10} />Супер-админ</span>;
      case UserRole.FAMILY_ADMIN:
        return <span className="text-xs px-2 py-0.5 rounded bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300 flex items-center gap-1"><Shield size={10} />Админ семьи</span>;
      case UserRole.USER:
        return <span className="text-xs px-2 py-0.5 rounded bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300 flex items-center gap-1"><User size={10} />Пользователь</span>;
    }
  };

  return (
    <div className="space-y-6 pb-20 lg:pb-0">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <Shield size={24} className="text-purple-600" />
            Панель администратора
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Управление пользователями, семьями и системой
          </p>
        </div>
        <button
          onClick={logout}
          className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm flex items-center gap-2"
        >
          <LogOut size={16} />
          Выйти
        </button>
      </div>

      {/* Tabs */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-2">
        <div className="flex gap-2">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-lg text-sm font-medium transition-colors ${
                activeTab === tab.id
                  ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300'
                  : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
              }`}
            >
              <tab.icon size={18} />
              <span className="hidden sm:inline">{tab.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Overview Tab */}
      {activeTab === 'overview' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-200 dark:border-gray-700">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900/30">
                  <Users size={20} className="text-blue-600 dark:text-blue-400" />
                </div>
                <div>
                  <p className="text-xs text-gray-500">Пользователей</p>
                  <p className="text-2xl font-bold">{users.length}</p>
                </div>
              </div>
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-200 dark:border-gray-700">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-green-100 dark:bg-green-900/30">
                  <Home size={20} className="text-green-600 dark:text-green-400" />
                </div>
                <div>
                  <p className="text-xs text-gray-500">Семей</p>
                  <p className="text-2xl font-bold">{families.length}</p>
                </div>
              </div>
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-200 dark:border-gray-700">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-purple-100 dark:bg-purple-900/30">
                  <Shield size={20} className="text-purple-600 dark:text-purple-400" />
                </div>
                <div>
                  <p className="text-xs text-gray-500">Ваша роль</p>
                  <p className="text-lg font-bold">Супер-админ</p>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-200 dark:border-gray-700">
            <h3 className="font-semibold mb-3">Последние действия</h3>
            <div className="space-y-2 text-sm text-gray-600 dark:text-gray-400">
              <p>• Система работает в штатном режиме</p>
              <p>• Все пользователи активны</p>
              <p>• Курсы валют обновлены</p>
            </div>
          </div>
        </div>
      )}

      {/* Users Tab */}
      {activeTab === 'users' && (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold flex items-center gap-2">
              <Users size={18} /> Пользователи ({users.length})
            </h3>
            <button
              onClick={() => setShowAddUser(true)}
              className="px-3 py-2 bg-blue-600 text-white rounded-lg text-sm flex items-center gap-1 hover:bg-blue-700"
            >
              <UserPlus size={16} /> Добавить
            </button>
          </div>

          {showAddUser && (
            <div className="mb-4 p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <input
                  type="text"
                  placeholder="Логин"
                  value={newUser.login}
                  onChange={e => setNewUser({ ...newUser, login: e.target.value })}
                  className="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700"
                />
                <input
                  type="email"
                  placeholder="Email"
                  value={newUser.email}
                  onChange={e => setNewUser({ ...newUser, email: e.target.value })}
                  className="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700"
                />
                <input
                  type="password"
                  placeholder="Пароль"
                  value={newUser.password}
                  onChange={e => setNewUser({ ...newUser, password: e.target.value })}
                  className="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700"
                />
                <input
                  type="text"
                  placeholder="Имя"
                  value={newUser.name}
                  onChange={e => setNewUser({ ...newUser, name: e.target.value })}
                  className="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700"
                />
              </div>
              <div className="flex gap-2">
                <button
                  onClick={handleAddUser}
                  className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700"
                >
                  Создать
                </button>
                <button
                  onClick={() => setShowAddUser(false)}
                  className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm"
                >
                  Отмена
                </button>
              </div>
            </div>
          )}

          <div className="space-y-2">
            {users.map((user) => (
              <div
                key={user.id}
                className="flex items-center justify-between p-3 rounded-lg bg-gray-50 dark:bg-gray-700/50 border border-gray-100 dark:border-gray-600"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-sm">{user.name}</p>
                    {getRoleBadge(user.role)}
                  </div>
                  <p className="text-xs text-gray-500 mt-1">
                    @{user.login} · {user.email} · Семей: {user.familyIds.length}
                  </p>
                </div>
                {user.role !== UserRole.SUPER_ADMIN && (
                  <button
                    onClick={() => handleDeleteUser(user.id)}
                    className="p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg"
                  >
                    <Trash2 size={16} />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Families Tab */}
      {activeTab === 'families' && (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold flex items-center gap-2">
              <Home size={18} /> Семьи ({families.length})
            </h3>
            <button
              onClick={() => setShowAddFamily(true)}
              className="px-3 py-2 bg-blue-600 text-white rounded-lg text-sm flex items-center gap-1 hover:bg-blue-700"
            >
              <UserPlus size={16} /> Создать
            </button>
          </div>

          {showAddFamily && (
            <div className="mb-4 p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg space-y-3">
              <input
                type="text"
                placeholder="Название семьи"
                value={newFamilyName}
                onChange={e => setNewFamilyName(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700"
              />
              <div className="flex gap-2">
                <button
                  onClick={handleAddFamily}
                  className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700"
                >
                  Создать
                </button>
                <button
                  onClick={() => setShowAddFamily(false)}
                  className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm"
                >
                  Отмена
                </button>
              </div>
            </div>
          )}

          <div className="space-y-3">
            {families.map((family) => {
              const owner = users.find(u => u.id === family.ownerId);
              const members = users.filter(u => family.memberIds.includes(u.id));
              const isExpanded = selectedFamily === family.id;

              return (
                <div
                  key={family.id}
                  className="border border-gray-200 dark:border-gray-600 rounded-lg overflow-hidden"
                >
                  <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700/50">
                    <div
                      className="flex-1 cursor-pointer"
                      onClick={() => setSelectedFamily(isExpanded ? null : family.id)}
                    >
                      <p className="font-medium text-sm">{family.name}</p>
                      <p className="text-xs text-gray-500 mt-1">
                        Владелец: {owner?.name || '—'} · Участников: {family.memberIds.length}
                      </p>
                    </div>
                    <button
                      onClick={() => handleDeleteFamily(family.id)}
                      className="p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>

                  {isExpanded && (
                    <div className="p-3 space-y-3 border-t border-gray-200 dark:border-gray-600">
                      <p className="text-sm font-medium">Участники:</p>
                      {members.map((member) => (
                        <div
                          key={member.id}
                          className="flex items-center justify-between p-2 rounded bg-white dark:bg-gray-700"
                        >
                          <div>
                            <p className="text-sm">{member.name}</p>
                            <p className="text-xs text-gray-500">{member.email}</p>
                          </div>
                          {member.id !== family.ownerId && (
                            <button
                              onClick={() => removeMemberFromFamily(family.id, member.id)}
                              className="p-1 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded"
                            >
                              <Trash2 size={14} />
                            </button>
                          )}
                        </div>
                      ))}

                      <div className="pt-2 border-t border-gray-200 dark:border-gray-600">
                        <p className="text-sm font-medium mb-2">Добавить участника:</p>
                        <div className="flex gap-2">
                          <select
                            value={newMemberId}
                            onChange={e => setNewMemberId(e.target.value)}
                            className="flex-1 px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm"
                          >
                            <option value="">Выберите пользователя</option>
                            {users
                              .filter(u => !family.memberIds.includes(u.id))
                              .map(u => (
                                <option key={u.id} value={u.id}>
                                  {u.name} ({u.email})
                                </option>
                              ))}
                          </select>
                          <button
                            onClick={handleAddMember}
                            className="px-3 py-2 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700"
                          >
                            Добавить
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Backup Tab */}
      {activeTab === 'backup' && (
        <div className="space-y-4">
          {/* Status message */}
          {backupStatus && (
            <div className={`p-4 rounded-xl flex items-start gap-3 ${
              backupStatus.type === 'success' 
                ? 'bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800'
                : 'bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800'
            }`}>
              {backupStatus.type === 'success' ? (
                <CheckCircle size={20} className="text-green-600 dark:text-green-400 shrink-0 mt-0.5" />
              ) : (
                <XCircle size={20} className="text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
              )}
              <p className={`text-sm ${
                backupStatus.type === 'success' ? 'text-green-700 dark:text-green-300' : 'text-red-700 dark:text-red-300'
              }`}>
                {backupStatus.message}
              </p>
            </div>
          )}

          {/* Download backup */}
          <div className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-200 dark:border-gray-700">
            <h3 className="font-semibold mb-3 flex items-center gap-2">
              <Download size={18} className="text-blue-600" /> Создать бэкап
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
              Создайте полный бэкап всех данных приложения: пользователи, семьи, транзакции, бюджеты, курсы валют и настройки.
            </p>
            <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-3 mb-4">
              <p className="text-xs text-blue-700 dark:text-blue-300 font-medium mb-2">Бэкап включает:</p>
              <ul className="text-xs text-blue-600 dark:text-blue-400 space-y-1">
                <li>• {users.length} пользователей</li>
                <li>• {families.length} семей</li>
                <li>• Все транзакции, бюджеты, категории</li>
                <li>• Курсы валют и настройки</li>
              </ul>
            </div>
            <button
              onClick={handleDownloadBackup}
              className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium flex items-center justify-center gap-2"
            >
              <Download size={18} />
              Скачать бэкап
            </button>
          </div>

          {/* Restore backup */}
          <div className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-200 dark:border-gray-700">
            <h3 className="font-semibold mb-3 flex items-center gap-2">
              <Upload size={18} className="text-green-600" /> Восстановить из бэкапа
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
              Восстановите все данные из ранее созданного бэкапа. 
              <span className="text-red-600 dark:text-red-400 font-medium"> Все текущие данные будут заменены.</span>
            </p>
            
            {!showRestoreConfirm ? (
              <button
                onClick={() => setShowRestoreConfirm(true)}
                className="w-full py-3 bg-orange-600 hover:bg-orange-700 text-white rounded-lg font-medium flex items-center justify-center gap-2"
              >
                <Upload size={18} />
                Восстановить из файла
              </button>
            ) : (
              <div className="space-y-3">
                <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-3">
                  <div className="flex items-start gap-2">
                    <AlertTriangle size={18} className="text-yellow-600 dark:text-yellow-400 shrink-0 mt-0.5" />
                    <div className="text-sm text-yellow-700 dark:text-yellow-300">
                      <p className="font-medium">Внимание!</p>
                      <p className="mt-1">
                        Восстановление из бэкапа полностью заменит все текущие данные. 
                        Рекомендуется создать бэкап текущих данных перед восстановлением.
                      </p>
                    </div>
                  </div>
                </div>
                <div className="flex gap-2">
                  <label className="flex-1">
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".json"
                      onChange={handleRestoreBackup}
                      className="hidden"
                    />
                    <span className="block w-full py-3 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium text-center cursor-pointer">
                      Выбрать файл бэкапа
                    </span>
                  </label>
                  <button
                    onClick={() => setShowRestoreConfirm(false)}
                    className="px-6 py-3 border border-gray-300 dark:border-gray-600 rounded-lg text-sm hover:bg-gray-50 dark:hover:bg-gray-700"
                  >
                    Отмена
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Backup info */}
          <div className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-200 dark:border-gray-700">
            <h3 className="font-semibold mb-3 flex items-center gap-2">
              <Database size={18} className="text-purple-600" /> Информация о бэкапах
            </h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">Формат:</span>
                <span className="font-medium">JSON</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Версия:</span>
                <span className="font-medium">1.0</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Хранение:</span>
                <span className="font-medium">Локально (localStorage)</span>
              </div>
            </div>
            <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
              <p className="text-xs text-gray-500 dark:text-gray-400">
                💡 Рекомендуется регулярно создавать бэкапы, особенно перед важными изменениями.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* System Tab */}
      {activeTab === 'system' && (
        <div className="space-y-4">
          <div className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-200 dark:border-gray-700">
            <h3 className="font-semibold mb-3 flex items-center gap-2">
              <Database size={18} /> Информация о системе
            </h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">Версия:</span>
                <span className="font-medium">5.0</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Хранилище:</span>
                <span className="font-medium">localStorage</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Курсов валют:</span>
                <span className="font-medium">Автоматическое обновление с ЦБ РФ</span>
              </div>
            </div>
          </div>

          <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-xl p-4">
            <div className="flex items-start gap-2">
              <AlertTriangle size={18} className="text-yellow-600 mt-0.5" />
              <div className="text-sm text-yellow-700 dark:text-yellow-300">
                <p className="font-medium">Внимание!</p>
                <p className="mt-1">Удаление пользователей и семей необратимо. Все связанные данные будут потеряны.</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
