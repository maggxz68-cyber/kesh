import React, { useState, useMemo } from 'react';
import { useStore, formatCurrency } from '../store';
import { useAuthStore } from '../store/auth';
import { UserRole } from '../types/auth';
import { TransactionType } from '../types';
import { Users, Shield, UserPlus, Trash2, Edit3, Copy, Check, Crown, Settings } from 'lucide-react';

export default function Family() {
  const { familyMembers, transactions, currentUserId, updateMemberRole, removeFamilyMember, addFamilyMember } = useStore();
  const { currentFamilyId, families, updateMemberRole: updateAuthMemberRole } = useAuthStore();
  const [showInvite, setShowInvite] = useState(false);
  const [inviteForm, setInviteForm] = useState({ name: '', email: '', role: UserRole.USER });
  const [copied, setCopied] = useState(false);

  const memberReports = useMemo(() => {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const map = new Map<string, { income: number; expense: number; count: number }>();
    
    transactions.filter(t => new Date(t.date) >= monthStart).forEach(t => {
      const existing = map.get(t.createdById) || { income: 0, expense: 0, count: 0 };
      if (t.type === TransactionType.INCOME) existing.income += t.amount;
      if (t.type === TransactionType.EXPENSE) existing.expense += t.amount;
      existing.count += 1;
      map.set(t.createdById, existing);
    });
    return map;
  }, [transactions]);

  const currentMember = familyMembers.find(m => m.userId === currentUserId);
  const inviteLink = `https://fintracker.app/invite/tkn_${Date.now().toString(36)}`;

  const handleInvite = () => {
    if (!inviteForm.name.trim() || !inviteForm.email.trim()) return;
    const avatars = ['👨', '👩', '👦', '👧', '🧑', '👴', '👵'];
    const colors = ['#3b82f6', '#ec4899', '#22c55e', '#f59e0b', '#8b5cf6', '#06b6d4'];
    addFamilyMember({
      userId: `user-${Date.now()}`,
      name: inviteForm.name,
      email: inviteForm.email,
      role: inviteForm.role,
      avatar: avatars[Math.floor(Math.random() * avatars.length)],
      color: colors[Math.floor(Math.random() * colors.length)],
    });
    setInviteForm({ name: '', email: '', role: FamilyRole.MEMBER });
    setShowInvite(false);
  };

  const getRoleBadge = (role: FamilyRole) => {
    switch (role) {
      case FamilyRole.OWNER: return <span className="text-xs px-2 py-0.5 rounded bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300 flex items-center gap-1"><Crown size={10} />Владелец</span>;
      case FamilyRole.ADMIN: return <span className="text-xs px-2 py-0.5 rounded bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 flex items-center gap-1"><Shield size={10} />Админ</span>;
      case FamilyRole.MEMBER: return <span className="text-xs px-2 py-0.5 rounded bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300">Участник</span>;
      case FamilyRole.VIEWER: return <span className="text-xs px-2 py-0.5 rounded bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300">Наблюдатель</span>;
    }
  };

  const handleCopyLink = () => {
    navigator.clipboard.writeText(inviteLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-6 pb-20 lg:pb-0">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold flex items-center gap-2">
          <Users size={24} /> Семья Петровых
        </h2>
        <button
          onClick={() => setShowInvite(true)}
          className="px-3 py-2 bg-blue-600 text-white rounded-lg text-sm flex items-center gap-1 hover:bg-blue-700"
        >
          <UserPlus size={16} /> Пригласить
        </button>
      </div>

      {/* Family info */}
      <div className="bg-gradient-to-r from-purple-600 to-pink-600 rounded-xl p-6 text-white">
        <p className="text-sm opacity-80">Семейный аккаунт</p>
        <p className="text-xl font-bold mt-1">Семья Петровых</p>
        <p className="text-sm opacity-80 mt-2">{familyMembers.length} участников · Базовая валюта: RUB</p>
      </div>

      {/* Invite form */}
      {showInvite && (
        <div className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-200 dark:border-gray-700 space-y-4">
          <h3 className="font-semibold">Пригласить участника</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-sm text-gray-500 mb-1 block">Имя *</label>
              <input type="text" value={inviteForm.name} onChange={e => setInviteForm({ ...inviteForm, name: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700" placeholder="Имя Фамилия" />
            </div>
            <div>
              <label className="text-sm text-gray-500 mb-1 block">Email *</label>
              <input type="email" value={inviteForm.email} onChange={e => setInviteForm({ ...inviteForm, email: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700" placeholder="email@example.com" />
            </div>
            <div>
              <label className="text-sm text-gray-500 mb-1 block">Роль</label>
              <select value={inviteForm.role} onChange={e => setInviteForm({ ...inviteForm, role: e.target.value as FamilyRole })}
                className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700">
                <option value={FamilyRole.ADMIN}>Администратор</option>
                <option value={FamilyRole.MEMBER}>Участник</option>
                <option value={FamilyRole.VIEWER}>Наблюдатель</option>
              </select>
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={handleInvite} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700">Отправить приглашение</button>
            <button onClick={() => setShowInvite(false)} className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm">Отмена</button>
          </div>

          {/* Invite link */}
          <div className="pt-3 border-t border-gray-200 dark:border-gray-700">
            <p className="text-sm text-gray-500 mb-2">Или поделитесь ссылкой-приглашением:</p>
            <div className="flex gap-2">
              <input type="text" readOnly value={inviteLink} className="flex-1 px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-sm font-mono" />
              <button onClick={handleCopyLink} className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm flex items-center gap-1 hover:bg-gray-50 dark:hover:bg-gray-700">
                {copied ? <Check size={14} className="text-green-500" /> : <Copy size={14} />}
                {copied ? 'Скопировано' : 'Копировать'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Members list */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
        <h3 className="font-semibold mb-4">Участники семьи</h3>
        <div className="space-y-3">
          {familyMembers.map(member => {
            const report = memberReports.get(member.userId);
            const isCurrentUser = member.userId === currentUserId;
            return (
              <div key={member.id} className={`flex items-center justify-between p-3 rounded-lg border ${isCurrentUser ? 'border-blue-200 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-900/10' : 'border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-700/50'}`}>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full flex items-center justify-center text-xl" style={{ backgroundColor: member.color + '20' }}>
                    {member.avatar}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-sm">{member.name}</p>
                      {isCurrentUser && <span className="text-xs text-blue-600">(вы)</span>}
                    </div>
                    <p className="text-xs text-gray-500">{member.email}</p>
                    <div className="mt-1">{getRoleBadge(member.role)}</div>
                  </div>
                </div>
                <div className="text-right">
                  {report && (
                    <div className="text-xs space-y-0.5">
                      <p className="text-green-600">+{formatCurrency(report.income)}</p>
                      <p className="text-red-600">-{formatCurrency(report.expense)}</p>
                      <p className="text-gray-500">{report.count} операций</p>
                    </div>
                  )}
                  {!isCurrentUser && member.role !== FamilyRole.OWNER && (
                    <div className="flex gap-1 mt-2 justify-end">
                      <select
                        value={member.role}
                        onChange={e => updateMemberRole(member.userId, e.target.value as FamilyRole)}
                        className="text-xs px-2 py-1 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700"
                      >
                        <option value={FamilyRole.ADMIN}>Админ</option>
                        <option value={FamilyRole.MEMBER}>Участник</option>
                        <option value={FamilyRole.VIEWER}>Наблюдатель</option>
                      </select>
                      <button onClick={() => { if (confirm('Удалить участника?')) removeFamilyMember(member.userId); }}
                        className="p-1 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Member report */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
        <h3 className="font-semibold mb-3">Расходы по членам семьи (этот месяц)</h3>
        <div className="space-y-3">
          {familyMembers.map(member => {
            const report = memberReports.get(member.userId) || { income: 0, expense: 0, count: 0 };
            const maxExpense = Math.max(...familyMembers.map(m => memberReports.get(m.userId)?.expense || 0), 1);
            const percentage = (report.expense / maxExpense) * 100;
            return (
              <div key={member.id} className="flex items-center gap-3">
                <span className="text-lg">{member.avatar}</span>
                <div className="flex-1">
                  <div className="flex justify-between mb-1">
                    <span className="text-sm font-medium">{member.name}</span>
                    <span className="text-sm font-semibold text-red-600">{formatCurrency(report.expense)}</span>
                  </div>
                  <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                    <div className="h-2 rounded-full" style={{ width: `${percentage}%`, backgroundColor: member.color }} />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Roles info */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
        <h3 className="font-semibold mb-3">Роли и права</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
          <div className="p-3 rounded-lg bg-yellow-50 dark:bg-yellow-900/10">
            <p className="font-medium flex items-center gap-1"><Crown size={14} className="text-yellow-600" /> Владелец</p>
            <p className="text-xs text-gray-500 mt-1">Полный доступ, управление участниками</p>
          </div>
          <div className="p-3 rounded-lg bg-blue-50 dark:bg-blue-900/10">
            <p className="font-medium flex items-center gap-1"><Shield size={14} className="text-blue-600" /> Администратор</p>
            <p className="text-xs text-gray-500 mt-1">Приглашать, редактировать все операции</p>
          </div>
          <div className="p-3 rounded-lg bg-green-50 dark:bg-green-900/10">
            <p className="font-medium">Участник</p>
            <p className="text-xs text-gray-500 mt-1">Создавать свои операции, видеть общие</p>
          </div>
          <div className="p-3 rounded-lg bg-gray-50 dark:bg-gray-700/50">
            <p className="font-medium">Наблюдатель</p>
            <p className="text-xs text-gray-500 mt-1">Только просмотр данных</p>
          </div>
        </div>
      </div>
    </div>
  );
}
