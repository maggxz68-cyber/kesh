# 📤 Инструкция по работе с GitHub

## 🚀 Быстрый старт

### 1. Создание репозитория на GitHub

1. Перейдите на [github.com](https://github.com)
2. Нажмите кнопку **"New"** (или **"New repository"**)
3. Заполните поля:
   - **Repository name**: `family-budget` (или другое название)
   - **Description**: "Семейный бюджет - онлайн приложение для учёта финансов"
   - **Public** или **Private** (на ваш выбор)
   - ❌ **НЕ ставьте галочку** "Add a README file"
   - ❌ **НЕ ставьте галочку** "Add .gitignore"
   - ❌ **НЕ ставьте галочку** "Choose a license"
4. Нажмите **"Create repository"**

### 2. Инициализация Git локально

```bash
# В корне проекта
./git-init.sh
```

Этот скрипт:
- Инициализирует Git репозиторий
- Добавляет все файлы
- Создаёт первый коммит

### 3. Пуш в GitHub

```bash
# Замените <your-username> на ваш GitHub username
# Замените <repo-name> на название репозитория
./git-push.sh <your-username> <repo-name>
```

Пример:
```bash
./git-push.sh myusername family-budget
```

## 🔄 Обновление кода

### Быстрое обновление

```bash
./git-update.sh
```

Этот скрипт:
- Добавляет все изменённые файлы
- Создаёт коммит с текущей датой и временем
- Пушит изменения в GitHub

### Ручное обновление

```bash
# Добавить изменения
git add .

# Создать коммит
git commit -m "Описание изменений"

# Пуш в GitHub
git push
```

## 🗑️ Полный сброс и пуш

Если нужно полностью перезаписать историю в GitHub:

```bash
# ⚠️ ВНИМАНИЕ: Это удалит всю историю коммитов в GitHub!
./git-reset-push.sh <your-username> <repo-name>
```

Пример:
```bash
./git-reset-push.sh myusername family-budget
```

Этот скрипт:
- Удаляет старую `.git` директорию
- Инициализирует новый Git репозиторий
- Создаёт первый коммит
- Делает force push в GitHub

## 📋 Полезные команды Git

### Просмотр статуса

```bash
# Статус репозитория
git status

# Просмотр логов
git log --oneline

# Просмотр изменений
git diff
```

### Отмена изменений

```bash
# Отменить изменения в файле
git checkout -- <file>

# Отменить последний коммит (сохранить изменения)
git reset --soft HEAD~1

# Отменить последний коммит (удалить изменения)
git reset --hard HEAD~1
```

### Ветки

```bash
# Список веток
git branch

# Создать новую ветку
git checkout -b feature-name

# Переключиться на ветку
git checkout main

# Удалить ветку
git branch -d feature-name
```

### Слияние веток

```bash
# Переключиться на main
git checkout main

# Слить ветку feature-name в main
git merge feature-name

# Пуш в GitHub
git push
```

## 🔐 Аутентификация в GitHub

### Использование HTTPS

При первом пуше GitHub запросит логин и пароль.

**Важно**: GitHub больше не поддерживает аутентификацию по паролю. Используйте Personal Access Token.

#### Создание Personal Access Token

1. Перейдите в [GitHub Settings > Developer settings > Personal access tokens](https://github.com/settings/tokens)
2. Нажмите **"Generate new token"** → **"Generate new token (classic)"**
3. Заполните:
   - **Note**: "family-budget"
   - **Expiration**: выберите срок действия
   - **Select scopes**: отметьте `repo` (полный доступ к репозиториям)
4. Нажмите **"Generate token"**
5. **Скопируйте токен** (он показывается только один раз!)

#### Использование токена

При пуше в GitHub:
- **Username**: ваш GitHub username
- **Password**: вставьте Personal Access Token

#### Сохранение токена

Чтобы не вводить токен каждый раз:

```bash
# Сохранить учётные данные
git config --global credential.helper store

# После этого токен сохранится в ~/.git-credentials
```

### Использование SSH (рекомендуется)

#### Генерация SSH ключа

```bash
# Генерация ключа
ssh-keygen -t ed25519 -C "your_email@example.com"

# Следуйте инструкциям (можно оставить пароль пустым)
```

#### Добавление ключа в SSH агент

```bash
# Запуск SSH агента
eval "$(ssh-agent -s)"

# Добавление ключа
ssh-add ~/.ssh/id_ed25519
```

#### Добавление ключа в GitHub

1. Скопируйте публичный ключ:
```bash
cat ~/.ssh/id_ed25519.pub
```

2. Перейдите в [GitHub Settings > SSH and GPG keys](https://github.com/settings/keys)
3. Нажмите **"New SSH key"**
4. Заполните:
   - **Title**: "My Laptop" (или другое название)
   - **Key**: вставьте скопированный ключ
5. Нажмите **"Add SSH key"**

#### Использование SSH для репозитория

```bash
# Изменить remote URL на SSH
git remote set-url origin git@github.com:<username>/<repo-name>.git

# Пример:
git remote set-url origin git@github.com:myusername/family-budget.git
```

## 📊 Статистика репозитория

### Просмотр статистики на GitHub

Перейдите на страницу репозитория и нажмите **"Insights"**

### Локальная статистика

```bash
# Количество коммитов
git rev-list --count HEAD

# Размер репозитория
du -sh .git

# Список самых больших файлов
git rev-list --objects --all | git cat-file --batch-check='%(objecttype) %(objectname) %(objectsize) %(rest)' | sort --numeric-sort --key=3 --reverse | head -n 10
```

## 🐛 Решение проблем

### Ошибка: "Authentication failed"

**Решение**: Используйте Personal Access Token вместо пароля (см. раздел "Аутентификация в GitHub")

### Ошибка: "Updates were rejected because the remote contains work"

**Решение**:
```bash
# Вариант 1: Pull изменений
git pull --rebase

# Вариант 2: Force push (⚠️ перезапишет изменения в GitHub)
git push -f
```

### Ошибка: "Your branch is ahead of 'origin/main'"

**Решение**:
```bash
git push
```

### Ошибка: "Permission denied (publickey)"

**Решение**:
1. Проверьте что SSH ключ добавлен в GitHub
2. Проверьте что SSH агент запущен:
```bash
eval "$(ssh-agent -s)"
ssh-add ~/.ssh/id_ed25519
```

### Ошибка: "fatal: remote origin already exists"

**Решение**:
```bash
# Удалить старый remote
git remote remove origin

# Добавить новый remote
git remote add origin https://github.com/<username>/<repo-name>.git
```

## 📚 Дополнительные ресурсы

- [GitHub Documentation](https://docs.github.com/)
- [Git Handbook](https://guides.github.com/introduction/git-handbook/)
- [Learn Git Branching](https://learngitbranching.js.org/) - интерактивное обучение

## 💡 Советы

1. **Регулярно делайте коммиты** - лучше много маленьких коммитов, чем один большой
2. **Пишите понятные сообщения коммитов** - описывайте что изменилось и почему
3. **Используйте ветки** для новых функций
4. **Делайте pull перед push** чтобы избежать конфликтов
5. **Не коммитьте чувствительные данные** (пароли, токены, .env файлы)
