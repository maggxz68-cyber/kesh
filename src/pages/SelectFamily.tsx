import React from 'react';
import { useAuthStore } from '../store/auth';
import { Users, ArrowRight } from 'lucide-react';

export default function SelectFamily() {
  const { currentUser, families, setCurrentFamily } = useAuthStore();

  if (!currentUser) return null;

  const userFamilies = families.filter(f => currentUser.familyIds.includes(f.id));

  const handleSelectFamily = (familyId: string) => {
    setCurrentFamily(familyId);
    window.location.href = '/';
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-500 via-purple-500 to-pink-500 p-4">
      <div className="w-full max-w-md">
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl p-8">
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-blue-500 to-purple-600 rounded-2xl mb-4">
              <Users size={32} className="text-white" />
            </div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Выберите семью</h1>
            <p className="text-gray-500 dark:text-gray-400 mt-2">
              Здравствуйте, {currentUser.name}!
            </p>
          </div>

          <div className="space-y-3">
            {userFamilies.map(family => (
              <button
                key={family.id}
                onClick={() => handleSelectFamily(family.id)}
                className="w-full p-4 bg-gray-50 dark:bg-gray-700/50 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg border border-gray-200 dark:border-gray-600 transition-colors flex items-center justify-between group"
              >
                <div className="text-left">
                  <p className="font-semibold text-gray-900 dark:text-white">{family.name}</p>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    {family.memberIds.length} {family.memberIds.length === 1 ? 'участник' : 'участника'}
                  </p>
                </div>
                <ArrowRight size={20} className="text-gray-400 group-hover:text-blue-600 transition-colors" />
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
