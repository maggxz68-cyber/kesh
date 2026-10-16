import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client'; // ✅ ИСПРАВЛЕНО: правильный путь к API клиенту
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';

interface StoreData {
  store_name: string;
  total_spent: number;
}

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884D8', '#82CA9D', '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4'];

export function StoreSpendingChart() {
  const { data, isLoading, error } = useQuery<StoreData[]>({
    queryKey: ['reports', 'store-spending', 30],
    queryFn: () => api.get('/reports/store-spending?days=30'),
  });

  if (isLoading) return <div className="p-4 text-center text-slate-500">Загрузка аналитики...</div>;
  if (error || !data || data.length === 0) {
    return (
      <div className="p-4 text-center text-slate-500">
        Нет данных о тратах по магазинам за последние 30 дней.
      </div>
    );
  }

  const chartData = data.map(item => ({
    name: item.store_name.length > 15 ? item.store_name.substring(0, 15) + '...' : item.store_name,
    value: item.total_spent,
    fullName: item.store_name
  }));

  return (
    <div className="h-[300px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={chartData}
            cx="50%"
            cy="50%"
            innerRadius={60}
            outerRadius={100}
            paddingAngle={2}
            dataKey="value"
            label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
          >
            {/* ✅ ИСПРАВЛЕНО: заменили 'entry' на '_', чтобы удовлетворить строгий TypeScript */}
            {chartData.map((_, index) => (
              <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
            ))}
          </Pie>
          <Tooltip 
            formatter={(value: number) => [`${value.toFixed(2)} ₽`, 'Сумма']}
            labelFormatter={(label: string, payload: any) => payload[0]?.payload.fullName || label}
          />
          <Legend />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}
