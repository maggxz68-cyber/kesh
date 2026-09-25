import React, { useState } from 'react';
import { useAuthStore } from '../store/auth';
import { UserRole } from '../types/auth';
import { Users, UserPlus, Trash2, Shield, User as UserIcon, Crown, AlertTriangle } from 'lucide-react';

export default function AdminPanel() {
  const {
    currentUser,
    users,
    families,
    addUser,
    deleteUser,
    addFamily,
    deleteFamily,
    addMemberToFamily,
    removeMemberFromFamily,
  } = useAuthStore();

  const [showAddUser, setShowAddUser] = useState(false);
  const [showAddFamily, setShowAddFamily] = useState(false);
  const [newUser, setNewUser] = useState({ login: '', password: '', name: '', role: UserRole.USER });
  const [newFamilyName, setNewFamilyName] = useState('');
  const [selectedFamily, setSelectedFamily] = useState<string | null>(null);
  const [newMemberId, setNewMemberId] = useState('');

  if (!currentUser || currentUser.role !== UserRole.SUPER_ADMIN) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <Shield size={48} className="mx-auto mb-4 text-gray-400" />
          <p className="text-gray-500">Доступ запрещён</p>
        </div>
      </div>
    );
  }

  const handleAddUser = () => {
    if (!newUser.login || !newUser.password || !newUser.name) return;
    addUser(newUser);
    setNewUser({ login: '', password: '', name: '', role: UserRole.USER });
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

  const handleRemoveMember = (familyId: string, userId: string) => {
    removeMemberFromFamily(familyId, userId);
  };

  const getRoleBadge = (role: UserRole) => {
    switch (role) {
      case UserRole.SUPER_ADMIN:
        return (
          <span className="text-xs px-2 py-0.5 rounded bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300 flex items-center gap-1">
            <Crown size={10} /> Супер-админ
          </span>
        );
      case UserRole.ADMIN:
        return (
          <span className="text-xs px-2 py-0.5 rounded bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 flex items-center gap-1">
            <Shield size={10} /> Админ
          </span>
        );
      case UserRole.USER:
        return (
          <span className="text-xs px-2 py-0.5 rounded bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300 flex items-center gap-1">
            <UserIcon size={10} /> Пользователь
          </span>
        );
    }
  };

  return (
    <div className="space-y-6 pb-20 lg:pb-0">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold flex items-center gap-2">
          <Shield size={24} /> Панель администратора
        </h2>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-200 dark:border-gray-700">
          <p className="text-xs text-gray-500">Пользователей</p>
          <p className="text-2xl font-bold">{users.length}</p>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-200 dark:border-gray-700">
          <p className="text-xs text-gray-500">Семей</p>
          <p className="text-2xl font-bold">{families.length}</p>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-200 dark:border-gray-700">
          <p className="text-xs text-gray-500">Активный пользователь</p>
          <p className="text-lg font-bold">{currentUser.name}</p>
        </div>
      </div>

      {/* Users management */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold flex items-center gap-2">
            <Users size={18} /> Пользователи
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
                onChange={(e) => setNewUser({ ...newUser, login: e.target.value })}
                className="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700"
              />
              <input
                type="password"
                placeholder="Пароль"
                value={newUser.password}
                onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
                className="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700"
              />
              <input
                type="text"
                placeholder="Имя"
                value={newUser.name}
                onChange={(e) => setNewUser({ ...newUser, name: e.target.value })}
                className="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700"
              />
              <select
                value={newUser.role}
                onChange={(e) => setNewUser({ ...newUser, role: e.target.value as UserRole })}
                className="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700"
              >
                <option value={UserRole.USER}>Пользователь</option>
                <option value={UserRole.ADMIN}>Администратор</option>
                <option value={UserRole.SUPER_ADMIN}>Супер-администратор</option>
              </select>
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
                  Логин: {user.login} · Семей: {user.familyIds.length}
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

      {/* Families management */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold flex items-center gap-2">
            <Users size={18} /> Семьи
          </h3>
          <button
            onClick={() => setShowAddFamily(true)}
            className="px-3 py-2 bg-blue-600 text-white rounded-lg text-sm flex items-center gap-1 hover:bg-blue-700"
          >
            <UserPlus size={16} /> Создать семью
          </button>
        </div>

        {showAddFamily && (
          <div className="mb-4 p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg space-y-3">
            <input
              type="text"
              placeholder="Название семьи"
              value={newFamilyName}
              onChange={(e) => setNewFamilyName(e.target.value)}
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
            const owner = users.find((u) => u.id === family.ownerId);
            const members = users.filter((u) => family.memberIds.includes(u.id));
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
                      Владелец: {owner?.name || 'Неизвестно'} · Участников: {family.memberIds.length}
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
                          <p className="text-xs text-gray-500">{member.login}</p>
                        </div>
                        {member.id !== family.ownerId && (
                          <button
                            onClick={() => handleRemoveMember(family.id, member.id)}
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
                          onChange={(e) => setNewMemberId(e.target.value)}
                          className="flex-1 px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm"
                        >
                          <option value="">Выберите пользователя</option>
                          {users
                            .filter((u) => !family.memberIds.includes(u.id))
                            .map((u) => (
                              <option key={u.id} value={u.id}>
                                {u.name} ({u.login})
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

      {/* Warning */}
      <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-xl p-4">
        <div className="flex items-start gap-2">
          <AlertTriangle size={18} className="text-yellow-600 mt-0.5" />
          <div className="text-sm text-yellow-700 dark:text-yellow-300">
            <p className="font-medium">Внимание!</p>
            <p className="mt-1">
              Удаление пользователей и семей необратимо. Все связанные данные будут потеряны.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
