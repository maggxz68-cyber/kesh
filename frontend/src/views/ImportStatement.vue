<template>
  <div class="p-6 max-w-6xl mx-auto">
    <h2 class="text-2xl font-bold mb-6 text-gray-800">📥 Импорт банковской выписки</h2>
    
    <div class="border-2 border-dashed border-gray-300 rounded-xl p-8 text-center bg-gray-50 hover:bg-gray-100 transition mb-6">
      <input type="file" @change="handleFileUpload" accept=".csv,.pdf,.xlsx" class="hidden" ref="fileInput" />
      <button @click="$refs.fileInput.click()" class="bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 transition font-medium shadow-sm">
        Выбрать файл выписки
      </button>
      <p v-if="fileName" class="mt-3 text-gray-700 font-medium">📎 Выбран: {{ fileName }}</p>
      <p v-else class="mt-3 text-gray-500 text-sm">Поддерживаются выписки Т-Банка (Тинькофф)</p>
    </div>

    <div v-if="previewData" class="bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden">
      <div class="bg-gray-50 px-6 py-4 border-b border-gray-200 flex flex-wrap justify-between items-center gap-4">
        <div>
          <h3 class="text-lg font-bold text-gray-800">🏦 {{ previewData.bank_name }}</h3>
          <p class="text-sm text-gray-600">
            Найдено: <span class="font-semibold">{{ previewData.total_transactions }}</span> | 
            Доход: <span class="font-semibold text-green-600">+{{ previewData.total_income.toLocaleString('ru-RU') }} ₽</span> | 
            Расход: <span class="font-semibold text-red-600">-{{ previewData.total_expense.toLocaleString('ru-RU') }} ₽</span>
          </p>
        </div>
        <button 
          @click="confirmImport" 
          :disabled="isImporting" 
          class="bg-green-600 text-white px-6 py-2.5 rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition font-medium shadow-sm flex items-center gap-2"
        >
          <span v-if="isImporting"> Сохранение...</span>
          <span v-else>✅ Подтвердить и импортировать</span>
        </button>
      </div>

      <div class="overflow-x-auto max-h-[60vh] overflow-y-auto">
        <table class="min-w-full divide-y divide-gray-200">
          <thead class="bg-gray-50 sticky top-0 z-10">
            <tr>
              <th class="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Дата</th>
              <th class="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Сумма</th>
              <th class="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Контрагент / Описание</th>
              <th class="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Категория</th>
              <th class="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Статус</th>
            </tr>
          </thead>
          <tbody class="bg-white divide-y divide-gray-200">
            <tr v-for="(txn, index) in previewData.transactions" :key="index" :class="{'bg-red-50': txn.is_duplicate}">
              <td class="px-4 py-3 whitespace-nowrap text-sm text-gray-700">{{ formatDate(txn.date) }}</td>
              <td class="px-4 py-3 whitespace-nowrap text-sm font-mono font-semibold" :class="txn.type === 'income' ? 'text-green-600' : 'text-red-600'">
                {{ txn.type === 'income' ? '+' : '-' }}{{ txn.amount.toLocaleString('ru-RU', { minimumFractionDigits: 2 }) }} ₽
              </td>
              <td class="px-4 py-3 text-sm text-gray-700 max-w-xs truncate" :title="txn.description">
                {{ txn.counterparty || txn.description }}
              </td>
              <td class="px-4 py-3 whitespace-nowrap">
                <span class="px-2.5 py-1 text-xs font-medium rounded-full bg-blue-100 text-blue-800">
                  {{ txn.category_hint || 'Без категории' }}
                </span>
              </td>
              <td class="px-4 py-3 whitespace-nowrap">
                <span v-if="txn.is_duplicate" class="text-red-600 text-xs font-bold bg-red-100 px-2 py-1 rounded">⚠️ Дубликат</span>
                <span v-else class="text-green-600 text-xs font-medium bg-green-100 px-2 py-1 rounded">✅ ОК</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'

const fileInput = ref(null)
const fileName = ref('')
const previewData = ref(null)
const isImporting = ref(false)

const formatDate = (dateString) => new Date(dateString).toLocaleDateString('ru-RU')

const handleFileUpload = async (event) => {
  const file = event.target.files[0]
  if (!file) return
  
  fileName.value = file.name
  const formData = new FormData()
  formData.append('file', file)

  try {
    const response = await fetch('/api/imports/preview', {
      method: 'POST',
      body: formData,
      credentials: 'include'
    })
    
    if (!response.ok) {
      const err = await response.json()
      throw new Error(err.detail || 'Ошибка загрузки файла')
    }
    
    previewData.value = await response.json()
  } catch (err) {
    alert('❌ Ошибка при обработке файла: ' + err.message)
    fileName.value = ''
    if (fileInput.value) fileInput.value.value = ''
  }
}

const confirmImport = async () => {
  if (!previewData.value) return
  
  isImporting.value = true
  try {
    const response = await fetch('/api/imports/confirm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ transactions: previewData.value.transactions }),
      credentials: 'include'
    })
    
    if (!response.ok) {
      const err = await response.json()
      throw new Error(err.detail || 'Ошибка сохранения')
    }
    
    const result = await response.json()
    alert(`🎉 ${result.message}\nПропущено дубликатов: ${result.skipped_duplicates}`)
    
    previewData.value = null
    fileName.value = ''
    if (fileInput.value) fileInput.value.value = ''
    
  } catch (err) {
    alert('❌ Ошибка импорта: ' + err.message)
  } finally {
    isImporting.value = false
  }
}
</script>
